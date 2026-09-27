import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describeRemoved, listLines, parseArgs, resolveRef, runHotkeyCommand, runShelfCommand, viewEntries } from '../../src/cli/main.js';
import { Shelves } from '../../src/storage/shelf-store.js';
import { Store } from '../../src/storage/prompt-store.js';
import type { Prompt } from '../../src/storage/prompt-store.js';

describe('parseArgs', () => {
  it('parses agent runs and forwards args', () => {
    expect(parseArgs(['claude', '--resume', 'abc'])).toEqual({ kind: 'run', agent: 'claude', args: ['--resume', 'abc'], record: false });
  });
  it('accepts --record before the agent name', () => {
    expect(parseArgs(['--record', 'codex'])).toEqual({ kind: 'run', agent: 'codex', args: [], record: true });
  });
  it('parses subcommands', () => {
    expect(parseArgs(['list'])).toEqual({ kind: 'list', all: false });
    expect(parseArgs(['add', 'hello', 'world'])).toEqual({ kind: 'add', text: 'hello world' });
    expect(parseArgs(['rm', '2'])).toEqual({ kind: 'rm', ref: '2', all: false });
    expect(parseArgs(['pop'])).toEqual({ kind: 'pop', ref: undefined, all: false });
    expect(parseArgs([])).toEqual({ kind: 'help' });
    expect(parseArgs(['--version'])).toEqual({ kind: 'version' });
  });
  it('parses --all for list, pop and rm in any position', () => {
    expect(parseArgs(['list', '--all'])).toEqual({ kind: 'list', all: true });
    expect(parseArgs(['pop', '--all', '3'])).toEqual({ kind: 'pop', ref: '3', all: true });
    expect(parseArgs(['rm', '2', '--all'])).toEqual({ kind: 'rm', ref: '2', all: true });
  });
  it('parses the hotkey subcommand with and without a spec', () => {
    expect(parseArgs(['hotkey'])).toEqual({ kind: 'hotkey', list: false, spec: undefined });
    expect(parseArgs(['hotkey', 'ctrl+y'])).toEqual({ kind: 'hotkey', list: false, spec: 'ctrl+y' });
    expect(parseArgs(['hotkey', 'list'])).toEqual({ kind: 'hotkey', list: true, spec: undefined });
    expect(parseArgs(['hotkey', 'list', 'f3'])).toEqual({ kind: 'hotkey', list: true, spec: 'f3' });
  });
});

describe('runHotkeyCommand', () => {
  let dir: string;
  let file: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'prompt-shelf-cli-'));
    file = join(dir, 'config.json');
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('prints both hotkeys when no spec is given', async () => {
    expect(await runHotkeyCommand(undefined, file)).toEqual({ code: 0, message: 'hotkey: ctrl+f\nlist hotkey: ctrl+q' });
  });

  it('writes a valid ctrl hotkey and reports it', async () => {
    expect(await runHotkeyCommand('ctrl+y', file)).toEqual({ code: 0, message: 'hotkey set to ctrl+y — takes effect in new sessions' });
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ hotkey: 'ctrl+y' });
    expect(await runHotkeyCommand(undefined, file)).toEqual({ code: 0, message: 'hotkey: ctrl+y\nlist hotkey: ctrl+q' });
  });

  it('accepts the default ctrl+f since no adapter reserves it', async () => {
    expect((await runHotkeyCommand('ctrl+f', file)).code).toBe(0);
  });

  it('accepts function keys and normalises the label', async () => {
    expect(await runHotkeyCommand('F2', file)).toEqual({ code: 0, message: 'hotkey set to f2 — takes effect in new sessions' });
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ hotkey: 'f2' });
  });

  it('rejects an unsupported spec without writing', async () => {
    const result = await runHotkeyCommand('f13', file);
    expect(result.code).toBe(1);
    expect(result.message).toMatch(/unsupported hotkey/i);
    await expect(readFile(file, 'utf8')).rejects.toThrow();
  });

  it('refuses a key reserved by an adapter and names it', async () => {
    const result = await runHotkeyCommand('ctrl+t', file);
    expect(result.code).toBe(1);
    expect(result.message).toContain('claude');
    expect(result.message).toContain('codex');
    await expect(readFile(file, 'utf8')).rejects.toThrow();
  });
  it('shows and sets the list hotkey without touching the stash hotkey', async () => {
    expect(await runHotkeyCommand(undefined, file, true)).toEqual({ code: 0, message: 'list hotkey: ctrl+q' });
    expect(await runHotkeyCommand('f3', file, true)).toEqual({ code: 0, message: 'list hotkey set to f3 — takes effect in new sessions' });
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ listHotkey: 'f3' });
  });

  it('refuses a key already used by the other hotkey', async () => {
    expect((await runHotkeyCommand('ctrl+f', file, true)).code).toBe(1);
    expect((await runHotkeyCommand('ctrl+q', file)).code).toBe(1);
    await expect(readFile(file, 'utf8')).rejects.toThrow();
  });
});

