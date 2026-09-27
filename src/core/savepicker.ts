import { splitKeys } from './keys.js';
import { ansi, theme } from './terminal.js';
import { choiceRow, flatten, fitLine, keyHints, TextInput, visibleWidth } from './ui.js';
import type { Status } from './overlay.js';

export type PickerAction =
  | { type: 'none' }
  | { type: 'cancel' }
  /** Save the draft to a shelf, or to the stash when `shelf` is undefined. */
  | { type: 'save'; shelf?: string }
  | { type: 'create-shelf'; name: string };

/**
 * What the stash key shows: where to put the draft. The stash is picked by default, so the hotkey
 * then Enter (or the hotkey twice) parks it; ←→ picks a shelf, n makes a new one.
 */
export class SavePicker {
  private index = 0;
  private naming: TextInput | null = null;

  constructor(
    private readonly draft: string,
    private readonly shelves: string[],
    private readonly starred: string[] = [],
  ) {}

  handleKey(chunk: string): PickerAction {
    for (const key of splitKeys(chunk)) {
      const action = this.handleOne(key);
      if (action.type !== 'none') return action;
    }
    return { type: 'none' };
  }

  /** The hotkey pressed again saves to whatever is picked (not while a name is being typed). */
  confirm(): PickerAction {
    return this.naming ? { type: 'none' } : this.pick();
  }

  private pick(): PickerAction {
    const shelf = this.shelves[this.index - 1];
    return shelf === undefined ? { type: 'save' } : { type: 'save', shelf };
  }

  private handleOne(key: string): PickerAction {
    if (this.naming) {
      const state = this.naming.handle(key);
      const name = this.naming.value.trim();
      if (state === 'editing') return { type: 'none' };
      this.naming = null;
      return state === 'done' && name ? { type: 'create-shelf', name } : { type: 'none' };
    }
    const count = this.shelves.length + 1;
    switch (key) {
      case '\x1b[C':
      case '\t':
        this.index = (this.index + 1) % count;
        return { type: 'none' };
      case '\x1b[D':
        this.index = (this.index - 1 + count) % count;
        return { type: 'none' };
      case '\r':
        return this.pick();
      case 'n':
        this.naming = new TextInput();
        return { type: 'none' };
      case '\x1b':
      case '\x03':
        return { type: 'cancel' };
      default:
        return { type: 'none' };
    }
  }

  render(cols: number, rows: number, status?: Status): string {
    const label = ' Save to:';
    const addNew = `  ${ansi.dim}+ new (${ansi.reset}${ansi.bold}${theme.accent}n${ansi.reset}${ansi.dim})${ansi.reset}`;
    const names = ['Stash', ...this.shelves.map((s) => (this.starred.includes(s) ? `★ ${s}` : s))];
    const places = choiceRow(names, this.index, cols - label.length - visibleWidth(addNew) - 1, (l) => l.replace(/^★/, `${theme.star}★${ansi.reset}`));
    let footer: string;
    if (status) footer = ` ${ansi.bold}${status.error ? theme.error : theme.success}${status.text}${ansi.reset}`;
    else if (this.naming) footer = this.naming.render('new shelf name:', 'enter create · esc back');
    else footer = keyHints([['←→', 'choose'], ['enter', 'save'], ['n', 'new shelf'], ['esc', 'cancel']]);
    const lines = [`${ansi.bold}${label}${ansi.reset}${places}${addNew}`, ` ${ansi.dim}${flatten(this.draft)}${ansi.reset}`].slice(0, Math.max(0, rows - 1));
    while (lines.length < rows - 1) lines.push('');
    if (rows > 0) lines.push(footer);
    return lines.map((l) => ansi.clearLine + fitLine(l, cols)).join('\r\n');
  }
}
