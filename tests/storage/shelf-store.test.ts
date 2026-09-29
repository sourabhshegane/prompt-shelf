import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validName, withOrphans } from '../../src/domain/shelf.js';
import { Shelves } from '../../src/storage/shelf-store.js';
import { Store } from '../../src/storage/prompt-store.js';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'shelves-'));
});

describe('Shelves', () => {
  it('starts with the default shelves, then keeps the users own set in order', async () => {
    const shelves = new Shelves(join(dir, 'shelves.json'));
    expect(await shelves.list()).toEqual(['Ideas', 'To explore', 'Common']);
    await shelves.create('  Git   tips ');
    await shelves.remove('Ideas');
    expect(await shelves.list()).toEqual(['To explore', 'Common', 'Git tips']);
    const file = JSON.parse(await readFile(join(dir, 'shelves.json'), 'utf8'));
    expect(file.version).toBe(2);
    expect(file.starred).toEqual([]);
    expect(file.shelves).toHaveLength(3);
    expect(file.shelves.map((s: any) => s.name)).toEqual(['To explore', 'Common', 'Git tips']);
    expect(file.shelves.every((s: any) => typeof s.id === 'string' && s.id.length > 0)).toBe(true);
  });

  it('never brings the defaults back once the user has removed them all', async () => {
    const shelves = new Shelves(join(dir, 'shelves.json'));
    for (const name of await shelves.list()) await shelves.remove(name);
    expect(await shelves.list()).toEqual([]);
  });

  it('treats names case-insensitively and returns the existing shelf', async () => {
    const shelves = new Shelves(join(dir, 'shelves.json'));
    expect(await shelves.create('common')).toBe('Common');
    expect(await shelves.find('COMMON')).toBe('Common');
    expect(await shelves.list()).toEqual(['Ideas', 'To explore', 'Common']);
  });

  it('renames and removes, refusing clashes and unknown shelves', async () => {
    const shelves = new Shelves(join(dir, 'shelves.json'));
    for (const name of await shelves.list()) await shelves.remove(name);
    await shelves.create('A');
    await shelves.create('B');
    await expect(shelves.rename('A', 'b')).rejects.toThrow(/already exists/);
    expect(await shelves.rename('a', 'C')).toBe('C');
    expect(await shelves.list()).toEqual(['C', 'B']);
    await expect(shelves.remove('nope')).rejects.toThrow(/no shelf/);
    await shelves.remove('C');
    expect(await shelves.list()).toEqual(['B']);
  });

  it('rejects empty, too long and reserved names', () => {
    expect(() => validName('  ')).toThrow(/needs a name/);
    expect(() => validName('x'.repeat(31))).toThrow(/at most 30/);
        expect(() => validName('stash')).toThrow(/reserved/);
    expect(() => validName('Skills')).toThrow(/reserved/);
  });
});

describe('Shelf stars', () => {
  it('lists starred shelves first and keeps stars through rename and remove', async () => {
    const shelves = new Shelves(join(dir, 'shelves.json'));
    expect(await shelves.toggleStar('common')).toBe(true);
    expect(await shelves.list()).toEqual(['Common', 'Ideas', 'To explore']);
    expect(await shelves.starred()).toEqual(['Common']);
    await shelves.rename('Common', 'Everyday');
    expect(await shelves.starred()).toEqual(['Everyday']);
    expect(await shelves.toggleStar('Everyday')).toBe(false);
    expect(await shelves.list()).toEqual(['Ideas', 'To explore', 'Everyday']);
    await shelves.toggleStar('Ideas');
    await shelves.remove('Ideas');
    expect(await shelves.starred()).toEqual([]);
    await expect(shelves.toggleStar('nope')).rejects.toThrow(/no shelf/);
  });
});

