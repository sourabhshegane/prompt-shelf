// Measuring and cutting text by terminal cells: wide characters (CJK, emoji) take two, combining
// marks take none. Used by the panels, the CLI output and the adapters' wrap detection.

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
