import { describe, it, expect } from 'vitest';
import { injectPaste } from '../../src/core/inject.js';

const sink = () => {
  const chunks: string[] = [];
  return { chunks, write: (d: string) => void chunks.push(d) };
};

describe('injectPaste', () => {
  it('wraps text in bracketed paste markers', async () => {
    const s = sink();
    await injectPaste(s, 'hi');
    expect(s.chunks.join('')).toBe('\x1b[200~hi\x1b[201~');
  });

  it('converts newlines to carriage returns', async () => {
    const s = sink();
    await injectPaste(s, 'a\nb');
    expect(s.chunks.join('')).toBe('\x1b[200~a\rb\x1b[201~');
  });

  it('chunks long text without splitting the markers', async () => {
    const s = sink();
    await injectPaste(s, 'x'.repeat(1000), 300);
    expect(s.chunks[0]).toBe('\x1b[200~');
    expect(s.chunks.at(-1)).toBe('\x1b[201~');
    expect(s.chunks.slice(1, -1).every((c) => c.length <= 300)).toBe(true);
    expect(s.chunks.join('')).toBe('\x1b[200~' + 'x'.repeat(1000) + '\x1b[201~');
  });
});
