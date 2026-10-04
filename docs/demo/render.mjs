// Turns a recording from record.mjs into a GIF: the terminal at the bottom, and above it a band
// with the current caption, so captions never sit on the agent's own text. Blanks account usage
// lines and Claude's feedback banner, and shortens pauses. A caption is one string or
// [line, smaller line]; each stays up long enough to read.
// Usage: node docs/demo/render.mjs <in.cast> <out.gif>
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [, , inPath, outPath] = process.argv;
const IDLE = 1.5; // longest pause kept, in seconds
const HOLD = 3; // last frame stays up this long
const READ_BASE = 1.2;
const READ_PER_WORD = 0.28;
const READ_MIN = 2.8;
const readingTime = (text) => Math.max(READ_MIN, READ_BASE + [text].flat().join(' ').split(/\s+/).filter(Boolean).length * READ_PER_WORD);
// The caption band: bigger text than the terminal, scaled to the terminal's width.
const CAPTION_FONT = 24;
const CAPTION_ROWS = 3; // blank, caption, smaller line
const AMBER = '\x1b[1;38;5;214m';
const SUB = '\x1b[38;5;250m';
const RESET = '\x1b[0m';
const DIVIDER = '0x3a3d41';
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
const { width } = JSON.parse(header);

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

// The caption band, as its own small recording.
const capCols = Math.round((width * 15) / CAPTION_FONT);
const captionEvents = [[0, 'o', '\x1b[?25l']];
for (const c of captions) {
  const [line, sub = ''] = [c.text].flat();
  captionEvents.push([c.start, 'o', `\x1b[2J\x1b[2;2H\x1b[1m${highlight(line, '\x1b[1m')}${RESET}\x1b[3;2H${SUB}${highlight(sub, SUB)}${RESET}`]);
}
captionEvents.push([now, 'o', '']);

const work = mkdtempSync(join(tmpdir(), 'prompt-shelf-demo-'));
const casts = {
  term: { rows: [header, ...output], font: 15 },
  captions: { rows: [JSON.stringify({ version: 2, width: capCols, height: CAPTION_ROWS + 1 }), ...captionEvents.map((e) => JSON.stringify(e))], font: CAPTION_FONT },
};
for (const [name, { rows, font }] of Object.entries(casts)) {
  writeFileSync(join(work, `${name}.cast`), rows.join('\n') + '\n');
  execFileSync('agg', ['--font-size', String(font), '--theme', 'asciinema', '--speed', '1', '--idle-time-limit', '1000', '--last-frame-duration', String(HOLD), join(work, `${name}.cast`), join(work, `${name}.gif`)], { stdio: 'ignore' });
}
const [W] = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width', '-of', 'csv=p=0', join(work, 'term.gif')]).toString().trim().split(',').map(Number);
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', join(work, 'captions.gif'), '-i', join(work, 'term.gif'), '-filter_complex',
  `[0]fps=10,scale=${W}:-2:flags=lanczos,pad=iw:ih+3:0:0:color=${DIVIDER}[c];[1]fps=10[t];[c][t]vstack=shortest=0,split[a][b];[a]palettegen=stats_mode=full[p];[b][p]paletteuse=dither=none`,
  '-loop', '0', outPath]);
console.log(`wrote ${outPath} (${(now + HOLD).toFixed(1)}s, ${captions.length} captions)`);
for (const [i, c] of captions.entries()) console.log(`  ${((captions[i + 1]?.start ?? now + HOLD) - c.start).toFixed(1).padStart(4)}s  ${[c.text].flat()[0]}`);
