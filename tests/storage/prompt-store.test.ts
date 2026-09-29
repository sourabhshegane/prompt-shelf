import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Store } from '../../src/storage/prompt-store.js';

let file: string;
beforeEach(async () => {
  file = join(await mkdtemp(join(tmpdir(), 'stash-')), 'stash.jsonl');
});

describe('Store', () => {
  it('returns an empty list when the file does not exist', async () => {
    expect(await new Store(file).list()).toEqual([]);
  });

  it('adds entries and lists newest first', async () => {
    const store = new Store(file);
    const a = await store.add({ text: 'first', agent: 'claude', cwd: '/a' });
    const b = await store.add({ text: 'second', agent: 'codex', cwd: '/b' });
    const list = await store.list();
    expect(list.map((e) => e.id)).toEqual([b.id, a.id]);
    expect(list[0]).toMatchObject({ text: 'second', agent: 'codex', cwd: '/b' });
    expect(typeof list[0]!.createdAt).toBe('string');
  });

  it('persists one JSON object per line', async () => {
    const store = new Store(file);
    await store.add({ text: 'multi\nline', agent: 'claude', cwd: '/a' });
    const raw = await readFile(file, 'utf8');
    const lines = raw.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!)).toHaveProperty('version');
    expect(JSON.parse(lines[1]!).text).toBe('multi\nline');
  });

  it('removes by id and reports whether something was removed', async () => {
    const store = new Store(file);
    const a = await store.add({ text: 'x', agent: 'claude', cwd: '/a' });
    expect(await store.remove(a.id)).toBe(true);
    expect(await store.remove(a.id)).toBe(false);
    expect(await store.list()).toEqual([]);
  });

  it.skipIf(process.platform === 'win32')('creates the stash directory as owner-only', async () => {
    const nested = join(dirname(file), 'nested', 'stash.jsonl');
    await new Store(nested).add({ text: 'x', agent: 'claude', cwd: '/a' });
    expect((await stat(dirname(nested))).mode & 0o777).toBe(0o700);
  });

  it('skips unreadable lines when listing, and keeps them when rewriting', async () => {
    const ok = '{"id":"1","text":"ok","agent":"claude","cwd":"/","createdAt":"2026-01-01T00:00:00Z"}';
    await writeFile(file, `${ok}\nnot json\nnull\n{"id":2}\n`);
    const store = new Store(file);
    expect((await store.list()).map((e) => e.text)).toEqual(['ok']);
    await store.remove('1');
    const content = await readFile(file, 'utf8');
    const lines = content.trim().split('\n');
    expect(lines[0]).toBe('{"version":2}');
    expect(lines.slice(1).join('\n') + '\n').toBe('not json\nnull\n{"id":2}\n');
  });
});

describe('Store with several sessions', () => {
  it('never loses a prompt added by one session while another rewrites the file', async () => {
    const a = new Store(file);
    const b = new Store(file);
    const seed = await Promise.all(Array.from({ length: 10 }, (_, i) => a.add({ text: `seed ${i}`, agent: 'claude', cwd: '/' })));
    await Promise.all([
      ...seed.map((e) => a.remove(e.id)),
      ...Array.from({ length: 10 }, (_, i) => b.add({ text: `new ${i}`, agent: 'codex', cwd: '/' })),
    ]);
    const texts = (await a.list()).map((e) => e.text).sort();
    expect(texts).toEqual(Array.from({ length: 10 }, (_, i) => `new ${i}`).sort());
  });

  it('counts every use when uses happen at the same moment', async () => {
    const store = new Store(file);
    const saved = await store.add({ text: 'review', agent: 'claude', cwd: '/', shelf: 'Common' });
    await Promise.all(Array.from({ length: 5 }, () => store.markUsed(saved.id)));
    expect((await store.list())[0]!.usedCount).toBe(5);
  });
});
