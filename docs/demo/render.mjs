// Turns a recording from record.mjs into a GIF. Each caption is a quiet box pinned just above
// where the action is (the input box, a toast, the save picker or the list), and the camera
// zooms in on that spot, so the eye is held where things happen. Blanks
// account usage lines and Claude's feedback banner, and shortens pauses. A caption is one string
// or [line, smaller line]; each stays up long enough to read.
// Usage: node docs/demo/render.mjs <in.cast> <out.gif>
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import xterm from '@xterm/headless';

const [, , inPath, outPath] = process.argv;
const IDLE = 1.5; // longest pause kept, in seconds
const HOLD = 3; // last frame stays up this long
const READ_BASE = 1.2;
const READ_PER_WORD = 0.28;
const READ_MIN = 2.8;
const readingTime = (text) => Math.max(READ_MIN, READ_BASE + [text].flat().join(' ').split(/\s+/).filter(Boolean).length * READ_PER_WORD);
const TERM_FONT = 15;
const CAPTION_FONT = 17;
// The caption box: its own background (agg's custom theme: background, foreground, 16 colours).
const CAPTION_THEME = '1a1e24,e8e8e8,000000,dd3c69,4ebf22,ddaf3c,26b0d7,b954e1,54e1b9,d9d9d9,4d4d4d,dd3c69,4ebf22,ddaf3c,26b0d7,b954e1,54e1b9,ffffff';
const CAPTION_BORDER = '0x2c323a';
const MARGIN = 14; // px between the box and the terminal's sides, and above the action
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

// Pass 1: shorten long pauses.
const events = [];
let last = 0;
let now = 0;
const FAST = 4; // speed-up between fastForward markers
let fast = false;
for (const line of lines) {
  const [t, type, data] = JSON.parse(line);
  now += Math.min(t - last, IDLE) / (fast ? FAST : 1);
  last = t;
  if (type === 'm' && typeof data === 'string' && data.startsWith('\u0000ff-')) fast = data === '\u0000ff-on';
  else if (type === 'm' || type === 'o') events.push({ t: now, type, data });
}
// Pass 2: give each caption its reading time by holding the screen at the end of its segment.
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
events.forEach((e, i) => {
  shift += holds.get(i) ?? 0;
  const t = e.t + shift;
  if (e.type === 'm') captions.push({ start: captions.length ? t : 0, text: e.data });
  else output.push(JSON.stringify([t, 'o', clean(e.data)]));
});
shift += holds.get(events.length) ?? 0;
now += shift;
output.push(JSON.stringify([now, 'o', '']));

// Top row of the action at the bottom: the stash list or save picker when one is open, else the
// agent's working line or a toast right above the input box, else the input box's top border
// (the second-last full-width rule on screen).
const actionTop = (term) => {
  const b = term.buffer.active;
  const text = (y) => b.getLine(y)?.translateToString(true) ?? '';
  const rules = [];
  for (let y = 0; y < term.rows; y++) if (/^─{20,}/.test(text(y))) rules.push(y);
  const border = rules.at(-2);
  if (border === undefined) return null;
  for (let y = border - 1; y >= 0 && y >= border - 14; y--) if (/←→ switch list|^ ?Save to:/.test(text(y))) return y;
  for (let y = border - 1; y >= border - 3 && y >= 0; y--) if (/^\S \S+…/.test(text(y))) return y;
  return text(border - 1).trim() ? border - 1 : border;
};

const end = now + HOLD;
captions.forEach((c, i) => (c.end = captions[i + 1]?.start ?? end));
// Replay the screen and note where the action is over time, so the caption box follows it (up
// when the list opens, back down when it closes).
const replay = new xterm.Terminal({ cols: width, rows: height, allowProposedApi: true, scrollback: 0 });
const segments = []; // [start, top]
for (const line of output) {
  const [t, , data] = JSON.parse(line);
  await new Promise((r) => replay.write(data, r));
  const top = actionTop(replay);
  if (top !== null && top !== segments.at(-1)?.[1]) segments.push([t, top]);
}
const work = mkdtempSync(join(tmpdir(), 'prompt-shelf-demo-'));
const agg = (name, rows, font, theme = 'asciinema') => {
  writeFileSync(join(work, `${name}.cast`), rows.join('\n') + '\n');
  execFileSync('agg', ['--font-size', String(font), '--theme', theme, '--speed', '1', '--idle-time-limit', '1000', '--last-frame-duration', String(HOLD), join(work, `${name}.cast`), join(work, `${name}.gif`)], { stdio: 'ignore' });
  const [w, h] = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', join(work, `${name}.gif`)]).toString().trim().split(',').map(Number);
  return { w, h };
};
const still = (cols, rows) => [JSON.stringify({ version: 2, width: cols, height: rows }), JSON.stringify([0, 'o', '']), JSON.stringify([0.1, 'o', ''])];

