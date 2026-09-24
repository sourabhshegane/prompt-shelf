import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { codexAdapter } from '../../src/adapters/codex.js';

const fixture = (name: string) => readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf8').split('\n');
const cursorOnLine = (lines: string[], needle: string) => ({ y: lines.findIndex((l) => l.includes(needle)), x: 0 });

describe('codexAdapter.readDraft', () => {
  it('reads a one-line draft', () => {
    const lines = fixture('codex-oneline.txt');
    expect(codexAdapter.readDraft(lines, cursorOnLine(lines, 'retry'))).toEqual({ text: 'add a retry to the upload client' });
  });

  it('reads a multi-line draft', () => {
    const lines = fixture('codex-multiline.txt');
    expect(codexAdapter.readDraft(lines, cursorOnLine(lines, 'attempt'))).toEqual({
      text: 'add a retry to the upload client\nand also log the attempt count',
    });
  });

  it('returns null when the cursor is not in the input box', () => {
    const lines = fixture('codex-oneline.txt');
    expect(codexAdapter.readDraft(lines, { x: 0, y: 0 })).toBeNull();
  });
});

describe('codexAdapter.unsafeDraft', () => {
  it('flags a collapsed paste placeholder', () => {
    expect(codexAdapter.unsafeDraft.test('see [Pasted Content 12 lines]')).toBe(true);
    expect(codexAdapter.unsafeDraft.test('see [pasted content]')).toBe(true);
    expect(codexAdapter.unsafeDraft.test('plain draft')).toBe(false);
  });
});

describe('codexAdapter.clearDraft', () => {
  it('moves to end then backspaces once per character including newlines', () => {
    const seq = codexAdapter.clearDraft({ text: 'ab\ncd' });
    expect(seq).toBe('\x1b[F' + '\x7f'.repeat(5));
  });
});

describe('codexAdapter.inputTop', () => {
  it('returns the marker row for one-line and multi-line prompts', () => {
    for (const name of ['codex-oneline.txt', 'codex-multiline.txt']) {
      const lines = fixture(name);
      expect(codexAdapter.inputTop(lines)).toBe(lines.findIndex((l) => l.includes('›')));
    }
  });

  it('returns null when there is no marker', () => {
    expect(codexAdapter.inputTop(['working', ''])).toBeNull();
  });
});

describe('codexAdapter.isBorder', () => {
  it('recognises the input box rule', () => {
    expect(codexAdapter.isBorder('╭──────')).toBe(true);
    expect(codexAdapter.isBorder('› draft')).toBe(false);
  });
});
