// Turns a recording from record.mjs into docs/demo/demo.gif: blanks account usage lines,
// shortens pauses, renders the terminal with agg, renders the captions with agg too (same
// font, width and background) and lays each one just above the input box or stash list, where
// the action is, with ffmpeg. While a caption shows, everything above the action (the agent's
// banner and transcript) is dimmed so the caption reads clearly and the action stays bright.
// Between the first and the last caption the video zooms in on the bottom-left, where the
// prompt, the stash list and the caption are. A caption is one string or [line, smaller line].
// Usage: node docs/demo/render.mjs <in.cast> <out.gif>
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import xterm from '@xterm/headless';

const [, , inPath, outPath] = process.argv;
const IDLE = 2; // longest pause kept, in seconds
const HOLD = 4; // last frame stays up this long
// Every caption stays up long enough to read and look at the screen: a base plus time per word.
// When the action is quicker than that, the screen holds on its result until the caption's time is up.
const READ_BASE = 1.5;
const READ_PER_WORD = 0.32;
const READ_MIN = 4;
const readingTime = (text) => Math.max(READ_MIN, READ_BASE + [text].flat().join(' ').split(/\s+/).filter(Boolean).length * READ_PER_WORD);
const AMBER = '\x1b[1;38;5;214m';
const GRAY = '\x1b[38;5;245m';
const CAPTION_ROWS = 3; // caption line, smaller line, one row of space above the action
const DIM = 0.65; // how much the area above the action is darkened while a caption shows
const BACKGROUND = '0x121314'; // agg's asciinema theme background, keyed out of the captions
// The caption's own rows get a solid band in the dimmed background colour, so it never sits on text.
const BAND = '0x060707';
const ZOOM = 1.6;
const ZOOM_EASE = 0.6; // seconds to zoom in or out
const MIN_BLOCK_TOP = 6; // below the agent's banner
const RESET = '\x1b[0m';
// Keys and the install command stand out in the caption.
const highlight = (text) => text.replace(/Ctrl\+[A-Z]|Enter|Tab|^\/|npm i -g prompt-shelf/g, (k) => AMBER + k + RESET + '\x1b[1m');

