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
