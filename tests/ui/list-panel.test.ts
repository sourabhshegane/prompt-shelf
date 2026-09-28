import { describe, it, expect } from 'vitest';
import { ListPanel, type ListPanelOptions, type Row } from '../../src/ui/list-panel.js';
import { stripAnsi, visibleWidth } from '../../src/terminal/text.js';
import type { Prompt } from '../../src/domain/prompt.js';

const p = (id: string, text: string, extra: Partial<Prompt> = {}): Prompt => ({ id, text, agent: 'claude', cwd: '/repo/' + id, createdAt: '2026-09-18T10:00:00Z', ...extra });
const drafts = [p('1', 'first idea'), p('2', 'second thought'), p('3', 'third\nmultiline')];
// Most tests look at every draft, whichever folder it came from.
const open = (prompts: Prompt[] = drafts, options: Partial<ListPanelOptions> = {}) => new ListPanel(prompts, { hotkeyLabel: 'ctrl+f', cwd: '/', scope: 'all', ...options });
const ids = (o: ListPanel) => o.visible().map((r: Row) => (r.kind === 'prompt' ? r.prompt.id : r.skill.name));
const lines = (o: ListPanel, cols: number, rows: number) => o.render(cols, rows).split('\r\n');

describe('ListPanel keys', () => {
  it('starts on the first draft and pops it on Enter', () => {
    expect(open().handleKey('\r')).toEqual({ type: 'pop', prompt: drafts[0] });
  });

  it('moves with arrows and vim keys, clamped at both ends; a keeps the draft', () => {
    const o = open();
    o.handleKey('\x1b[B');
    o.handleKey('j');
    o.handleKey('j');
    expect(o.handleKey('a')).toEqual({ type: 'use', prompt: drafts[2] });
    o.handleKey('k');
    o.handleKey('\x1b[A');
    o.handleKey('\x1b[A');
    expect(o.handleKey('\r')).toEqual({ type: 'pop', prompt: drafts[0] });
  });

  it('deletes only after y', () => {
    const o = open();
    o.handleKey('d');
    expect(o.handleKey('n')).toEqual({ type: 'none' });
    o.handleKey('d');
    expect(o.handleKey('y')).toEqual({ type: 'delete', prompt: drafts[0] });
  });

  it('searches with /, starts the selection at the top, and Esc clears the search', () => {
    const o = open();
    o.handleKey('j');
    o.handleKey('/');
    o.handleKey('thi');
    expect(ids(o)).toEqual(['3']);
    o.handleKey('\r');
    expect(o.handleKey('\r')).toEqual({ type: 'pop', prompt: drafts[2] });
    o.handleKey('/');
    o.handleKey('x');
    o.handleKey('\x1b');
    expect(ids(o)).toEqual(['1', '2', '3']);
  });

  it('closes on Esc (plain and kitty encodings), q and Ctrl+C', () => {
    for (const key of ['\x1b', '\x1b[27u', 'q', '\x03']) expect(open().handleKey(key)).toEqual({ type: 'close' });
  });

  it('accepts kitty-protocol keys', () => {
    const o = open();
    o.handleKey('\x1b[106u');
    expect(o.handleKey('\x1b[13u')).toEqual({ type: 'pop', prompt: drafts[1] });
  });

  it('handles every key in a chunk: typed letters, a burst of arrows, and a mix', () => {
    const typed = open();
    typed.handleKey('jj');
    expect(typed.handleKey('\r')).toEqual({ type: 'pop', prompt: drafts[2] });
    const arrows = open();
    arrows.handleKey('\x1b[B\x1b[B');
    expect(arrows.handleKey('\r')).toEqual({ type: 'pop', prompt: drafts[2] });
    const mixed = open();
    expect(mixed.handleKey('j\x1b[B')).toEqual({ type: 'none' });
    expect(mixed.handleKey('\r')).toEqual({ type: 'pop', prompt: drafts[2] });
  });

  it('stops at the first key in a chunk that does something', () => {
    const o = open();
    expect(o.handleKey('qj')).toEqual({ type: 'close' });
    expect(o.handleKey('\r')).toEqual({ type: 'pop', prompt: drafts[0] });
  });

  it('keeps the selection after the list shrinks, clamped to the end', () => {
    const o = open();
    o.handleKey('j');
    o.update([drafts[0]!, drafts[2]!]);
    expect(o.handleKey('\r')).toEqual({ type: 'pop', prompt: drafts[2] });
    o.update([drafts[0]!]);
    expect(o.handleKey('\r')).toEqual({ type: 'pop', prompt: drafts[0] });
  });

  it('while ? help is shown, any key only returns to the list', () => {
    for (const key of ['d', 'q', '\r']) {
      const o = open();
      o.handleKey('?');
      expect(o.handleKey(key)).toEqual({ type: 'none' });
    }
  });
});

