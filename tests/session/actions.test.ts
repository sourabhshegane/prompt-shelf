import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listEffect, pickerEffect, type ActionContext } from '../../src/session/actions.js';
import { Shelves } from '../../src/storage/shelf-store.js';
import { Store } from '../../src/storage/prompt-store.js';

let ctx: ActionContext;
beforeEach(async () => {
  const dir = await mkdtemp(join(tmpdir(), 'actions-'));
  ctx = {
    store: new Store(join(dir, 'stash.jsonl')),
    shelves: new Shelves(join(dir, 'shelves.json')),
    agent: 'claude',
    cwd: '/repo',
    skillPrompt: (name, afterText) => (afterText ? `use ${name} ` : `/${name} `),
  };
});

describe('pickerEffect', () => {
  it('stashes the draft and clears it from the box', async () => {
    expect(await pickerEffect(ctx, { type: 'save' }, 'fix the build')).toEqual({ close: true, clearDraft: true, status: { text: 'stashed (1)' } });
    const [saved] = await ctx.store.list();
    expect(saved).toMatchObject({ text: 'fix the build', agent: 'claude', cwd: '/repo' });
    expect(saved!.shelf).toBeUndefined();
  });

  it('saves to a new shelf, registering it', async () => {
    const effect = await pickerEffect(ctx, { type: 'create-shelf', name: 'Git' }, 'rebase help');
    expect(effect.status).toEqual({ text: 'saved to Git' });
    expect((await ctx.store.list())[0]!.shelf).toBe('Git');
    expect(await ctx.shelves.list()).toContain('Git');
  });

  it('refuses a bad shelf name without saving anything', async () => {
    await expect(pickerEffect(ctx, { type: 'create-shelf', name: 'stash' }, 'x')).rejects.toThrow();
    expect(await ctx.store.list()).toEqual([]);
  });
});

describe('listEffect', () => {
  it('pops a draft: removes it and inserts its text', async () => {
    const prompt = await ctx.store.add({ text: 'later', agent: 'claude', cwd: '/repo' });
    expect(await listEffect(ctx, { type: 'pop', prompt }, false)).toEqual({ close: true, insert: 'later', status: { text: 'popped · 0 left' } });
    expect(await ctx.store.list()).toEqual([]);
  });

  it('uses a saved prompt: keeps it and counts the use', async () => {
    const prompt = await ctx.store.add({ text: 'review', agent: 'claude', cwd: '/repo', shelf: 'Common' });
    const effect = await listEffect(ctx, { type: 'use', prompt }, true);
    expect(effect).toMatchObject({ insert: 'review', status: { text: 'appended · kept on Common' } });
    expect((await ctx.store.list())[0]!.usedCount).toBe(1);
  });

  it('reports, rather than inserts, a prompt another session already removed', async () => {
    const prompt = await ctx.store.add({ text: 'gone', agent: 'claude', cwd: '/repo' });
    await ctx.store.remove(prompt.id);
    for (const type of ['pop', 'use', 'delete'] as const) {
      const effect = await listEffect(ctx, { type, prompt }, false);
      expect(effect.insert).toBeUndefined();
      expect(effect.status?.error).toBe(true);
    }
  });

  it('opens a new empty shelf, or moves the prompt onto it', async () => {
    expect(await listEffect(ctx, { type: 'create-shelf', name: 'Bugs' }, false)).toMatchObject({ showShelf: 'Bugs' });
    const prompt = await ctx.store.add({ text: 'x', agent: 'claude', cwd: '/repo' });
    await listEffect(ctx, { type: 'create-shelf', name: 'Git', prompt }, false);
    expect((await ctx.store.list())[0]!.shelf).toBe('Git');
  });

  it('says so when a shelf is already at the end', async () => {
    const [first] = await ctx.shelves.list();
    expect(await listEffect(ctx, { type: 'move-shelf', shelf: first!, step: -1 }, false)).toEqual({ status: { text: 'already first' } });
  });
});
