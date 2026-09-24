import { describe, it, expect } from 'vitest';
import { Overlay } from '../../src/core/overlay.js';
import type { StashEntry } from '../../src/core/store.js';

const e = (id: string, text: string): StashEntry => ({ id, text, agent: 'claude', cwd: '/repo/' + id, createdAt: '2026-09-18T10:00:00Z' });
const entries = [e('1', 'first idea'), e('2', 'second thought'), e('3', 'third\nmultiline')];

describe('Overlay', () => {
  it('starts on the first entry and pops it on Enter', () => {
    const o = new Overlay(entries);
    expect(o.handleKey('\r')).toEqual({ type: 'pop', entry: entries[0] });
  });

  it('navigates with arrows and vim keys, clamped', () => {
    const o = new Overlay(entries);
    o.handleKey('\x1b[B');
    o.handleKey('j');
    o.handleKey('j');
    expect(o.handleKey('a')).toEqual({ type: 'apply', entry: entries[2] });
    o.handleKey('k');
    o.handleKey('\x1b[A');
    o.handleKey('\x1b[A');
    expect(o.handleKey('\r')).toEqual({ type: 'pop', entry: entries[0] });
  });

  it('requires y to confirm delete', () => {
    const o = new Overlay(entries);
    expect(o.handleKey('d')).toEqual({ type: 'none' });
    expect(o.handleKey('n')).toEqual({ type: 'none' });
    expect(o.handleKey('d')).toEqual({ type: 'none' });
    expect(o.handleKey('y')).toEqual({ type: 'delete', entry: entries[0] });
  });

  it('filters and resets selection', () => {
    const o = new Overlay(entries);
    o.handleKey('j');
    o.handleKey('/');
    for (const ch of 'thi') o.handleKey(ch);
    expect(o.filter).toBe('thi');
    expect(o.visible().map((x) => x.id)).toEqual(['3']);
    o.handleKey('\r');
    expect(o.handleKey('\r')).toEqual({ type: 'pop', entry: entries[2] });
  });

  it('clears the filter on Escape while filtering', () => {
    const o = new Overlay(entries);
    o.handleKey('/');
    o.handleKey('x');
    o.handleKey('\x1b');
    expect(o.filter).toBe('');
    expect(o.visible()).toHaveLength(3);
  });

  it('closes on Escape in both encodings', () => {
    expect(new Overlay(entries).handleKey('\x1b')).toEqual({ type: 'close' });
    expect(new Overlay(entries).handleKey('\x1b[27u')).toEqual({ type: 'close' });
  });

  it('accepts kitty-protocol Enter and plain letters', () => {
    const o = new Overlay(entries);
    o.handleKey('\x1b[106u');
    expect(o.handleKey('\x1b[13u')).toEqual({ type: 'pop', entry: entries[1] });
  });

  it('renders exactly rows lines with the selection highlighted and newlines flattened', () => {
    const frame = new Overlay(entries).render(60, 8);
    const lines = frame.split('\r\n');
    expect(lines).toHaveLength(8);
    expect(frame).toContain('\x1b[7m');
    expect(frame).toContain('third ⏎ multiline');
    expect(frame).toContain('stash · all (3)');
  });

  it('renders an empty state that tells the user how to stash', () => {
    const frame = new Overlay([]).render(80, 5);
    expect(frame).toContain('nothing stashed');
    expect(frame).toContain('ctrl+f');
    expect(new Overlay([], { hotkeyLabel: 'f2' }).render(80, 5)).toContain('press f2');
  });

  it('renders a no-match state when the filter excludes everything', () => {
    const o = new Overlay(entries);
    o.handleKey('/');
    for (const ch of 'zzz') o.handleKey(ch);
    const frame = o.render(80, 6);
    expect(frame).toContain('no matches for /zzz');
    expect(frame).toContain('esc');
  });

  it('shows the selection position in the header', () => {
    const o = new Overlay(entries);
    o.handleKey('j');
    expect(o.render(80, 6)).toContain('2/3');
  });

  it('never renders a visible line wider than cols', () => {
    const long = e('9', 'x'.repeat(200));
    long.cwd = '/very/long/path/' + 'directory-name-'.repeat(4);
    const frame = new Overlay([long, ...entries]).render(40, 6);
    const visible = (s: string) => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
    for (const line of frame.split('\r\n')) expect([...visible(line)].length).toBeLessThanOrEqual(40);
  });

  it('processes several plain keys arriving in one chunk', () => {
    const o = new Overlay(entries);
    o.handleKey('jj');
    expect(o.handleKey('\r')).toEqual({ type: 'pop', entry: entries[2] });
  });

  it('stops processing a chunk once an action is produced', () => {
    const o = new Overlay(entries);
    expect(o.handleKey('qj')).toEqual({ type: 'close' });
    expect(o.handleKey('\r')).toEqual({ type: 'pop', entry: entries[0] });
  });

  it('renders a status in the footer instead of the key hints', () => {
    const lines = new Overlay(entries).render(60, 5, 'stashed (3)').split('\r\n');
    expect(lines[4]).toContain('stashed (3)');
    expect(lines[4]).not.toContain('enter pop');
    expect(new Overlay(entries).render(60, 5).split('\r\n')[4]).toContain('enter pop');
  });

  it('pads the header bar to the full width', () => {
    const visible = (s: string) => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
    const header = new Overlay(entries).render(60, 5).split('\r\n')[0] ?? '';
    expect([...visible(header)].length).toBe(60);
    expect(header).toContain('\x1b[7m');
  });

  it('keeps the selection index after the list shrinks, clamped to the end', () => {
    const o = new Overlay(entries);
    o.handleKey('j');
    o.update([entries[0]!, entries[2]!]);
    expect(o.handleKey('\r')).toEqual({ type: 'pop', entry: entries[2] });
    o.update([entries[0]!]);
    expect(o.handleKey('\r')).toEqual({ type: 'pop', entry: entries[0] });
  });

  it('closes on Ctrl+C', () => {
    expect(new Overlay(entries).handleKey('\x03')).toEqual({ type: 'close' });
  });

  it('keeps the footer visible at the empty-state panel height', () => {
    const lines = new Overlay([]).render(80, 3).split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('nothing stashed');
    expect(lines[2]).toContain('enter pop');
  });
});