describe('parseArgs shim subcommands', () => {
  it('parses enable, disable and doctor', () => {
    expect(parseArgs(['enable'])).toEqual({ kind: 'enable' });
    expect(parseArgs(['disable'])).toEqual({ kind: 'disable' });
    expect(parseArgs(['doctor'])).toEqual({ kind: 'doctor' });
  });
});

const entry = (id: string, cwd: string): Prompt => ({ id, text: `text ${id}`, agent: 'claude', cwd, createdAt: '2026-09-18T10:00:00Z' });
const mixed = [entry('a', '/work/repo'), entry('b', '/other'), entry('c', '/work/repo/'), entry('d', '/other')];

describe('listLines', () => {
  it('shows only this repo by default with a hint about the rest', () => {
    expect(listLines(mixed, { all: false, cwd: '/work/repo' })).toEqual([
      '1. [claude · /work/repo] text a',
      '2. [claude · /work/repo/] text c',
      '2 more in other repos — stash list --all',
    ]);
  });

  it('shows everything with --all and no hint', () => {
    const lines = listLines(mixed, { all: true, cwd: '/work/repo' });
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe('2. [claude · /other] text b');
  });

  it('omits the hint when nothing is stashed elsewhere', () => {
    expect(listLines([mixed[0]!], { all: false, cwd: '/work/repo' })).toEqual(['1. [claude · /work/repo] text a']);
  });
});

describe('resolveRef', () => {
  it('numbers entries within the printed scope', () => {
    expect(resolveRef(mixed, '2', { all: false, cwd: '/work/repo' }).id).toBe('c');
    expect(resolveRef(mixed, '2', { all: true, cwd: '/work/repo' }).id).toBe('b');
    expect(resolveRef(mixed, undefined, { all: false, cwd: '/other' }).id).toBe('b');
  });

  it('rejects an index outside the scope', () => {
    expect(() => resolveRef(mixed, '3', { all: false, cwd: '/work/repo' })).toThrow('no entry 3 (have 2)');
  });
});

describe('describeRemoved', () => {
  it('shows agent, cwd basename and a flattened 60-char preview', () => {
    expect(describeRemoved({ ...mixed[0]!, text: 'a\nb' })).toBe('removed: [claude · repo] a ⏎ b');
    const long = describeRemoved({ ...mixed[0]!, text: 'x'.repeat(70) });
    expect(long).toBe('removed: [claude · repo] ' + 'x'.repeat(60) + '…');
  });
});

describe('shelf arguments', () => {
  it('parses shelf options and shelf management commands', () => {
    expect(parseArgs(['add', '--shelf', 'Git', 'write', 'a', 'commit'])).toEqual({ kind: 'add', text: 'write a commit', shelf: 'Git' });
    expect(parseArgs(['list', '--shelf', 'Git'])).toEqual({ kind: 'list', all: false, shelf: 'Git' });
    expect(parseArgs(['shelves'])).toEqual({ kind: 'shelves' });
    expect(parseArgs(['shelf', 'new', 'Common'])).toEqual({ kind: 'shelf', action: 'new', names: ['Common'], force: false });
    expect(parseArgs(['shelf', 'star', 'Common'])).toEqual({ kind: 'shelf', action: 'star', names: ['Common'], force: false });
    expect(parseArgs(['shelf', 'rm', 'Git', '--force'])).toEqual({ kind: 'shelf', action: 'rm', names: ['Git'], force: true });
    expect(() => parseArgs(['shelf', 'nope'])).toThrow(/usage/);
    expect(() => parseArgs(['list', '--shelf'])).toThrow(/needs a shelf name/);
  });
});

describe('viewEntries', () => {
  const e = (id: string, extra: Partial<Prompt> = {}): Prompt => ({ id, text: id, agent: 'claude', cwd: '/repo', createdAt: '', ...extra });
  const entries = [e('draft'), e('git-1', { shelf: 'Git' }), e('git-2', { shelf: 'Git' }), e('common', { shelf: 'Common' })];

  it('keeps shelf prompts out of the stash', () => {
    expect(viewEntries(entries, { all: true, cwd: '/repo' }).map((x) => x.id)).toEqual(['draft']);
  });

  it('shows one shelf, matched case-insensitively, from any folder', () => {
    expect(viewEntries(entries, { all: false, shelf: 'git', cwd: '/elsewhere' }).map((x) => x.id)).toEqual(['git-1', 'git-2']);
  });
});

describe('flags belong to their command', () => {
  it('rejects flags a command does not take instead of acting on something else', () => {
    expect(() => parseArgs(['pop', '--shelf', 'Git'])).toThrow(/pop doesn't take --shelf/);
    expect(() => parseArgs(['add', '--all', 'text'])).toThrow(/add doesn't take --all/);
    expect(() => parseArgs(['list', '--nope'])).toThrow(/doesn't take --nope/);
  });

  it('passes everything after the agent name to the agent untouched', () => {
    expect(parseArgs(['claude', '--resume', '--shelf'])).toEqual({ kind: 'run', agent: 'claude', args: ['--resume', '--shelf'], record: false });
  });
});

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
});
