import { ansi, theme } from './terminal.js';

// Text and small widgets shared by the list panel and the save picker. Widths are terminal cells:
// wide characters (CJK, emoji) take two, combining marks take none.

const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;
const ANSI_AT_START = /^\x1b\[[0-9;?]*[A-Za-z]/;
const ZERO_WIDTH = /^[\p{Mn}\p{Me}​-‏⁠︎️]$/u;
const WIDE =
  /^[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦\u{1f300}-\u{1f64f}\u{1f900}-\u{1f9ff}\u{20000}-\u{3fffd}]$/u;

export const cellWidth = (ch: string): number => (ZERO_WIDTH.test(ch) ? 0 : WIDE.test(ch) || /\p{Extended_Pictographic}/u.test(ch) ? 2 : 1);

export const stripAnsi = (text: string): string => text.replace(ANSI, '');

export const visibleWidth = (text: string): number => [...stripAnsi(text)].reduce((n, ch) => n + cellWidth(ch), 0);

/** One line for display: newlines become ⏎, tabs spaces, and other control characters (incl. ESC) go. */
export const flatten = (text: string): string =>
  text
    .replace(/\r?\n/g, ' ⏎ ')
    .replace(/\t/g, ' ')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, '');

/** Plain text cut to `width` cells, with … when something was cut. */
export function clip(text: string, width: number): string {
  if (visibleWidth(text) <= width) return text;
  let out = '';
  let used = 0;
  for (const ch of text) {
    const w = cellWidth(ch);
    if (used + w > width - 1) break;
    out += ch;
    used += w;
  }
  return width > 0 ? out + '…' : '';
}

/** A styled line cut to `width` cells; escape sequences are kept and cost nothing. */
export function truncateLine(line: string, width: number): string {
  let out = '';
  let used = 0;
  for (let i = 0; i < line.length; ) {
    const seq = ANSI_AT_START.exec(line.slice(i));
    if (seq) {
      out += seq[0];
      i += seq[0].length;
      continue;
    }
    const ch = String.fromCodePoint(line.codePointAt(i)!);
    const w = cellWidth(ch);
    if (used + w <= width) {
      out += ch;
      used += w;
    }
    i += ch.length;
  }
  return out;
}

/** A styled line cut or padded to exactly `width` cells. */
export const fitLine = (line: string, width: number): string =>
  truncateLine(line, width) + ' '.repeat(Math.max(0, width - visibleWidth(line)));

/** Pads plain text on the right to `width` cells. */
export const padCells = (text: string, width: number): string => text + ' '.repeat(Math.max(0, width - visibleWidth(text)));

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
