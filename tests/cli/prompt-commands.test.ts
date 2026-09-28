import { describe, it, expect } from 'vitest';
import type { Prompt } from '../../src/domain/prompt.js';
import { describeRemoved, listLines, resolveRef, viewPrompts } from '../../src/cli/prompt-commands.js';

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
    expect(() => resolveRef(mixed, '3', { all: false, cwd: '/work/repo' })).toThrow('no prompt 3 (have 2)');
  });
});

describe('describeRemoved', () => {
  it('shows agent, cwd basename and a flattened preview of at most 60 cells', () => {
    expect(describeRemoved({ ...mixed[0]!, text: 'a\nb' })).toBe('removed: [claude · repo] a ⏎ b');
    const long = describeRemoved({ ...mixed[0]!, text: 'x'.repeat(70) });
    expect(long).toBe('removed: [claude · repo] ' + 'x'.repeat(59) + '…');
  });
});

describe('viewPrompts', () => {
  const e = (id: string, extra: Partial<Prompt> = {}): Prompt => ({ id, text: id, agent: 'claude', cwd: '/repo', createdAt: '', ...extra });
  const entries = [e('draft'), e('git-1', { shelf: 'Git' }), e('git-2', { shelf: 'Git' }), e('common', { shelf: 'Common' })];

  it('keeps shelf prompts out of the stash', () => {
    expect(viewPrompts(entries, { all: true, cwd: '/repo' }).map((x) => x.id)).toEqual(['draft']);
  });

  it('shows one shelf, matched case-insensitively, from any folder', () => {
    expect(viewPrompts(entries, { all: false, shelf: 'git', cwd: '/elsewhere' }).map((x) => x.id)).toEqual(['git-1', 'git-2']);
  });
});
