// Turns a recording from record.mjs into a GIF. A small camera window (VIEW_ROWS tall, full
// width) sits on whatever is acting: the input box with the save picker and toasts just above
// it, or the top of the list (tabs and the selected entry) while the list is open, and pans
// between them. Each caption is a card shown in that same window before its step, so the
// message appears exactly where the viewer is already looking; a badge in the window's corner
// names each key as it is pressed. Also blanks account usage lines and Claude's feedback
// banner, shortens pauses, and honours the recorder's markers (hold, trimStart, fastForward).
// A caption is one string or [line, smaller line].
// Usage: node docs/demo/render.mjs <in.cast> <out.gif>
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import xterm from '@xterm/headless';

const [, , inPath, outPath] = process.argv;
const IDLE = 1.5; // longest pause kept, in seconds
const FAST = 4; // speed-up between fastForward markers
const HOLD = 3; // last frame stays up this long
const FONT = 18;
// The caption cards: their own background, a shade off the terminal's, so they read as cards.
const CARD_SECONDS = 1.6;
const CARD_FONT = 30;
const CAPTION_THEME = '1d2229,e8e8e8,000000,dd3c69,4ebf22,ddaf3c,26b0d7,b954e1,54e1b9,d9d9d9,4d4d4d,dd3c69,4ebf22,ddaf3c,26b0d7,b954e1,54e1b9,ffffff';
const BADGE_SECONDS = 1.2;
const AMBER = '\x1b[1;38;5;214m';
const SUB = '\x1b[38;5;250m';
const RESET = '\x1b[0m';
// Keys and the install command stand out in the caption.
const highlight = (text, after) => text.replace(/Ctrl\+[A-Z]|Enter|npm i -g prompt-shelf/g, (k) => AMBER + k + RESET + after);