describe('Overlay repo scope', () => {
  const here = [e('h1', 'local one'), e('h2', 'local two')].map((x) => ({ ...x, cwd: '/work/repo/' }));
  const mixed = [here[0]!, entries[0]!, here[1]!, entries[1]!, entries[2]!];
  const open = (opts: { scope?: 'repo' | 'all' } = {}) => new Overlay(mixed, { cwd: '/work/repo', ...opts });

  it('defaults to the current repo when a cwd is given', () => {
    const o = open();
    expect(o.scope).toBe('repo');
    expect(o.visible().map((x) => x.id)).toEqual(['h1', 'h2']);
    expect(o.render(80, 6)).toContain('stash · this repo (2 of 5)  1/2');
  });

  it('toggles to all on Tab and back', () => {
    const o = open();
    o.handleKey('\t');
    expect(o.scope).toBe('all');
    expect(o.visible()).toHaveLength(5);
    expect(o.render(80, 8)).toContain('stash · all (5)  1/5');
    o.handleKey('\t');
    expect(o.scope).toBe('repo');
  });

  it('starts in the requested scope', () => {
    expect(open({ scope: 'all' }).visible()).toHaveLength(5);
  });

  it('clamps the selection when the scope shrinks', () => {
    const o = open({ scope: 'all' });
    for (let i = 0; i < 4; i++) o.handleKey('j');
    o.handleKey('\t');
    expect(o.handleKey('\r')).toEqual({ type: 'pop', entry: here[1] });
  });

  it('applies the filter within the scope', () => {
    const o = open();
    o.handleKey('/');
    o.handleKey('t');
    expect(o.visible().map((x) => x.id)).toEqual(['h2']);
    expect(o.render(80, 6)).toContain('(2 of 5)  1/1');
  });

  it('tells the user to tab when this repo is empty but others are not', () => {
    const o = new Overlay(entries, { cwd: '/elsewhere' });
    const frame = o.render(80, 4);
    expect(frame).toContain('nothing stashed here — tab to see all (3)');
    expect(frame).not.toContain('press ctrl+f');
  });

  it('ignores Tab when no cwd was given', () => {
    const o = new Overlay(entries);
    expect(o.scope).toBe('all');
    o.handleKey('\t');
    expect(o.scope).toBe('all');
    expect(o.visible()).toHaveLength(3);
  });
});