describe('Store shelf fields', () => {
  it('saves prompts on a shelf and moves or deletes a whole shelf', async () => {
    const store = new Store(join(dir, 'stash.jsonl'));
    const draft = await store.add({ text: 'draft', agent: 'claude', cwd: '/a' });
    const saved = await store.add({ text: 'review this PR', agent: 'cli', cwd: '/a', shelf: 'Common' });
    expect(draft.shelf).toBeUndefined();
    expect((await store.setShelf(saved.id, 'Ideas'))?.shelf).toBe('Ideas');
    expect(await store.setShelf('missing', 'Ideas')).toBeNull();
    expect(await store.reshelve('ideas', 'Everyday')).toBe(1);
    expect((await store.list()).find((e) => e.id === saved.id)?.shelf).toBe('Everyday');
    expect(await store.reshelve('Everyday', null)).toBe(1);
    expect((await store.list()).map((e) => e.id)).toEqual([draft.id]);
  });
});

describe('Shelf order', () => {
  it('moves a shelf left and right within its group, never across starred ones', async () => {
    const shelves = new Shelves(join(dir, 'shelves.json'));
    await shelves.create('Git');
    expect(await shelves.list()).toEqual(['Ideas', 'To explore', 'Common', 'Git']);
    expect(await shelves.move('Git', -1)).toBe(true);
    expect(await shelves.list()).toEqual(['Ideas', 'To explore', 'Git', 'Common']);
    expect(await shelves.move('Ideas', -1)).toBe(false);
    await shelves.toggleStar('Common');
    expect(await shelves.move('Git', -1)).toBe(true);
    expect(await shelves.move('Git', -1)).toBe(true);
    expect(await shelves.move('Git', -1)).toBe(false);
    expect(await shelves.list()).toEqual(['Common', 'Git', 'Ideas', 'To explore']);
  });
});

describe('Usage', () => {
  it('counts each use and remembers when', async () => {
    const store = new Store(join(dir, 'stash.jsonl'));
    const saved = await store.add({ text: 'review', agent: 'claude', cwd: '/a', shelf: 'Common' });
    await store.markUsed(saved.id, new Date('2026-09-27T10:00:00Z'));
    const after = await store.markUsed(saved.id, new Date('2026-09-27T11:00:00Z'));
    expect(after).toMatchObject({ usedCount: 2, lastUsedAt: '2026-09-27T11:00:00.000Z' });
    expect(await store.markUsed('missing')).toBeNull();
  });
});

describe('Shelves safety', () => {
  it('refuses to touch a damaged shelves file instead of wiping it', async () => {
    const file = join(dir, 'shelves.json');
    const damaged = '{"shelves":["Git","Work"],';
    await writeFile(file, damaged);
    const shelves = new Shelves(file);
    await expect(shelves.list()).rejects.toThrow(/damaged/);
    await expect(shelves.create('New')).rejects.toThrow(/damaged/);
    expect(await readFile(file, 'utf8')).toBe(damaged);
  });

  it('keeps every change when changes happen at the same moment', async () => {
    const shelves = new Shelves(join(dir, 'shelves.json'));
    await Promise.all(['A', 'B', 'C', 'D'].map((n) => shelves.create(n)));
    expect((await shelves.list()).slice(3).sort()).toEqual(['A', 'B', 'C', 'D']);
  });

  it('shows shelves that prompts point at even when the shelf file lost them', () => {
    const p = (shelf?: string) => ({ id: 'x', text: '', agent: '', cwd: '', createdAt: '', ...(shelf ? { shelf } : {}) });
    expect(withOrphans(['Common'], [p('common'), p('Lost'), p(), p('Lost')])).toEqual(['Common', 'Lost']);
  });
});

describe('Shelves file compatibility', () => {
  it('keeps fields it does not know about when it saves', async () => {
    const file = join(dir, 'shelves.json');
    await writeFile(file, JSON.stringify({ shelves: ['Ideas'], starred: [], colors: { Ideas: 'blue' } }));
    await new Shelves(file).create('Git');
    expect(JSON.parse(await readFile(file, 'utf8')).colors).toEqual({ Ideas: 'blue' });
  });
});
