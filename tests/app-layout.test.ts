import { describe, it, expect } from 'vitest';
import { panelPlacement, toastRow } from '../src/core/layout.js';

describe('panelPlacement', () => {
  it('sits directly above the input marker with header and footer rows', () => {
    expect(panelPlacement({ rows: 40, inputTop: 30, hasBorderAbove: false, entryCount: 3 })).toEqual({ top: 25, height: 5 });
  });

  it('moves one row up when a border line sits above the marker', () => {
    expect(panelPlacement({ rows: 40, inputTop: 30, hasBorderAbove: true, entryCount: 3 })).toEqual({ top: 24, height: 5 });
  });

  it('falls back near the bottom when the input box is not found', () => {
    expect(panelPlacement({ rows: 40, inputTop: null, hasBorderAbove: false, entryCount: 3 })).toEqual({ top: 31, height: 5 });
  });

  it('falls back when the panel would start above the screen', () => {
    expect(panelPlacement({ rows: 24, inputTop: 2, hasBorderAbove: true, entryCount: 3 })).toEqual({ top: 15, height: 5 });
  });

  it('never exceeds a tiny screen in the fallback branch', () => {
    const { top, height } = panelPlacement({ rows: 6, inputTop: null, hasBorderAbove: false, entryCount: 8 });
    expect(height).toBeLessThanOrEqual(6);
    expect(top + height).toBeLessThanOrEqual(6);
    expect(top).toBeGreaterThanOrEqual(0);
  });

  it('never exceeds a tiny screen when anchored to a low input box', () => {
    const { top, height } = panelPlacement({ rows: 6, inputTop: 5, hasBorderAbove: false, entryCount: 8 });
    expect(height).toBeLessThanOrEqual(6);
    expect(top + height).toBeLessThanOrEqual(6);
    expect(top).toBeGreaterThanOrEqual(0);
  });

  it('caps the height at 10 rows', () => {
    expect(panelPlacement({ rows: 50, inputTop: 40, hasBorderAbove: false, entryCount: 30 })).toEqual({ top: 30, height: 10 });
  });

  it('uses three rows for an empty list', () => {
    expect(panelPlacement({ rows: 40, inputTop: 30, hasBorderAbove: false, entryCount: 0 })).toEqual({ top: 27, height: 3 });
  });
});

describe('toastRow', () => {
  it('uses the row above the marker', () => {
    expect(toastRow({ rows: 40, inputTop: 30, hasBorderAbove: false })).toBe(29);
  });

  it('uses the row above the border when present', () => {
    expect(toastRow({ rows: 40, inputTop: 30, hasBorderAbove: true })).toBe(28);
  });

  it('falls back three rows from the bottom', () => {
    expect(toastRow({ rows: 40, inputTop: null, hasBorderAbove: false })).toBe(37);
    expect(toastRow({ rows: 40, inputTop: 0, hasBorderAbove: false })).toBe(37);
  });
});
