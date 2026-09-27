import { describe, it, expect } from 'vitest';
import { SavePicker } from '../../src/core/savepicker.js';

const plain = (text: string) => text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');

describe('SavePicker', () => {
  it('starts on the stash, so enter or the hotkey again just stashes', () => {
    expect(new SavePicker('draft', ['Ideas']).handleKey('\r')).toEqual({ type: 'save' });
    expect(new SavePicker('draft', ['Ideas']).confirm()).toEqual({ type: 'save' });
  });

  it('picks a shelf with the arrows, wrapping around', () => {
    const p = new SavePicker('draft', ['Ideas', 'Common']);
    p.handleKey('\x1b[C');
    p.handleKey('\x1b[C');
    expect(p.handleKey('\r')).toEqual({ type: 'save', shelf: 'Common' });
    const q = new SavePicker('draft', ['Ideas', 'Common']);
    q.handleKey('\x1b[D');
    expect(q.handleKey('\r')).toEqual({ type: 'save', shelf: 'Common' });
  });

  it('creates a new shelf from a typed name, even when typed in one burst', () => {
    const p = new SavePicker('draft', []);
    p.handleKey('n');
    p.handleKey('Git help');
    expect(plain(p.render(80, 4))).toContain('new shelf name: Git help');
    expect(p.handleKey('\r')).toEqual({ type: 'create-shelf', name: 'Git help' });
  });

  it('cancels with esc, and esc while naming only leaves the name', () => {
    const p = new SavePicker('draft', ['Ideas']);
    p.handleKey('n');
    expect(p.handleKey('\x1b')).toEqual({ type: 'none' });
    expect(p.handleKey('\x1b')).toEqual({ type: 'cancel' });
  });

  it('shows the places, the draft and the keys', () => {
    const text = plain(new SavePicker('fix the\nbuild', ['Common'], ['Common']).render(100, 4));
    expect(text).toContain('Save to:');
    expect(text).toContain('Stash');
    expect(text).toContain('★ Common');
    expect(text).toContain('fix the ⏎ build');
    expect(text).toContain('enter save');
  });

  it('keeps the picked shelf visible on a narrow terminal', () => {
    const shelves = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Docs'];
    const p = new SavePicker('draft', shelves);
    p.handleKey('\x1b[D');
    expect(plain(p.render(50, 3).split('\r\n')[0]!)).toContain('Docs');
  });

  it('shows a status in place of the keys', () => {
    const lines = new SavePicker('draft', []).render(80, 3, { text: 'name taken', error: true }).split('\r\n');
    expect(plain(lines[2]!).trim()).toBe('name taken');
  });
});
