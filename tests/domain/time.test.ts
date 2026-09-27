import { describe, it, expect } from 'vitest';
import { ago, localTime } from '../../src/domain/time.js';

describe('ago', () => {
  const now = new Date('2026-09-27T12:00:00Z');
  it('describes recent times briefly', () => {
    expect(ago('2026-09-27T11:59:30Z', now)).toBe('just now');
    expect(ago('2026-09-27T11:55:00Z', now)).toBe('5m ago');
    expect(ago('2026-09-27T09:00:00Z', now)).toBe('3h ago');
    expect(ago('2026-09-25T12:00:00Z', now)).toBe('2d ago');
    expect(ago(undefined, now)).toBe('');
  });
  it('shows a date after a week, with the year only when it differs', () => {
    expect(ago('2026-09-01T12:00:00Z', now)).toMatch(/^Sep 1$|^1 Sep$/);
    expect(ago('2025-09-01T12:00:00Z', now)).toMatch(/2025/);
  });
});

describe('localTime', () => {
  it('formats a stored time, and ignores bad input', () => {
    expect(localTime('2026-09-27T10:12:00Z')).toMatch(/2026/);
    expect(localTime('nonsense')).toBe('');
    expect(localTime(undefined)).toBe('');
  });
});