describe('ListPanel rendering', () => {
  it('renders exactly the rows asked for, with line breaks in a draft shown as ⏎', () => {
    const frame = lines(open(), 60, 8);
    expect(frame).toHaveLength(8);
    expect(frame.join('\n')).toContain('third ⏎ multiline');
  });

  it('never draws a line wider than the terminal, whatever the text contains', () => {
    const tricky = [
      p('wide', '宽字符的提示'.repeat(10)),
      p('emoji', '🚀 ship it '.repeat(10)),
      p('ctrl', 'tab\there\x1b[31mred\x1b[0m and \x07bell '.repeat(5)),
      p('path', 'x'.repeat(200), { cwd: '/very/long/path/' + 'directory-name-'.repeat(4) }),
    ];
    for (const cols of [30, 40, 80]) {
      for (const line of lines(open(tricky), cols, 8)) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(cols);
        expect(stripAnsi(line)).not.toMatch(/[\x00-\x08\x0e-\x1f\x7f]/);
      }
    }
  });

  it('keeps the tab bar within the terminal however many shelves there are', () => {
    const many = Array.from({ length: 15 }, (_, i) => `Shelf ${i}`);
    for (const cols of [40, 60, 120]) expect(visibleWidth(lines(open(drafts, { shelves: many }), cols, 5)[0]!)).toBeLessThanOrEqual(cols);
  });

  it('always keeps the key hints on the last line, even on a tiny terminal', () => {
    for (const rows of [1, 2, 3, 6]) {
      const frame = lines(open(), 80, rows);
      expect(frame).toHaveLength(rows);
      expect(stripAnsi(frame[rows - 1]!)).toContain('esc');
    }
  });

  it('shows a status in place of the key hints', () => {
    const frame = open().render(60, 5, { text: 'stashed (3)' }).split('\r\n');
    expect(stripAnsi(frame[4]!).trim()).toBe('stashed (3)');
  });

  it('shows the position of the selection', () => {
    const o = open();
    o.handleKey('j');
    expect(stripAnsi(lines(o, 80, 6)[1]!)).toMatch(/2\/3$/);
  });

  it('says which key to press when nothing is stashed, and what matched nothing', () => {
    expect(new ListPanel([], { cwd: '/', hotkeyLabel: 'f2' }).render(80, 5)).toContain('f2');
    const o = open();
    o.handleKey('/');
    o.handleKey('zzz');
    expect(o.render(80, 6)).toContain('/zzz');
  });
});

describe('ListPanel repo scope', () => {
  const here = [p('h1', 'local one'), p('h2', 'local two')].map((x) => ({ ...x, cwd: '/work/repo/' }));
  const mixed = [here[0]!, drafts[0]!, here[1]!, drafts[1]!, drafts[2]!];
  const inRepo = (scope?: 'repo' | 'all') => new ListPanel(mixed, { hotkeyLabel: 'ctrl+f', cwd: '/work/repo', ...(scope ? { scope } : {}) });

  it('shows this repo by default and every repo after Tab', () => {
    const o = inRepo();
    expect(o.scope).toBe('repo');
    expect(ids(o)).toEqual(['h1', 'h2']);
    o.handleKey('\t');
    expect(o.scope).toBe('all');
    expect(ids(o)).toHaveLength(5);
    o.handleKey('\t');
    expect(o.scope).toBe('repo');
    expect(inRepo('all').visible()).toHaveLength(5);
  });

  it('clamps the selection when the scope shrinks', () => {
    const o = inRepo('all');
    for (let i = 0; i < 4; i++) o.handleKey('j');
    o.handleKey('\t');
    expect(o.handleKey('\r')).toEqual({ type: 'pop', prompt: here[1] });
  });

  it('searches within the scope', () => {
    const o = inRepo();
    o.handleKey('/');
    o.handleKey('t');
    expect(ids(o)).toEqual(['h2']);
  });

  it('points to Tab, with the count, when only other repos have drafts', () => {
    expect(new ListPanel(drafts, { hotkeyLabel: 'ctrl+f', cwd: '/elsewhere' }).render(80, 4)).toContain('(3)');
  });
});

