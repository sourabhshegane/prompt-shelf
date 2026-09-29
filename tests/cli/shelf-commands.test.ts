import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listLines } from '../../src/cli/prompt-commands.js';
import { runShelfCommand, shelfLines } from '../../src/cli/shelf-commands.js';
import { Shelves } from '../../src/storage/shelf-store.js';
import { Store } from '../../src/storage/prompt-store.js';

describe('runShelfCommand', () => {
  let dir: string;
  let shelves: Shelves;
  let store: Store;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'prompt-shelf-shelf-cmd-'));
    shelves = new Shelves(join(dir, 'shelves.json'));
    store = new Store(join(dir, 'stash.jsonl'));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));
  const cmd = (action: 'new' | 'rename' | 'rm' | 'star', names: string[], force = false) => runShelfCommand({ action, names, force }, shelves, store);

  it('only deletes a shelf with prompts when told to, and then deletes its prompts too', async () => {
    await store.add({ text: 'keep me', agent: 'cli', cwd: '/', shelf: 'Common' });
    await store.add({ text: 'draft', agent: 'cli', cwd: '/' });
    await expect(cmd('rm', ['common'])).rejects.toThrow(/--force/);
    expect(await shelves.list()).toContain('Common');
    await cmd('rm', ['Common'], true);
    expect(await shelves.list()).not.toContain('Common');
    expect((await store.list()).map((e) => e.text)).toEqual(['draft']);
  });

  it('renames a shelf and moves its prompts along', async () => {
    await store.add({ text: 'review', agent: 'cli', cwd: '/', shelf: 'Common' });
    await cmd('rename', ['Common', 'Everyday']);
    expect(await shelves.list()).toContain('Everyday');
    expect((await store.list())[0]!.shelf).toBe('Everyday');
  });

  it('can still star and list a shelf that only prompts point at', async () => {
    await store.add({ text: 'lost', agent: 'cli', cwd: '/', shelf: 'Lost' });
    await cmd('star', ['lost']);
    expect(await shelves.starred()).toEqual(['Lost']);
    expect(listLines(await store.list(), { all: false, shelf: 'Lost', cwd: '/' })[0]).toContain('lost');
  });

  it('reports what it did, and lists shelves with counts, starred first', async () => {
    await store.add({ text: 'x', agent: 'cli', cwd: '/', shelf: 'Common' });
    expect(await cmd('new', ['Git'])).toBe('shelf Git is ready');
    expect(await cmd('star', ['common'])).toBe('starred Common');
    expect(await shelfLines(shelves, store)).toEqual(['★ Common (1)', '  Ideas (0)', '  To explore (0)', '  Git (0)']);
  });
});
