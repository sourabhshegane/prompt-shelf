import { describe, it, expect } from 'vitest';
import { panelPlacement, toastRow } from '../../src/core/layout.js';

describe('panelPlacement', () => {
  it('puts the list panel (full height) directly above the input marker', () => {
    expect(panelPlacement({ rows: 40, inputTop: 30, hasBorderAbove: false })).toEqual({ top: 19, height: 11 });
  });

  it('puts the save picker (3 rows) directly above the input marker', () => {
    expect(panelPlacement({ rows: 40, inputTop: 30, hasBorderAbove: false }, 3)).toEqual({ top: 27, height: 3 });
  });

  it('moves one row up when a border line sits above the marker', () => {
    expect(panelPlacement({ rows: 40, inputTop: 30, hasBorderAbove: true }, 3)).toEqual({ top: 26, height: 3 });
  });

  it('falls back near the bottom when the input box is not found, or the panel would start above the screen', () => {
    expect(panelPlacement({ rows: 40, inputTop: null, hasBorderAbove: false }, 3)).toEqual({ top: 33, height: 3 });
    expect(panelPlacement({ rows: 24, inputTop: 2, hasBorderAbove: true }, 3)).toEqual({ top: 17, height: 3 });
  });

  it('never goes past a tiny screen', () => {
    for (const inputTop of [null, 5]) {
      const { top, height } = panelPlacement({ rows: 6, inputTop, hasBorderAbove: false });
      expect(top).toBeGreaterThanOrEqual(0);
      expect(top + height).toBeLessThanOrEqual(6);
    }
  });
});

describe('toastRow', () => {
  it('uses the row above the marker, or above its border', () => {
    expect(toastRow({ rows: 40, inputTop: 30, hasBorderAbove: false })).toBe(29);
    expect(toastRow({ rows: 40, inputTop: 30, hasBorderAbove: true })).toBe(28);
  });

  it('falls back three rows from the bottom', () => {
    expect(toastRow({ rows: 40, inputTop: null, hasBorderAbove: false })).toBe(37);
    expect(toastRow({ rows: 40, inputTop: 0, hasBorderAbove: false })).toBe(37);
  });
});