// The terminal, and its row height and padding (from two empty recordings one row apart).
const term = agg('term', [header, ...output], TERM_FONT);
const rowPx = agg('row2', still(width, 2), TERM_FONT).h - agg('row1', still(width, 1), TERM_FONT).h;
const padPx = (term.h - height * rowPx) / 2;
// The camera: zoomed in on the bottom-left, where the action and its caption are, so they fill
// the frame. Full view for the title, the end card, and when the list is open (it needs room).
const ZOOM_MAX = 1.6;
const EASE = 0.5; // seconds to move from one zoom level to the next
const LEAD = 0.15; // the box and camera move this much before the screen changes
// The caption box: narrow enough to stay in view at full zoom.
const charPx = (agg('c20', still(20, 1), CAPTION_FONT).w - agg('c10', still(10, 1), CAPTION_FONT).w) / 10;
const capPad = agg('c10', still(10, 1), CAPTION_FONT).w - 10 * charPx;
const capCols = Math.floor((term.w / ZOOM_MAX - 2 * MARGIN - capPad) / charPx);
const captionEvents = [[0, 'o', '\x1b[?25l']];
for (const c of captions) {
  const [line, sub = ''] = [c.text].flat();
  captionEvents.push([c.start, 'o', `\x1b[2J\x1b[1;1H\x1b[1m${highlight(line, '\x1b[1m')}${RESET}\x1b[2;1H${SUB}${highlight(sub, SUB)}${RESET}`]);
}
captionEvents.push([now, 'o', '']);
const cap = agg('captions', [JSON.stringify({ version: 2, width: capCols, height: 2 }), ...captionEvents.map((e) => JSON.stringify(e))], CAPTION_FONT, CAPTION_THEME);

const yAt = (top) => Math.max(MARGIN, Math.round(padPx + top * rowPx - cap.h - MARGIN / 2));
// Built so the latest screen state is checked first.
const y = segments.reduce((rest, [start, top]) => `if(gte(t\\,${Math.max(0, start - LEAD).toFixed(2)})\\,${yAt(top)}\\,${rest})`, String(yAt(segments[0]?.[1] ?? height - 4)));

// Zoom so the view's top edge sits just above the caption box; the view is anchored bottom-left.
const zoomFor = (top) => Math.min(ZOOM_MAX, Math.max(1, term.h / (term.h - yAt(top) + MARGIN)));
const zoomedFrom = captions[1]?.start ?? 0;
const zoomedUntil = captions.at(-1)?.start ?? end;
const changes = [[0, 1]];
for (const [start, top] of segments) {
  const t = Math.max(zoomedFrom, Math.min(zoomedUntil, start)) - LEAD;
  const z = start >= zoomedUntil ? 1 : zoomFor(top);
  if (z !== changes.at(-1)[1]) changes.push([Math.max(0, t), z]);
}
changes.push([Math.max(0, zoomedUntil - LEAD), 1]);
changes.sort((a, b) => a[0] - b[0]);
const zoomExpr = changes.reduce((rest, [t, z], i) => {
  const from = i === 0 ? 1 : changes[i - 1][1];
  return `if(gte(it,${t.toFixed(2)}),${from.toFixed(3)}+${(z - from).toFixed(3)}*min(1,(it-${t.toFixed(2)})/${EASE}),${rest})`;
}, '1');
const camera = `scale=${term.w * 2}:${term.h * 2}:flags=lanczos,zoompan=z='${zoomExpr}':x='0':y='ih-ih/zoom':d=1:s=${term.w}x${term.h}:fps=10`;
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', join(work, 'term.gif'), '-i', join(work, 'captions.gif'), '-filter_complex',
  `[1]fps=10,drawbox=x=0:y=0:w=iw:h=ih:color=${CAPTION_BORDER}:t=1[c];[0]fps=10[t];[t][c]overlay=x=${MARGIN}:y='${y}':eval=frame:shortest=0,${camera},split[a][b];[a]palettegen=stats_mode=full[p];[b][p]paletteuse=dither=none`,
  '-loop', '0', outPath]);
console.log(`wrote ${outPath} (${end.toFixed(1)}s, ${captions.length} captions)`);
for (const c of captions) console.log(`  ${(c.end - c.start).toFixed(1).padStart(4)}s  ${[c.text].flat()[0]}`);
