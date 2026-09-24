import { describe, it, expect } from 'vitest';
import { PasteLabels, PasteRecorder } from '../../src/core/pastes.js';
import { claudeAdapter } from '../../src/adapters/claude.js';
import { codexAdapter } from '../../src/adapters/codex.js';

describe('PasteRecorder', () => {
  it('returns each bracketed paste with newlines normalised', () => {
    const r = new PasteRecorder();
    expect(r.feed('hi \x1b[200~a\rb\r\nc\x1b[201~ there')).toEqual(['a\nb\nc']);
  });

  it('joins a paste that spans several chunks', () => {
    const r = new PasteRecorder();
    expect(r.feed('\x1b[200~one\r')).toEqual([]);
    expect(r.feed('two')).toEqual([]);
    expect(r.feed('\x1b[201~x\x1b[200~three\x1b[201~')).toEqual(['one\ntwo', 'three']);
  });
});

describe('PasteLabels with the Claude placeholder', () => {
  const labels = () => new PasteLabels(claudeAdapter.pasteLabel!);

  it('expands a placeholder that appeared after a paste', () => {
    const l = labels();
    expect(l.learn('❯ fix this[Pasted text #1 +3 lines]', ['a\nb\nc\nd'])).toBe(true);
    expect(l.expand('fix this[Pasted text #1 +3 lines] please')).toBe('fix thisa\nb\nc\nd please');
  });

  it('maps a single-line placeholder and keeps older numbers', () => {
    const l = labels();
    l.learn('❯ [Pasted text #1 +3 lines]', ['first']);
    l.learn('❯ [Pasted text #1 +3 lines][Pasted text #2]', ['second']);
    expect(l.expand('[Pasted text #1 +3 lines] and [Pasted text #2]')).toBe('first and second');
  });

  it('waits until the placeholder shows up, however long the agent takes', () => {
    const l = labels();
    expect(l.learn('❯ still drawing', ['slow paste'])).toBe(false);
    expect(l.learn('❯ [Pasted text #1 +9 lines]', ['slow paste'])).toBe(true);
    expect(l.expand('[Pasted text #1 +9 lines]')).toBe('slow paste');
  });

  it('gives new numbers to the latest pastes, skipping short ones that got no placeholder', () => {
    const l = labels();
    l.learn('❯ [Pasted text #1 +4 lines][Pasted text #2 +5 lines]', ['short', 'long one', 'long two']);
    expect(l.expand('[Pasted text #1 +4 lines] [Pasted text #2 +5 lines]')).toBe('long one long two');
  });

  it('ignores numbers it has already mapped', () => {
    const l = labels();
    l.learn('❯ [Pasted text #1 +4 lines]', ['first']);
    expect(l.learn('❯ [Pasted text #1 +4 lines]', ['unrelated'])).toBe(false);
    expect(l.expand('[Pasted text #1 +4 lines]')).toBe('first');
  });

  it('returns null when a placeholder was never seen being pasted', () => {
    expect(labels().expand('see [Pasted text #7 +2 lines]')).toBeNull();
  });

  it('leaves text without placeholders alone', () => {
    expect(labels().expand('plain draft')).toBe('plain draft');
  });
});

describe('PasteLabels with the Codex placeholder', () => {
  const labels = () => new PasteLabels(codexAdapter.pasteLabel!);

  it('matches a placeholder to the paste with that many characters', () => {
    const l = labels();
    l.remember('short');
    l.remember('x'.repeat(1500));
    expect(l.expand('look at [Pasted Content 1500 chars] ok')).toBe(`look at ${'x'.repeat(1500)} ok`);
  });

  it('maps same-size placeholders to the latest pastes in the order they were made', () => {
    const l = labels();
    l.remember('old'.repeat(400));
    l.remember('a'.repeat(1200));
    l.remember('b'.repeat(1200));
    expect(l.expand('[Pasted Content 1200 chars][Pasted Content 1200 chars]')).toBe('a'.repeat(1200) + 'b'.repeat(1200));
  });

  it('returns null when no paste has that size', () => {
    const l = labels();
    l.remember('x'.repeat(10));
    expect(l.expand('[Pasted Content 1500 chars]')).toBeNull();
  });
});
