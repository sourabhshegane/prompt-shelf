import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { claudeAdapter } from '../../src/adapters/claude.js';

const fixture = (name: string) => readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf8').split('\n');
const cursorOnLine = (lines: string[], needle: string) => ({ y: lines.findIndex((l) => l.includes(needle)), x: 0 });

describe('claudeAdapter.readDraft', () => {
  it('returns null on an idle prompt', () => {
    const lines = fixture('claude-idle.txt');
    const y = lines.findIndex((l) => l.trimEnd() === '>');
    expect(y).toBeGreaterThan(-1);
    expect(claudeAdapter.readDraft(lines, { x: 2, y })).toBeNull();
  });

  it('reads a one-line draft', () => {
    const lines = fixture('claude-oneline.txt');
    expect(claudeAdapter.readDraft(lines, cursorOnLine(lines, 'retry'))).toEqual({ text: 'add a retry to the upload client' });
  });

  it('reads a multi-line draft', () => {
    const lines = fixture('claude-multiline.txt');
    expect(claudeAdapter.readDraft(lines, cursorOnLine(lines, 'attempt'))).toEqual({
      text: 'add a retry to the upload client\nand also log the attempt count',
    });
  });

  it('returns null when the cursor is not in the input box', () => {
    const lines = fixture('claude-oneline.txt');
    expect(claudeAdapter.readDraft(lines, { x: 0, y: 0 })).toBeNull();
  });

  it('ignores a blockquote in agent output above the input box', () => {
    const lines = ['> quoted output line', '', '───────', '> real draft', '───────', '  status'];
    expect(claudeAdapter.readDraft(lines, { x: 0, y: 0 })).toBeNull();
    expect(claudeAdapter.readDraft(lines, { x: 0, y: 3 })).toEqual({ text: 'real draft' });
  });

  it('returns null when the cursor is below the input region', () => {
    const lines = ['───────', '> real draft', '───────', '  status'];
    expect(claudeAdapter.readDraft(lines, { x: 0, y: 3 })).toBeNull();
  });
});

describe('claudeAdapter.readDraft wrapped rows', () => {
  const wrapped = ['───────', '> ' + 'w'.repeat(37), '  tail', '───────', '  status'];

  it('joins a row that filled the terminal width with a space when cols is known', () => {
    expect(claudeAdapter.readDraft(wrapped, { x: 0, y: 2 }, 40)).toEqual({ text: 'w'.repeat(37) + ' tail' });
  });

  it('keeps the newline when the previous row was short or cols is unknown', () => {
    expect(claudeAdapter.readDraft(wrapped, { x: 0, y: 2 })).toEqual({ text: 'w'.repeat(37) + '\ntail' });
    expect(claudeAdapter.readDraft(wrapped, { x: 0, y: 2 }, 80)).toEqual({ text: 'w'.repeat(37) + '\ntail' });
  });
});

describe('claudeAdapter.unsafeDraft', () => {
  it('flags a collapsed paste placeholder', () => {
    expect(claudeAdapter.unsafeDraft.test('fix this [Pasted text #1 +42 lines]')).toBe(true);
    expect(claudeAdapter.unsafeDraft.test('fix the pasted text')).toBe(false);
  });
});

describe('claudeAdapter.clearDraft', () => {
  it('moves to end then backspaces once per character including newlines', () => {
    const seq = claudeAdapter.clearDraft({ text: 'ab\ncd' });
    expect(seq).toBe('\x1b[F' + '\x7f'.repeat(5));
  });
});

describe('claudeAdapter.inputTop', () => {
  it('returns the marker row for idle, one-line and multi-line prompts', () => {
    for (const name of ['claude-idle.txt', 'claude-oneline.txt', 'claude-multiline.txt']) {
      const lines = fixture(name);
      expect(claudeAdapter.inputTop(lines)).toBe(lines.findIndex((l) => l.startsWith('>')));
    }
  });

  it('returns null when there is no marker', () => {
    expect(claudeAdapter.inputTop(['● Working…', '', '  status'])).toBeNull();
  });
});

describe('claudeAdapter.isBorder', () => {
  it('recognises the input box rule', () => {
    expect(claudeAdapter.isBorder('───────')).toBe(true);
    expect(claudeAdapter.isBorder('> draft')).toBe(false);
  });
});
