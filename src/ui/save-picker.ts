import { ansi } from '../terminal/ansi.js';
import { splitKeys } from '../terminal/keys.js';
import { flatten, visibleWidth } from '../terminal/text.js';
import type { Panel, Status } from './types.js';
import { addNewHint, choiceRow, keyHints, panelFrame, shelfLabel, statusLine, styleStar, TextInput } from './widgets.js';

export type PickerAction =
  | { type: 'none' }
  | { type: 'cancel' }
  /** Save the draft to a shelf, or to the stash when `shelf` is undefined. */
  | { type: 'save'; shelf?: string }
  | { type: 'create-shelf'; name: string }
  /** Delete the currently picked shelf. */
  | { type: 'delete-shelf'; shelf: string };

/**
 * What the stash key shows: where to put the draft. The stash is picked by default, so the hotkey
 * then Enter (or the hotkey twice) parks it; ←→ picks a shelf, n makes a new one.
 */
export class SavePicker implements Panel<PickerAction> {
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
      case 'd':
        // Can only delete a shelf, not the stash
        if (this.index > 0) return { type: 'delete-shelf', shelf: this.shelves[this.index - 1]! };
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
    const addNew = addNewHint();
    const names = ['Stash', ...this.shelves.map((s) => shelfLabel(s, this.starred))];
    const places = choiceRow(names, this.index, cols - label.length - visibleWidth(addNew) - 1, styleStar);
    let footer: string;
    if (status) footer = statusLine(status);
    else if (this.naming) footer = this.naming.render('new shelf name:', 'enter create · esc back');
    else {
      const hints: [string, string][] = [['←→', 'choose'], ['enter', 'save'], ['n', 'new shelf']];
      if (this.index > 0) hints.push(['d', 'delete']);
      hints.push(['esc', 'cancel']);
      footer = keyHints(hints);
    }
    return panelFrame([`${ansi.bold}${label}${ansi.reset}${places}${addNew}`, ` ${ansi.dim}${flatten(this.draft)}${ansi.reset}`], footer, cols, rows);
  }
}