describe('ListPanel shelves', () => {
  const all = [p('d1', 'a draft', { cwd: '/repo' }), p('c1', 'review this PR', { shelf: 'Common' }), p('c2', 'write tests', { shelf: 'Common' }), p('i1', 'try a cache', { shelf: 'Ideas' })];
  const withShelves = (options: Partial<ListPanelOptions> = {}) => new ListPanel(all, { hotkeyLabel: 'ctrl+f', cwd: '/repo', shelves: ['Ideas', 'Common'], ...options });

  it('has a tab for the stash, skills and each shelf, switched with the arrows', () => {
    const o = withShelves();
    expect(o.tabs().map((t) => (t.kind === 'shelf' ? t.name : t.kind))).toEqual(['stash', 'skills', 'Ideas', 'Common']);
    expect(ids(o)).toEqual(['d1']);
    for (let i = 0; i < 3; i++) o.handleKey('\x1b[C');
    expect(o.tab).toEqual({ kind: 'shelf', name: 'Common' });
    expect(ids(o)).toEqual(['c1', 'c2']);
    o.handleKey('\x1b[C');
    expect(o.tab).toEqual({ kind: 'stash' });
    o.handleKey('\x1b[D');
    expect(o.tab).toEqual({ kind: 'shelf', name: 'Common' });
  });

  it('uses a saved prompt without removing it, stars the shelf with *, and pops a draft', () => {
    const o = withShelves({ tab: { kind: 'shelf', name: 'Common' } });
    expect(o.handleKey('\r')).toEqual({ type: 'use', prompt: all[1] });
    expect(o.handleKey('*')).toEqual({ type: 'star-shelf', shelf: 'Common' });
    const stash = withShelves();
    expect(stash.handleKey('*')).toEqual({ type: 'none' });
    expect(stash.handleKey('\r')).toEqual({ type: 'pop', prompt: all[0] });
  });

  it('marks starred shelves in the tabs', () => {
    const o = withShelves({ shelves: ['Common', 'Ideas'], starredShelves: ['Common'] });
    expect(stripAnsi(lines(o, 120, 6)[0]!)).toContain('★ Common 2');
  });

  it('keeps the current tab in view when the tabs do not fit', () => {
    const many = Array.from({ length: 12 }, (_, i) => `Shelf number ${i}`);
    const o = new ListPanel([], { hotkeyLabel: 'ctrl+f', cwd: '/repo', shelves: many, tab: { kind: 'shelf', name: 'Shelf number 11' } });
    expect(stripAnsi(lines(o, 60, 5)[0]!)).toContain('Shelf number 11');
  });

  it('keeps the tab after an update and falls back to the stash when its shelf is gone', () => {
    const o = withShelves({ tab: { kind: 'shelf', name: 'Common' } });
    o.update(all, ['Common', 'Ideas'], ['Common']);
    expect(o.tab).toEqual({ kind: 'shelf', name: 'Common' });
    o.update(all, []);
    expect(o.tab).toEqual({ kind: 'stash' });
  });

  it('asks to move the current shelf with < and >, and does nothing on the stash', () => {
    const o = withShelves({ tab: { kind: 'shelf', name: 'Common' } });
    expect(o.handleKey('<')).toEqual({ type: 'move-shelf', shelf: 'Common', step: -1 });
    expect(o.handleKey('>')).toEqual({ type: 'move-shelf', shelf: 'Common', step: 1 });
    expect(withShelves().handleKey('<')).toEqual({ type: 'none' });
  });

  it('saves a draft to a picked shelf with s, or to a new shelf with n', () => {
    const o = withShelves();
    o.handleKey('s');
    o.handleKey('\x1b[C');
    expect(o.handleKey('\r')).toEqual({ type: 'save-to-shelf', prompt: all[0], shelf: 'Common' });
    o.handleKey('s');
    o.handleKey('n');
    o.handleKey('Git');
    expect(o.handleKey('\r')).toEqual({ type: 'create-shelf', name: 'Git', prompt: all[0] });
    o.handleKey('n');
    o.handleKey('Bugs');
    expect(o.handleKey('\r')).toEqual({ type: 'create-shelf', name: 'Bugs' });
  });

  it('keeps the picked shelf visible in the save row on a narrow terminal', () => {
    const shelves = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Docs'];
    const o = withShelves({ shelves });
    o.handleKey('s');
    for (let i = 0; i < 6; i++) o.handleKey('\x1b[C');
    expect(stripAnsi(lines(o, 80, 6)[5]!)).toContain('Docs');
  });

  it('sorts a shelf by newest, most used or recently used with o', () => {
    const used = (id: string, count: number, last: string) => p(id, id, { shelf: 'Common', usedCount: count, lastUsedAt: last });
    const o = new ListPanel([used('a', 1, '2026-09-27T10:00:00Z'), used('b', 9, '2026-09-20T10:00:00Z'), used('c', 4, '2026-09-27T12:00:00Z')], {
      cwd: '/r',
      hotkeyLabel: 'ctrl+f',
      shelves: ['Common'],
      tab: { kind: 'shelf', name: 'Common' },
    });
    expect(ids(o)).toEqual(['a', 'b', 'c']);
    o.handleKey('o');
    expect(o.sort).toBe('most-used');
    expect(ids(o)).toEqual(['b', 'c', 'a']);
    expect(stripAnsi(o.render(120, 6))).toContain('used 9×');
    o.handleKey('o');
    expect(ids(o)).toEqual(['c', 'a', 'b']);
  });
});

describe('ListPanel skills', () => {
  const skills = [
    { name: 'catalyst-calendar', description: 'track upcoming positions and events', source: 'project' as const },
    { name: 'position-sizer', description: 'size a trade', source: 'personal' as const },
  ];

  it('lists skills read-only, ranks name matches first, and names the picked one', () => {
    const o = new ListPanel([], { hotkeyLabel: 'ctrl+f', cwd: '/r', skills, tab: { kind: 'skills' } });
    for (const key of ['s', 'a', 'd', '*', '<', '>']) expect(o.handleKey(key)).toEqual({ type: 'none' });
    o.handleKey('/');
    o.handleKey('position');
    o.handleKey('\r');
    expect(ids(o)).toEqual(['position-sizer', 'catalyst-calendar']);
    expect(o.handleKey('\r')).toEqual({ type: 'use-skill', name: 'position-sizer' });
  });
});
