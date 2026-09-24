import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describeRemoved, listLines, parseArgs, resolveRef, runHotkeyCommand } from '../src/cli.js';
import type { StashEntry } from '../src/core/store.js';

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
});

describe('runHotkeyCommand for the list hotkey', () => {
  let dir: string;
  let file: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'prompt-shelf-cli-'));
    file = join(dir, 'config.json');
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

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

const entry = (id: string, cwd: string): StashEntry => ({ id, text: `text ${id}`, agent: 'claude', cwd, createdAt: '2026-09-18T10:00:00Z' });
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