// Claude draws the usage line in pieces with cursor moves in between: blank the printable
// text up to the next line break or absolute move and keep the escape sequences.
const usage = /(You've used \d+% of your (weekly|session) limit|\d+% of your (weekly|session) limit|resets \d{1,2}:\d{2}(am|pm)|auto mode unavailable for this model).*?(?=\r|\n|\x1b\[\d+;\d+H|\x1b\[\?|$)/gs;
const blankText = (segment) => segment.replace(/(\x1b\[[0-9;?]*[A-Za-z])|[^\x1b]/g, (m, esc) => esc ?? ' ');
// Claude puts a no-break space after its prompt marker; agg's font draws it as a symbol.
const clean = (text) => text.replace(usage, blankText).replace(/ /g, ' ');

// Top row of the agent's input area: the input box, plus the row above it when that holds a
// status line (working spinner, toast), or the stash list when it's open. Found from the input
// box's top border, the second-last full-width rule on screen.
const bottomBlockTop = (term) => {
  const b = term.buffer.active;
  const text = (y) => b.getLine(y)?.translateToString(true) ?? '';
  const rules = [];
  for (let y = 0; y < term.rows; y++) if (/^─{20,}/.test(text(y))) rules.push(y);
  const border = rules.at(-2);
  if (border === undefined) return 0;
  for (let y = border - 1; y >= 0 && y >= border - 12; y--) if (/^ ?stash · /.test(text(y))) return y;
  // The agent's working line (e.g. "✽ Germinating… (3s · thinking)") belongs to the action too.
  for (let y = border - 1; y >= border - 3 && y >= 0; y--) if (/^\S \S+…/.test(text(y))) return y;
  return text(border - 1).trim() ? border - 1 : border;
};

const [header, ...lines] = readFileSync(inPath, 'utf8').trim().split('\n');
// Pass 1: shorten long pauses.
const events = [];
let last = 0;
let now = 0;
for (const line of lines) {
  const [t, type, data] = JSON.parse(line);
  now += Math.min(t - last, IDLE);
  last = t;
  if (type === 'm' || type === 'o') events.push({ t: now, type, data });
}
// Pass 2: give each caption its reading time by holding the screen at the end of its segment.
// The first caption starts at 0 so it also covers the agent's start-up.
let shift = 0;
const markerIdx = events.flatMap((e, i) => (e.type === 'm' ? [i] : []));
const holds = new Map(); // event index -> seconds to hold before it
markerIdx.forEach((mi, k) => {
  const start = k === 0 ? 0 : events[mi].t;
  const next = markerIdx[k + 1];
  const natural = (next === undefined ? now + HOLD : events[next].t) - start;
  const extra = Math.max(0, readingTime(events[mi].data) - natural);
  if (next === undefined) holds.set(events.length, extra);
  else holds.set(next, extra);
});
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
output.push(JSON.stringify([now, 'o', ''])); // the terminal lasts as long as the last caption's hold
const end = now + HOLD;
captions.forEach((c, i) => (c.end = captions[i + 1]?.start ?? end));

const work = mkdtempSync(join(tmpdir(), 'prompt-shelf-demo-'));
const { width, height } = JSON.parse(header);

// Replay the screen to find, for each caption, the highest the bottom block gets while it
// shows; the caption sits just above that and doesn't move while it's up.
const replay = new xterm.Terminal({ cols: width, rows: height, allowProposedApi: true, scrollback: 0 });
// Each screen state lasts until the next output event; the agent's start-up screen (nothing at
// the bottom yet) doesn't count.
const tops = captions.map(() => height);
const frames = output.map((line) => JSON.parse(line));
for (const [i, [t, , data]] of frames.entries()) {
  await new Promise((r) => replay.write(data, r));
  const top = bottomBlockTop(replay);
  if (top < MIN_BLOCK_TOP) continue;
  const until = frames[i + 1]?.[0] ?? end;
  captions.forEach((c, k) => {
    if (t < c.end && until > c.start) tops[k] = Math.min(tops[k], top);
  });
}
captions.forEach((c, i) => {
  c.blockTop = tops[i];
  c.row = Math.max(0, tops[i] - CAPTION_ROWS);
});
// Left-aligned with the agent's prompt, so the bottom-left zoom never cuts a caption off.
const indent = () => '  ';
const captionEvents = [[0, 'o', '\x1b[?25l']];
for (const c of captions) {
  const [line, sub = ''] = [c.text].flat();
  captionEvents.push([c.start, 'o', `\x1b[2J\x1b[1;1H${indent()}\x1b[1m${highlight(line)}${RESET}\x1b[2;1H${indent()}${GRAY}${sub}${RESET}`]);
}
captionEvents.push([now, 'o', '']);
const casts = {
  term: [header, ...output],
  captions: [JSON.stringify({ version: 2, width, height: CAPTION_ROWS }), ...captionEvents.map((e) => JSON.stringify(e))],
};
for (const [name, rows] of Object.entries(casts)) {
  writeFileSync(join(work, `${name}.cast`), rows.join('\n') + '\n');
  execFileSync('agg', ['--font-size', '15', '--theme', 'asciinema', '--speed', '1', '--idle-time-limit', '1000', '--last-frame-duration', String(HOLD), join(work, `${name}.cast`), join(work, `${name}.gif`)], { stdio: 'ignore' });
}
// Both GIFs share agg's padding, so row height is the height difference over the row difference.
const gifHeight = (name) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=height', '-of', 'csv=p=0', join(work, `${name}.gif`)]).toString().trim());
const rowPx = (gifHeight('term') - gifHeight('captions')) / (height - CAPTION_ROWS);
// agg pads every GIF; trim the caption's padding so it covers exactly its rows.
const padPx = Math.round((gifHeight('captions') - CAPTION_ROWS * rowPx) / 2);
const y = captions.reduceRight((rest, c) => `if(between(t\\,${c.start.toFixed(2)}\\,${c.end.toFixed(2)})\\,${Math.round(padPx + c.row * rowPx)}\\,${rest})`, String(height * rowPx));
const dims = captions
  .flatMap((c) => {
    const when = `enable='between(t,${c.start.toFixed(2)},${c.end.toFixed(2)})'`;
    return [
      `drawbox=x=0:y=0:w=iw:h=${Math.round(padPx + c.blockTop * rowPx)}:color=black@${DIM}:t=fill:${when}`,
      `drawbox=x=0:y=${Math.round(padPx + c.row * rowPx)}:w=iw:h=${Math.round((CAPTION_ROWS - 1) * rowPx)}:color=${BAND}:t=fill:${when}`,
    ];
  })
  .join(',');
// One zoom from the second caption to the end of the second-last, easing in and out.
const [zoomFrom, zoomTo] = [captions[1]?.start, captions.at(-2)?.end];
const zoomExpr =
  captions.length > 2
    ? `1+${ZOOM - 1}*if(between(it,${zoomFrom.toFixed(2)},${zoomTo.toFixed(2)}),min(1,min((it-${zoomFrom.toFixed(2)})/${ZOOM_EASE},(${zoomTo.toFixed(2)}-it)/${ZOOM_EASE})),0)`
    : '1';
const [W, H] = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', join(work, 'term.gif')]).toString().trim().split(',').map(Number);
// zoompan works on the 2x-upscaled frame to avoid jitter from whole-pixel steps.
const zoom = `scale=${W * 2}:${H * 2}:flags=lanczos,zoompan=z='${zoomExpr}':x='0':y='ih-ih/zoom':d=1:s=${W}x${H}:fps=10`;
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', join(work, 'term.gif'), '-i', join(work, 'captions.gif'), '-filter_complex', `[0]fps=10,${dims}[t];[1]fps=10,crop=iw:ih-${2 * padPx}:0:${padPx},format=rgba,colorkey=${BACKGROUND}:0.02:0[c];[t][c]overlay=x=0:y=${y}:eval=frame,${zoom},split[a][b];[a]palettegen=stats_mode=full[p];[b][p]paletteuse=dither=none`, '-loop', '0', outPath]);
console.log(`wrote ${outPath} (${end.toFixed(1)}s, ${captions.length} captions)`);
for (const c of captions) console.log(`  ${(c.end - c.start).toFixed(1).padStart(4)}s  ${[c.text].flat()[0]}`);