// Claude draws the usage line in pieces with cursor moves in between: blank the printable
// text up to the next line break or absolute move and keep the escape sequences.
const usage = /(You've used \d+% of your (weekly|session) limit|\d+% of your (weekly|session) limit|resets \d{1,2}:\d{2}(am|pm)|auto mode unavailable for this model).*?(?=\r|\n|\x1b\[\d+;\d+H|\x1b\[\?|$)/gs;
const blankText = (segment) => segment.replace(/(\x1b\[[0-9;?]*[A-Za-z])|[^\x1b]/g, (m, esc) => esc ?? ' ');
// Claude's two-line feedback banner under the logo (a link in it, a line break between).
const promo = /▎\x1b\[\d*[GC]Your voice can help guide AI[\s\S]*?Start now(\x1b\]8;;\x07)?/g;
const blankPromo = (segment) => segment.replace(/\x1b\]8;[^\x07]*\x07|\x1b\[[0-9;]*m/g, '').replace(/(\x1b\[[0-9;?]*[A-Za-z])|[^\x1b\r\n]/g, (m, esc) => esc ?? ' ') + '\x1b[0m';
// Claude puts a no-break space after its prompt marker; agg's font draws it as a symbol.
const clean = (text) => text.replace(usage, blankText).replace(promo, blankPromo).replace(/ /g, ' ');

const [header, ...lines] = readFileSync(inPath, 'utf8').trim().split('\n');
const { width, height } = JSON.parse(header);

// Pass 1: timing. Long pauses shrink, fast-forwarded stretches play quicker, holds are added,
// and everything before trimStart happens at time 0.
const events = [];
let last = 0;
let now = 0;
let fast = false;
for (const line of lines) {
  const [t, type, data] = JSON.parse(line);
  now += Math.min(t - last, IDLE) / (fast ? FAST : 1);
  last = t;
  const marker = type === 'm' && typeof data === 'string' && data.startsWith('\u0000') ? data.slice(1) : null;
  if (marker === 'start') {
    for (const e of events) e.t = 0;
    now = 0;
  } else if (marker?.startsWith('ff-')) fast = marker === 'ff-on';
  else if (marker?.startsWith('hold:')) now += Number(marker.slice(5)) / 1000;
  else if (marker?.startsWith('key:')) events.push({ t: now, type: 'k', data: marker.slice(4) });
  else if (type === 'm' || type === 'o') events.push({ t: now, type, data });
}
// Pass 2: each caption becomes a card; the screen waits behind it, so the step after it starts
// when the card is gone.
let shift = 0;
const output = [];
const captions = [];
const keyPresses = [];
for (const e of events) {
  const t = e.t + shift;
  if (e.type === 'm') {
    captions.push({ start: t, text: e.data });
    shift += CARD_SECONDS;
  } else if (e.type === 'k') keyPresses.push({ t, label: e.data });
  else output.push(JSON.stringify([t, 'o', clean(e.data)]));
}
now += shift;
output.push(JSON.stringify([now, 'o', '']));
const end = now + HOLD;

// The input box's bottom edge: the last full-width rule on screen, lowest seen in the recording.
const VIEW_ROWS = 7;
const PAN = 0.4; // seconds to pan from one spot to the next
const screens = [];
const replay = new xterm.Terminal({ cols: width, rows: height, allowProposedApi: true, scrollback: 0 });
let boxBottom = 0;
for (const line of output) {
  const [t, , data] = JSON.parse(line);
  await new Promise((r) => replay.write(data, r));
  const rows = Array.from({ length: height }, (_, y) => replay.buffer.active.getLine(y)?.translateToString(true) ?? '');
  const rule = rows.findLastIndex((text) => /^─{20,}/.test(text));
  if (rule >= 0) boxBottom = Math.max(boxBottom, rule);
  screens.push([t, rows.findIndex((text) => /←→ switch list/.test(text))]);
}
// Where the window's top row is over time: on the list's top row while it is open, else so the
// input box sits at the window's bottom.
const boxView = Math.max(0, boxBottom - VIEW_ROWS + 1);
const stops = [];
for (const [t, listTop] of screens) {
  const top = listTop >= 0 ? Math.min(listTop, height - VIEW_ROWS) : boxView;
  if (top !== stops.at(-1)?.[1]) stops.push([t, top]);
}
const work = mkdtempSync(join(tmpdir(), 'prompt-shelf-demo-'));
const agg = (name, rows, font = FONT, theme = 'asciinema') => {
  writeFileSync(join(work, `${name}.cast`), rows.join('\n') + '\n');
  execFileSync('agg', ['--font-size', String(font), '--theme', theme, '--speed', '1', '--idle-time-limit', '1000', '--last-frame-duration', String(HOLD), join(work, `${name}.cast`), join(work, `${name}.gif`)], { stdio: 'ignore' });
  const [w, h] = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', join(work, `${name}.gif`)]).toString().trim().split(',').map(Number);
  return { w, h };
};
const still = (cols, rows) => [JSON.stringify({ version: 2, width: cols, height: rows }), JSON.stringify([0, 'o', '']), JSON.stringify([0.1, 'o', ''])];

const term = agg('term', [header, ...output]);
const rowPx = agg('row2', still(width, 2)).h - agg('row1', still(width, 1)).h;
const padPx = (term.h - height * rowPx) / 2;
const viewH = Math.round(VIEW_ROWS * rowPx + rowPx / 3);
const yOf = (top) => Math.round(padPx + top * rowPx - rowPx / 6);
// Built so the latest stop is checked first; each eases in from the one before.
const viewY = stops.reduce((rest, [t, top], i) => {
  const from = yOf(i === 0 ? top : stops[i - 1][1]);
  const to = yOf(top);
  const start = Math.max(0, t - PAN / 2).toFixed(2);
  return `if(gte(t\\,${start})\\,${from}+${to - from}*min(1\\,(t-${start})/${PAN})\\,${rest})`;
}, String(yOf(stops[0]?.[1] ?? boxView)));

// The cards: big text centred in a recording the window's shape, scaled to fit it exactly.
const cardChar = (agg('k20', still(20, 1), CARD_FONT).w - agg('k10', still(10, 1), CARD_FONT).w) / 10;
const cardRow = agg('k2', still(10, 2), CARD_FONT).h - agg('k1', still(10, 1), CARD_FONT).h;
const cardCols = Math.round(term.w / cardChar);
const cardRows = Math.max(3, Math.round(viewH / cardRow));
const centre = (text) => ' '.repeat(Math.max(0, Math.floor((cardCols - text.length) / 2)));
const drawCard = (c) => {
  const [line, sub = ''] = [c.text].flat();
  const top = Math.max(1, Math.floor((cardRows - (sub ? 2 : 1)) / 2) + 1);
  const second = sub ? `\x1b[${top + 1};1H${centre(sub)}${SUB}${highlight(sub, SUB)}${RESET}` : '';
  return `\x1b[2J\x1b[${top};1H${centre(line)}\x1b[1m${highlight(line, '\x1b[1m')}${RESET}${second}`;
};
for (const c of captions) for (const text of [c.text].flat()) if (text.length > cardCols - 4) console.warn(`card text too long (max ${cardCols - 4}): ${text}`);
agg('cards', [JSON.stringify({ version: 2, width: cardCols, height: cardRows }), JSON.stringify([0, 'o', '\x1b[?25l']), ...captions.map((c) => JSON.stringify([c.start, 'o', drawCard(c)])), JSON.stringify([end, 'o', ''])], CARD_FONT, CAPTION_THEME);
const showCards = captions.map((c) => `between(t,${c.start.toFixed(2)},${(c.start + CARD_SECONDS).toFixed(2)})`).join('+') || '0';

// The key badge: drawn on the terminal's own background, which is keyed out over the window.
const BADGE_COLS = 10;
const badgeEvents = keyPresses.flatMap(({ t, label }, i) => {
  const off = t + BADGE_SECONDS;
  const next = keyPresses[i + 1]?.t ?? Infinity;
  const draw = `\x1b[2J\x1b[1;${BADGE_COLS - label.length - 1}H\x1b[7;1;38;5;214m ${label} ${RESET}`;
  return [[t, draw], ...(next < off ? [] : [[off, '\x1b[2J']])];
});
const badge = agg('badge', [JSON.stringify({ version: 2, width: BADGE_COLS, height: 1 }), JSON.stringify([0, 'o', '\x1b[?25l']), ...badgeEvents.map(([t, d]) => JSON.stringify([t, 'o', d])), JSON.stringify([end, 'o', ''])]);

execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', join(work, 'term.gif'), '-i', join(work, 'cards.gif'), '-i', join(work, 'badge.gif'), '-filter_complex',
  `[0]fps=10,crop=iw:${viewH}:0:'${viewY}'[t];[1]fps=10,scale=${term.w}:${viewH}[c];[t][c]overlay=0:0:enable='${showCards}':shortest=0[v];` +
  `[2]fps=10,colorkey=0x121314:0.08:0[k];[v][k]overlay=${term.w - badge.w - 6}:4:enable='lt(${showCards}\\,1)':shortest=0,split[a][b];[a]palettegen=stats_mode=full[p];[b][p]paletteuse=dither=none`,
  '-loop', '0', outPath]);
console.log(`wrote ${outPath} (${end.toFixed(1)}s, ${captions.length} cards, ${stops.length} camera stops)`);
for (const [i, c] of captions.entries()) console.log(`  ${(c.start).toFixed(1).padStart(5)}s  ${[c.text].flat()[0]}`);
