export const ansi = {
  hideCursor: '\x1b[?25l',
  showCursor: '\x1b[?25h',
  clearScreen: '\x1b[2J',
  home: '\x1b[H',
  moveTo: (row: number, col: number) => `\x1b[${row + 1};${col + 1}H`,
  reverse: '\x1b[7m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
  clearLine: '\x1b[2K',
  saneEpilogue: '\x1b[?2004l\x1b[<u\x1b[?1000l\x1b[?1002l\x1b[?1006l\x1b[?25h\x1b[0m',
};

// Colours by meaning. Terminals that support true colour (COLORTERM=truecolor, as most modern
// ones do) get a fixed mid-tone palette that reads on dark and light backgrounds; others get the
// 16 standard colours, which follow the user's theme. NO_COLOR (https://no-color.org) turns colour
// off; bold, dim and reverse still carry the layout.
const noColor = Boolean(process.env.NO_COLOR);
const trueColor = !noColor && /^(truecolor|24bit)$/i.test(process.env.COLORTERM ?? '');
const colour = (rgb: [number, number, number], ansi16: number) =>
  noColor ? '' : trueColor ? `\x1b[38;2;${rgb.join(';')}m` : `\x1b[${ansi16}m`;
export const theme = {
  /** Where you are: the selection marker, keys in the hints. (Current items use reverse video, readable in every theme.) */
  accent: colour([79, 163, 255], 36),
  success: colour([126, 196, 110], 32),
  error: colour([232, 104, 104], 31),
  star: colour([232, 180, 70], 33),
};
