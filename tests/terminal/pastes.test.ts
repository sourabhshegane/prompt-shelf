import { describe, it, expect } from 'vitest';
import { PasteLabels, PasteRecorder, PasteTracker } from '../../src/terminal/pastes.js';
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
  // A paste of n+1 lines, which Claude shows as "+n lines".
  const lines = (tag: string, extra: number) => Array.from({ length: extra + 1 }, (_, i) => `${tag}${i}`).join('\n');

  it('expands a placeholder that appeared after a paste', () => {
    const l = labels();
    expect(l.learn('❯ fix this[Pasted text #1 +3 lines]', ['a\nb\nc\nd'])).toBe(true);
    expect(l.expand('fix this[Pasted text #1 +3 lines] please')).toBe('fix thisa\nb\nc\nd please');
  });

  it('maps a long single-line paste and keeps older numbers', () => {
    const l = labels();
    l.learn('❯ [Pasted text #1 +3 lines]', [lines('a', 3)]);
    l.learn('❯ [Pasted text #1 +3 lines][Pasted text #2]', ['x'.repeat(900)]);
    expect(l.expand('[Pasted text #1 +3 lines] and [Pasted text #2]')).toBe(`${lines('a', 3)} and ${'x'.repeat(900)}`);
  });

  it('gives new numbers to the latest pastes, skipping short ones that got no placeholder', () => {
    const l = labels();
    l.learn('❯ [Pasted text #1 +4 lines][Pasted text #2 +5 lines]', ['short', lines('a', 4), lines('b', 5)]);
    expect(l.expand('[Pasted text #1 +4 lines] [Pasted text #2 +5 lines]')).toBe(`${lines('a', 4)} ${lines('b', 5)}`);
  });

  it('keeps a number it already mapped when the paste still fits it', () => {
    const l = labels();
    l.learn('❯ [Pasted text #1 +4 lines]', [lines('a', 4)]);
    expect(l.learn('❯ [Pasted text #1 +4 lines]', ['unrelated'])).toBe(false);
    expect(l.expand('[Pasted text #1 +4 lines]')).toBe(lines('a', 4));
  });

  it('follows the agent when it starts numbering again, and never returns the old paste', () => {
    const l = labels();
    l.learn('❯ [Pasted text #1 +4 lines]', [lines('old', 4)]);
    // A new session: #1 again, for a different paste.
    expect(l.learn('❯ [Pasted text #1 +2 lines]', [lines('new', 2)])).toBe(true);
    expect(l.expand('[Pasted text #1 +2 lines]')).toBe(lines('new', 2));
    // If the new paste was never seen, refuse instead of guessing.
    const fresh = labels();
    fresh.learn('❯ [Pasted text #1 +4 lines]', [lines('old', 4)]);
    expect(fresh.expand('[Pasted text #1 +2 lines]')).toBeNull();
  });

  it('returns null when a placeholder was never seen being pasted', () => {
    expect(labels().expand('see [Pasted text #7 +2 lines]')).toBeNull();
  });

  it('leaves text without placeholders alone', () => {
    expect(labels().expand('plain draft')).toBe('plain draft');
  });
});

describe('PasteTracker', () => {
  const setup = () => {
    let screen = '❯ still drawing';
    let now = 0;
    const tracker = new PasteTracker(new PasteLabels(claudeAdapter.pasteLabel!), () => screen, () => now);
    return { tracker, show: (s: string) => (screen = s), wait: (ms: number) => (now += ms) };
  };

  it('matches the placeholder whenever it shows up, even after the agent took a while', () => {
    const { tracker, show, wait } = setup();
    tracker.pasted('a\nb\nc');
    tracker.check();
    expect(tracker.waiting).toBe(true);
    wait(3000);
    show('❯ [Pasted text #1 +2 lines]');
    tracker.check();
    expect(tracker.waiting).toBe(false);
    expect(tracker.expand('[Pasted text #1 +2 lines]')).toBe('a\nb\nc');
  });

  it('on the stash key, still matches a paste that has been waiting longer than usual', () => {
    const { tracker, show, wait } = setup();
    tracker.pasted('a\nb');
    wait(60_000);
    show('❯ [Pasted text #1 +1 lines]');
    expect(tracker.expand('[Pasted text #1 +1 lines]')).toBe('a\nb');
  });

  it('stops waiting for pastes that never got a placeholder', () => {
    const { tracker, wait } = setup();
    tracker.pasted('short');
    wait(6000);
    tracker.check();
    expect(tracker.waiting).toBe(false);
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
