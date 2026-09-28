import { ansi, theme } from '../terminal/ansi.js';
import { truncateLine, visibleWidth } from '../terminal/text.js';
import type { Status } from './types.js';

// Small pieces shared by the list panel and the save picker.

/** `enter use   / search …`: keys in the accent colour, what they do dimmed. */
export const keyHints = (pairs: [string, string][]): string =>
  ' ' + pairs.map(([k, what]) => `${ansi.bold}${theme.accent}${k}${ansi.reset} ${ansi.dim}${what}${ansi.reset}`).join('   ');

/**
 * A row of choices with the active one highlighted. When they don't fit in `width`, the row
 * starts further right (marked ‹) so the active choice is always visible. `labels` are plain text;
 * `style` can colour an inactive one.
 */
export function choiceRow(labels: string[], active: number, width: number, style: (label: string) => string = (l) => l): string {
  const cells = labels.map((l) => visibleWidth(l) + 2);
  const widthFrom = (from: number) => cells.slice(from).reduce((n, w) => n + w + 1, 1);
  let from = 0;
  while (from < active && widthFrom(from) > width) from++;
  const parts = labels
    .slice(from)
    .map((l, i) => (from + i === active ? `${ansi.reverse}${ansi.bold} ${l} ${ansi.reset}` : ` ${style(l)} `));
  return truncateLine(`${from > 0 ? '‹' : ' '}${parts.join(' ')}`, width);
}

/** A one-line text field, e.g. for a new shelf's name. */
export class TextInput {
  value = '';

  /** Returns 'done' on Enter, 'cancel' on Esc / Ctrl+C, and 'editing' otherwise. */
  handle(key: string): 'done' | 'cancel' | 'editing' {
    if (key === '\r') return 'done';
    if (key === '\x1b' || key === '\x03') return 'cancel';
    if (key === '\x7f') this.value = [...this.value].slice(0, -1).join('');
    else if ([...key].length === 1 && key >= ' ') this.value += key;
    return 'editing';
  }

  render(label: string, hint: string): string {
    return ` ${ansi.bold}${label} ${this.value}▏${ansi.reset}${ansi.dim}   ${hint}${ansi.reset}`;
  }
}

/** A status message in the footer's place: green, or red for an error. */
export const statusLine = (status: Status): string => ` ${ansi.bold}${status.error ? theme.error : theme.success}${status.text}${ansi.reset}`;

/** The `+ new (n)` hint next to a row of shelves. */
export const addNewHint = (): string => `  ${ansi.dim}+ new (${ansi.reset}${ansi.bold}${theme.accent}n${ansi.reset}${ansi.dim})${ansi.reset}`;

/** A panel's frame: exactly `rows` lines cut to `cols`, with `footer` always on the last one. */
export function panelFrame(lines: string[], footer: string, cols: number, rows: number): string {
  const body = lines.slice(0, Math.max(0, rows - 1));
  while (body.length < rows - 1) body.push('');
  if (rows > 0) body.push(footer);
  return body.map((l) => ansi.clearLine + truncateLine(l, cols)).join('\r\n');
}

/** A shelf's name as shown in a row of choices, ★ first when starred. */
export const shelfLabel = (name: string, starred: string[]): string => (starred.includes(name) ? `★ ${name}` : name);

/** Colours the ★ of a label made by `shelfLabel` (for `choiceRow`'s `style`). */
export const styleStar = (label: string): string => label.replace(/^★/, `${theme.star}★${ansi.reset}`);
