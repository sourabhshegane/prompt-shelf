import { describe, it, expect } from 'vitest';
import { Screen } from '../../src/core/screen.js';

describe('Screen', () => {
  it('reflects written text and cursor position', async () => {
    const s = new Screen(20, 5);
    await s.write('hello\r\nworld');
    expect(s.lines()).toEqual(['hello', 'world', '', '', '']);
    expect(s.cursor()).toEqual({ x: 5, y: 1 });
  });

  it('handles cursor positioning escapes', async () => {
    const s = new Screen(20, 5);
    await s.write('\x1b[3;1H> draft');
    expect(s.lines()[2]).toBe('> draft');
    expect(s.cursor()).toEqual({ x: 7, y: 2 });
  });

  it('keeps viewport-relative rows after scrolling', async () => {
    const s = new Screen(10, 3);
    await s.write('a\r\nb\r\nc\r\nd');
    expect(s.lines()).toEqual(['b', 'c', 'd']);
    expect(s.cursor().y).toBe(2);
  });

  it('blanks faint cells with dropDim (placeholder text)', async () => {
    const s = new Screen(40, 2);
    await s.write('› \x1b[2mAsk Codex to do anything\x1b[0m\r\n› typed \x1b[2mhint\x1b[0m');
    expect(s.lines()[0]).toBe('› Ask Codex to do anything');
    expect(s.lines({ dropDim: true })).toEqual(['›', '› typed']);
  });

  it('resizes', async () => {
    const s = new Screen(10, 3);
    s.resize(40, 6);
    expect(s.cols).toBe(40);
    expect(s.lines()).toHaveLength(6);
  });

  it('serializes with attributes', async () => {
    const s = new Screen(10, 2);
    await s.write('\x1b[31mred\x1b[0m');
    expect(s.serialize()).toContain('red');
    expect(s.serialize()).toContain('\x1b[31m');
  });
});
