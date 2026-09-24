import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Store } from '../../src/core/store.js';

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
    expect(raw.trim().split('\n')).toHaveLength(1);
    expect(JSON.parse(raw.trim()).text).toBe('multi\nline');
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

  it('skips corrupt lines instead of throwing', async () => {
    await writeFile(file, '{"id":"1","text":"ok","agent":"claude","cwd":"/","createdAt":"2026-01-01T00:00:00Z"}\nnot json\n');
    const list = await new Store(file).list();
    expect(list).toHaveLength(1);
    expect(list[0]!.text).toBe('ok');
  });
});
