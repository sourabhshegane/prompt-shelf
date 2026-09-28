import { describe, it, expect } from 'vitest';
import { parseArgs } from '../../src/cli/args.js';

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

describe('parseArgs shim subcommands', () => {
  it('parses enable, disable and doctor', () => {
    expect(parseArgs(['enable'])).toEqual({ kind: 'enable' });
    expect(parseArgs(['disable'])).toEqual({ kind: 'disable' });
    expect(parseArgs(['doctor'])).toEqual({ kind: 'doctor' });
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
