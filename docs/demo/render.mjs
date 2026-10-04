// Turns a recording from record.mjs into a GIF. A small camera window (VIEW_ROWS tall, full
// width) sits on whatever is acting: the input box with the save picker and toasts just above
// it, or the top of the list (tabs and the selected entry) while the list is open. It pans
// between them, so the action is always in the same place; the caption sits in a fixed strip
// right under the window, with a badge naming each key as it is pressed. Also blanks account
// usage lines and Claude's feedback banner, shortens pauses, and honours the recorder's
// markers (hold, trimStart, fastForward). A caption is one string or [line, smaller line].
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
const READ_BASE = 1.2;
const READ_PER_WORD = 0.28;
const READ_MIN = 2.8;
const readingTime = (text) => Math.max(READ_MIN, READ_BASE + [text].flat().join(' ').split(/\s+/).filter(Boolean).length * READ_PER_WORD);
const FONT = 18;
// The caption strip: its own background, a shade off the terminal's, so it reads as separate.
const CAPTION_THEME = '1d2229,e8e8e8,000000,dd3c69,4ebf22,ddaf3c,26b0d7,b954e1,54e1b9,d9d9d9,4d4d4d,dd3c69,4ebf22,ddaf3c,26b0d7,b954e1,54e1b9,ffffff';
const BADGE_SECONDS = 1.4;
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
// Pass 2: each caption stays up long enough to read; the screen holds on its result if needed.
const markerIdx = events.flatMap((e, i) => (e.type === 'm' ? [i] : []));
const holds = new Map();
markerIdx.forEach((mi, k) => {
  const start = k === 0 ? 0 : events[mi].t;
  const next = markerIdx[k + 1];
  const natural = (next === undefined ? now + HOLD : events[next].t) - start;
  holds.set(next ?? events.length, Math.max(0, readingTime(events[mi].data) - natural));
});
let shift = 0;
const output = [];
const captions = [];
const keyPresses = [];
events.forEach((e, i) => {
  shift += holds.get(i) ?? 0;
  const t = e.t + shift;
  if (e.type === 'm') captions.push({ start: captions.length ? t : 0, text: e.data });
  else if (e.type === 'k') keyPresses.push({ t, label: e.data });
  else output.push(JSON.stringify([t, 'o', clean(e.data)]));
});
shift += holds.get(events.length) ?? 0;
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
const agg = (name, rows, theme = 'asciinema') => {
  writeFileSync(join(work, `${name}.cast`), rows.join('\n') + '\n');
  execFileSync('agg', ['--font-size', String(FONT), '--theme', theme, '--speed', '1', '--idle-time-limit', '1000', '--last-frame-duration', String(HOLD), join(work, `${name}.cast`), join(work, `${name}.gif`)], { stdio: 'ignore' });
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

// The caption strip: the same width and font as the terminal, two rows, a badge at the right.
const drawCaption = (c, badge) => {
  const [line, sub = ''] = [c.text].flat();
  const tag = badge ? `\x1b[1;${Math.max(1, width - badge.length - 2)}H\x1b[7;1;38;5;214m ${badge} ${RESET}` : '';
  return `\x1b[2J\x1b[1;1H\x1b[1m${highlight(line, '\x1b[1m')}${RESET}\x1b[2;1H${SUB}${highlight(sub, SUB)}${RESET}${tag}`;
};
for (const c of captions) {
  const [line, sub = ''] = [c.text].flat();
  if (line.length > width - 14 || sub.length > width) console.warn(`caption may collide with a key badge or wrap: ${line}`);
}
const captionAt = (t) => captions.findLast((c) => c.start <= t) ?? captions[0];
const captionEvents = [
  ...captions.map((c) => [c.start, drawCaption(c)]),
  ...keyPresses.flatMap(({ t, label }, i) => {
    const off = t + BADGE_SECONDS;
    const next = keyPresses[i + 1]?.t ?? Infinity;
    return [[t, drawCaption(captionAt(t), label)], ...(next < off ? [] : [[off, drawCaption(captionAt(off))]])];
  }),
]
  .sort((a, b) => a[0] - b[0])
  .map(([t, data]) => [t, 'o', data]);
captionEvents.unshift([0, 'o', '\x1b[?25l']);
captionEvents.push([now, 'o', '']);
agg('captions', [JSON.stringify({ version: 2, width, height: 2 }), ...captionEvents.map((e) => JSON.stringify(e))], CAPTION_THEME);

execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', join(work, 'term.gif'), '-i', join(work, 'captions.gif'), '-filter_complex',
  `[0]fps=10,crop=iw:${viewH}:0:'${viewY}'[t];[1]fps=10,scale=${term.w}:-2[c];[t][c]vstack=shortest=0,split[a][b];[a]palettegen=stats_mode=full[p];[b][p]paletteuse=dither=none`,
  '-loop', '0', outPath]);
console.log(`wrote ${outPath} (${end.toFixed(1)}s, ${captions.length} captions, ${stops.length} camera stops)`);
for (const [i, c] of captions.entries()) console.log(`  ${((captions[i + 1]?.start ?? end) - c.start).toFixed(1).padStart(4)}s  ${[c.text].flat()[0]}`);
