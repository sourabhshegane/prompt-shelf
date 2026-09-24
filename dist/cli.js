import {
  adapterNames,
  describeInstall,
  describeRemove,
  findRealBinary,
  getAdapter,
  installShims,
  pathHint,
  removeShims,
  reservedBy,
  shimDir,
  shimDirOnPath,
  stripShimDir
} from "./chunk-5VLKRCFM.js";

// src/cli.ts
import { createRequire } from "module";

// src/config.ts
import { homedir } from "os";
import { dirname, join } from "path";
import { mkdir, readFile, rename, writeFile } from "fs/promises";
var stashDir = join(homedir(), ".prompt-shelf");
var stashFile = join(stashDir, "stash.jsonl");
var configFile = join(stashDir, "config.json");
var defaults = { hotkey: "ctrl+f", listHotkey: "ctrl+q" };
async function readRaw(filePath) {
  const raw = await readFile(filePath, "utf8").catch(() => "");
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
async function loadConfig(filePath = configFile) {
  const raw = await readRaw(filePath);
  return { ...defaults, ...raw };
}
async function saveConfig(partial, filePath = configFile) {
  const merged = { ...await readRaw(filePath), ...partial };
  await mkdir(dirname(filePath), { recursive: true, mode: 448 });
  const tmp = `${filePath}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(merged, null, 2) + "\n");
  await rename(tmp, filePath);
}

// src/core/keys.ts
var PASTE_START = Buffer.from("\x1B[200~");
var PASTE_END = Buffer.from("\x1B[201~");
var FUNCTION_KEYS = {
  f1: ["\x1BOP", "\x1B[11~"],
  f2: ["\x1BOQ", "\x1B[12~"],
  f3: ["\x1BOR", "\x1B[13~"],
  f4: ["\x1BOS", "\x1B[14~"],
  f5: ["\x1B[15~"],
  f6: ["\x1B[17~"],
  f7: ["\x1B[18~"],
  f8: ["\x1B[19~"],
  f9: ["\x1B[20~"],
  f10: ["\x1B[21~"],
  f11: ["\x1B[23~"],
  f12: ["\x1B[24~"]
};
function parseHotkey(spec) {
  const label = spec.trim().toLowerCase();
  const ctrl = /^ctrl\+([a-z])$/.exec(label);
  if (ctrl) {
    const letter = ctrl[1];
    return {
      label,
      sequences: [Buffer.from([letter.toUpperCase().charCodeAt(0) - 64]), Buffer.from(`\x1B[${letter.charCodeAt(0)};5u`)]
    };
  }
  const fkey = FUNCTION_KEYS[label];
  if (fkey) return { label, sequences: fkey.map((s) => Buffer.from(s, "latin1")) };
  throw new Error(`Unsupported hotkey "${spec}". Use ctrl+<letter> or f1..f12.`);
}
var KeyInterceptor = class {
  inPaste = false;
  pending = Buffer.alloc(0);
  escaped;
  owner = /* @__PURE__ */ new Map();
  singles = /* @__PURE__ */ new Map();
  constructor(hotkeys) {
    const list = Array.isArray(hotkeys) ? hotkeys : [hotkeys];
    list.forEach((hotkey, index) => {
      for (const seq of hotkey.sequences) {
        if (seq.length === 1) this.singles.set(seq[0], index);
        else this.owner.set(seq, index);
      }
    });
    this.escaped = [...this.owner.keys()].filter((s) => s[0] === 27);
  }
  get hasPending() {
    return this.pending.length > 0;
  }
  flush() {
    const out = this.pending;
    this.pending = Buffer.alloc(0);
    return out;
  }
  feed(chunk) {
    const data = Buffer.concat([this.pending, chunk]);
    this.pending = Buffer.alloc(0);
    const out = [];
    const presses = [];
    let i = 0;
    while (i < data.length) {
      if (data[i] === 27) {
        const marker = this.matchPrefix(data, i, [PASTE_START, PASTE_END, ...this.escaped]);
        if (marker === "partial") {
          this.pending = data.subarray(i);
          break;
        }
        if (marker === PASTE_START || marker === PASTE_END) {
          this.inPaste = marker === PASTE_START;
          for (let j = 0; j < marker.length; j++) out.push(data[i + j]);
          i += marker.length;
          continue;
        }
        if (marker && !this.inPaste) {
          presses.push(this.owner.get(marker));
          i += marker.length;
          continue;
        }
      }
      const single = this.inPaste ? void 0 : this.singles.get(data[i]);
      if (single !== void 0) {
        presses.push(single);
        i++;
        continue;
      }
      out.push(data[i]);
      i++;
    }
    return { passthrough: Buffer.from(out), presses };
  }
  matchPrefix(data, at, candidates) {
    for (const marker of candidates) {
      const avail = data.subarray(at, at + marker.length);
      if (avail.equals(marker)) return marker;
      if (avail.length < marker.length && marker.subarray(0, avail.length).equals(avail)) return "partial";
    }
    return null;
  }
};

// src/core/scope.ts
import { existsSync } from "fs";
import { dirname as dirname2, join as join2, resolve } from "path";
var roots = /* @__PURE__ */ new Map();
function repoRoot(dir) {
  const start = resolve(dir);
  let root = roots.get(start);
  if (root === void 0) {
    root = start;
    for (let d = start; ; d = dirname2(d)) {
      if (existsSync(join2(d, ".git"))) {
        root = d;
        break;
      }
      if (dirname2(d) === d) break;
    }
    roots.set(start, root);
  }
  return root;
}
var inRepo = (entry, cwd) => repoRoot(entry.cwd) === repoRoot(cwd);
function scoped(entries, scope, cwd) {
  return scope === "all" || cwd === void 0 ? entries : entries.filter((e) => inRepo(e, cwd));
}

// src/core/store.ts
import { appendFile, mkdir as mkdir2, readFile as readFile2, rename as rename2, writeFile as writeFile2 } from "fs/promises";
import { dirname as dirname3 } from "path";
import { randomUUID } from "crypto";
var Store = class {
  constructor(filePath) {
    this.filePath = filePath;
  }
  filePath;
  async list() {
    const raw = await readFile2(this.filePath, "utf8").catch(() => "");
    const entries = [];
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        entries.push(JSON.parse(line));
      } catch {
        continue;
      }
    }
    return entries.reverse();
  }
  async add(input) {
    const entry = { id: randomUUID(), createdAt: (/* @__PURE__ */ new Date()).toISOString(), ...input };
    await mkdir2(dirname3(this.filePath), { recursive: true, mode: 448 });
    await appendFile(this.filePath, JSON.stringify(entry) + "\n", "utf8");
    return entry;
  }
  async remove(id) {
    const entries = await this.list();
    const kept = entries.filter((e) => e.id !== id);
    if (kept.length === entries.length) return false;
    await this.rewrite(kept.reverse());
    return true;
  }
  async rewrite(entriesOldestFirst) {
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    await mkdir2(dirname3(this.filePath), { recursive: true, mode: 448 });
    await writeFile2(tmp, entriesOldestFirst.map((e) => JSON.stringify(e)).join("\n") + (entriesOldestFirst.length ? "\n" : ""), "utf8");
    await rename2(tmp, this.filePath);
  }
};

// src/app.ts
import { spawn as spawn2 } from "child_process";
import { writeFile as writeFile3 } from "fs/promises";
import { constants as osConstants } from "os";
import { join as join3 } from "path";

// src/core/screen.ts
import xterm from "@xterm/headless";
import serialize from "@xterm/addon-serialize";
var { Terminal } = xterm;
var { SerializeAddon } = serialize;
var Screen = class {
  term;
  serializer = new SerializeAddon();
  constructor(cols, rows) {
    this.term = new Terminal({ cols, rows, allowProposedApi: true, scrollback: 0 });
    this.term.loadAddon(this.serializer);
  }
  write(data) {
    return new Promise((resolve2) => this.term.write(typeof data === "string" ? data : new Uint8Array(data), resolve2));
  }
  resize(cols, rows) {
    this.term.resize(cols, rows);
  }
  // dropDim blanks faint (SGR 2) cells, e.g. an agent's placeholder text in an empty input box.
  lines(opts = {}) {
    const buf = this.term.buffer.active;
    const out = [];
    for (let i = 0; i < this.term.rows; i++) {
      const line = buf.getLine(buf.viewportY + i);
      if (!line) {
        out.push("");
      } else if (!opts.dropDim) {
        out.push(line.translateToString(true));
      } else {
        let text = "";
        for (let x = 0; x < line.length; x++) {
          const cell = line.getCell(x);
          if (!cell || cell.getWidth() === 0) continue;
          text += cell.isDim() ? " ".repeat(cell.getWidth()) : cell.getChars() || " ";
        }
        out.push(text.trimEnd());
      }
    }
    return out;
  }
  cursor() {
    const buf = this.term.buffer.active;
    return { x: buf.cursorX, y: buf.cursorY };
  }
  serialize() {
    return this.serializer.serialize();
  }
  get cols() {
    return this.term.cols;
  }
  get rows() {
    return this.term.rows;
  }
};

// src/core/pty.ts
import * as nodePty from "node-pty";
function spawnAgent(opts) {
  const child = nodePty.spawn(opts.command, opts.args, {
    name: process.env.TERM ?? "xterm-256color",
    cols: opts.cols,
    rows: opts.rows,
    cwd: opts.cwd,
    env: opts.env
  });
  return {
    write: (data) => child.write(data),
    resize: (cols, rows) => child.resize(cols, rows),
    onData: (cb) => void child.onData(cb),
    onExit: (cb) => void child.onExit(({ exitCode, signal }) => cb(signal ? 128 + signal : exitCode)),
    kill: () => child.kill()
  };
}

// src/core/stdin.ts
import { StringDecoder } from "string_decoder";
var StdinPipeline = class {
  constructor(interceptor) {
    this.interceptor = interceptor;
  }
  interceptor;
  decoder = new StringDecoder("utf8");
  get hasPending() {
    return this.interceptor.hasPending;
  }
  feed(chunk) {
    const { passthrough: passthrough2, presses } = this.interceptor.feed(chunk);
    return { text: this.decoder.write(passthrough2), presses };
  }
  decodeOnly(chunk) {
    return this.decoder.write(chunk);
  }
  flush() {
    return this.decoder.write(this.interceptor.flush());
  }
};

// src/core/overlay.ts
import { basename } from "path";

// src/core/terminal.ts
var ansi = {
  hideCursor: "\x1B[?25l",
  showCursor: "\x1B[?25h",
  clearScreen: "\x1B[2J",
  home: "\x1B[H",
  moveTo: (row, col) => `\x1B[${row + 1};${col + 1}H`,
  reverse: "\x1B[7m",
  dim: "\x1B[2m",
  bold: "\x1B[1m",
  reset: "\x1B[0m",
  clearLine: "\x1B[2K",
  saneEpilogue: "\x1B[?2004l\x1B[<u\x1B[?1000l\x1B[?1002l\x1B[?1006l\x1B[?25h\x1B[0m"
};

// src/core/overlay.ts
var flatten = (text) => text.replace(/\r?\n/g, " \u23CE ");
var clip = (text, room) => text.length > room ? text.slice(0, Math.max(0, room - 1)) + "\u2026" : text;
var CSI_U = /^\x1b\[(\d+)(?:;(\d+))?u$/;
var ANSI_SEQ = /^\x1b\[[0-9;]*[A-Za-z]/;
function truncateVisible(line, width) {
  let result = "";
  let visibleLen = 0;
  let i = 0;
  while (i < line.length) {
    const m = ANSI_SEQ.exec(line.slice(i));
    if (m) {
      result += m[0];
      i += m[0].length;
      continue;
    }
    if (visibleLen < width) {
      result += line[i];
      visibleLen++;
    }
    i++;
  }
  return result;
}
function fitVisible(line, width) {
  const visibleLen = [...line.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")].length;
  return truncateVisible(line, width) + " ".repeat(Math.max(0, width - visibleLen));
}
function normalizeKey(key) {
  const m = CSI_U.exec(key);
  if (!m) return key;
  const code = Number(m[1]);
  const mods = Number(m[2] ?? "1");
  if (mods !== 1) return key;
  if (code === 27) return "\x1B";
  if (code === 13) return "\r";
  if (code === 127) return "\x7F";
  return String.fromCodePoint(code);
}
var Overlay = class {
  index = 0;
  mode = "list";
  filterText = "";
  entries;
  currentScope;
  hotkeyLabel;
  cwd;
  constructor(entries, options = {}) {
    this.entries = entries;
    this.hotkeyLabel = options.hotkeyLabel ?? "ctrl+f";
    this.cwd = options.cwd;
    this.currentScope = this.cwd === void 0 ? "all" : options.scope ?? "repo";
  }
  get filter() {
    return this.filterText;
  }
  get scope() {
    return this.currentScope;
  }
  update(entries) {
    this.entries = entries;
    this.clampIndex();
  }
  inScope() {
    return scoped(this.entries, this.currentScope, this.cwd);
  }
  visible() {
    const q = this.filterText.toLowerCase();
    const list = this.inScope();
    return q ? list.filter((e) => e.text.toLowerCase().includes(q)) : list;
  }
  handleKey(rawKey) {
    if (!rawKey.startsWith("\x1B") && rawKey.length > 1) {
      for (const ch of rawKey) {
        const action = this.handleOne(ch);
        if (action.type !== "none") return action;
      }
      return { type: "none" };
    }
    return this.handleOne(rawKey);
  }
  handleOne(rawKey) {
    const key = normalizeKey(rawKey);
    if (this.mode === "filter") return this.handleFilterKey(key);
    if (this.mode === "confirm-delete") {
      this.mode = "list";
      const current2 = this.current();
      return key === "y" && current2 ? { type: "delete", entry: current2 } : { type: "none" };
    }
    const current = this.current();
    switch (key) {
      case "\x1B[A":
      case "k":
        this.index = Math.max(0, this.index - 1);
        return { type: "none" };
      case "\x1B[B":
      case "j":
        this.index = Math.min(Math.max(0, this.visible().length - 1), this.index + 1);
        return { type: "none" };
      case "\r":
        return current ? { type: "pop", entry: current } : { type: "none" };
      case "a":
        return current ? { type: "apply", entry: current } : { type: "none" };
      case "d":
        if (current) this.mode = "confirm-delete";
        return { type: "none" };
      case "/":
        this.mode = "filter";
        return { type: "none" };
      case "	":
        this.toggleScope();
        return { type: "none" };
      case "\x1B":
      case "":
      case "q":
        return { type: "close" };
      default:
        return { type: "none" };
    }
  }
  render(cols, rows, status) {
    const lines = [];
    const list = this.visible();
    const position = list.length ? `  ${this.index + 1}/${list.length}` : "";
    const header = ` stash \xB7 ${this.scopeLabel()}${position}${this.filterText ? `  /${this.filterText}` : ""}`;
    lines.push(`${ansi.reverse}${ansi.bold}${fitVisible(header, cols)}${ansi.reset}`);
    const bodyRows = Math.max(0, rows - 2);
    if (this.entries.length === 0) {
      lines.push(`${ansi.dim}nothing stashed \u2014 type in the agent's box and press ${this.hotkeyLabel}${ansi.reset}`);
    } else if (this.inScope().length === 0) {
      lines.push(`${ansi.dim}nothing stashed here \u2014 tab to see all (${this.entries.length})${ansi.reset}`);
    } else if (list.length === 0) {
      lines.push(`${ansi.dim}no matches for /${this.filterText} \xB7 esc to clear${ansi.reset}`);
    } else {
      const top = Math.max(0, Math.min(this.index - Math.floor(bodyRows / 2), list.length - bodyRows));
      for (const entry of list.slice(top, top + bodyRows)) {
        const selected = entry === list[this.index];
        const prefixWidth = 2;
        const gapWidth = 2;
        const maxTag = Math.max(0, Math.floor(cols / 3));
        const rawTag = `${entry.agent} \xB7 ${basename(entry.cwd)}`;
        const tagText = rawTag.length > maxTag ? rawTag.slice(0, Math.max(0, maxTag - 1)) + "\u2026" : rawTag;
        const tag = `${ansi.dim}${tagText}${ansi.reset}`;
        const room = Math.max(0, cols - prefixWidth - gapWidth - tagText.length);
        const body = clip(flatten(entry.text), room);
        lines.push(`${selected ? ansi.reverse + "\u25B8 " : "  "}${body}${selected ? ansi.reset : ""}  ${tag}`);
      }
    }
    while (lines.length < rows - 1) lines.push("");
    lines.push(status ? `${ansi.bold}${status}${ansi.reset}` : this.footer());
    return lines.slice(0, rows).map((l) => ansi.clearLine + truncateVisible(l, cols)).join("\r\n");
  }
  footer() {
    if (this.mode === "confirm-delete") return `${ansi.bold}delete this entry? y/n${ansi.reset}`;
    if (this.mode === "filter") return `${ansi.dim}type to filter \xB7 enter/esc done${ansi.reset}`;
    const tab = this.cwd === void 0 ? "" : ` \xB7 tab ${this.currentScope === "repo" ? "all" : "this repo"}`;
    return `${ansi.dim}enter pop \xB7 a apply \xB7 d delete \xB7 / filter${tab} \xB7 esc close${ansi.reset}`;
  }
  scopeLabel() {
    if (this.currentScope === "all") return `all (${this.entries.length})`;
    return `this repo (${this.inScope().length} of ${this.entries.length})`;
  }
  toggleScope() {
    if (this.cwd === void 0) return;
    this.currentScope = this.currentScope === "repo" ? "all" : "repo";
    this.clampIndex();
  }
  clampIndex() {
    this.index = Math.max(0, Math.min(this.index, this.visible().length - 1));
  }
  current() {
    return this.visible()[this.index];
  }
  handleFilterKey(key) {
    if (key === "\r") {
      this.mode = "list";
    } else if (key === "\x1B") {
      this.mode = "list";
      this.filterText = "";
    } else if (key === "\x7F") {
      this.filterText = this.filterText.slice(0, -1);
    } else if (key.length === 1 && key >= " ") {
      this.filterText += key;
    }
    this.index = 0;
    return { type: "none" };
  }
};

// src/core/layout.ts
var PANEL_MAX_ROWS = 10;
var PANEL_CHROME_ROWS = 2;
var FALLBACK_BOTTOM_GAP = 4;
var TOAST_BOTTOM_GAP = 3;
var anchorRow = ({ inputTop, hasBorderAbove }) => inputTop === null ? null : inputTop - (hasBorderAbove ? 1 : 0);
function panelPlacement(input) {
  const rows = Math.max(1, input.rows);
  const height = Math.min(Math.max(input.entryCount, 1) + PANEL_CHROME_ROWS, PANEL_MAX_ROWS, rows);
  const anchor = anchorRow(input);
  const anchored = anchor === null ? -1 : anchor - height;
  const preferred = anchored < 0 ? rows - height - FALLBACK_BOTTOM_GAP : anchored;
  const top = Math.max(0, Math.min(preferred, rows - height));
  return { top, height };
}
function toastRow(input) {
  const anchor = anchorRow(input);
  const above = anchor === null ? -1 : anchor - 1;
  return above < 0 ? Math.max(0, input.rows - TOAST_BOTTOM_GAP) : above;
}

// src/core/inject.ts
var PASTE_START2 = "\x1B[200~";
var PASTE_END2 = "\x1B[201~";
var yieldTick = () => new Promise((r) => setTimeout(r, 0));
async function injectPaste(target, text, chunkSize = 512) {
  const body = text.replace(/\r?\n/g, "\r");
  target.write(PASTE_START2);
  for (let i = 0; i < body.length; i += chunkSize) {
    target.write(body.slice(i, i + chunkSize));
    await yieldTick();
  }
  target.write(PASTE_END2);
}

// src/core/pastes.ts
var PASTE_START3 = "\x1B[200~";
var PASTE_END3 = "\x1B[201~";
var PasteRecorder = class {
  buffer = null;
  feed(text) {
    const done = [];
    let rest = text;
    while (rest) {
      if (this.buffer === null) {
        const start = rest.indexOf(PASTE_START3);
        if (start < 0) break;
        this.buffer = "";
        rest = rest.slice(start + PASTE_START3.length);
        continue;
      }
      const end = rest.indexOf(PASTE_END3);
      if (end < 0) {
        this.buffer += rest;
        break;
      }
      done.push((this.buffer + rest.slice(0, end)).replace(/\r\n?/g, "\n"));
      this.buffer = null;
      rest = rest.slice(end + PASTE_END3.length);
    }
    return done;
  }
};
var RECENT_PASTES = 50;
var charCount = (text) => [...text].length;
var PasteLabels = class {
  constructor(label) {
    this.label = label;
  }
  label;
  byNumber = /* @__PURE__ */ new Map();
  highest = 0;
  recent = [];
  remember(pasted) {
    this.recent.push(pasted);
    if (this.recent.length > RECENT_PASTES) this.recent.shift();
  }
  /**
   * Maps placeholder numbers that are new on screen to the pastes that produced them. Numbers
   * only ever grow and a short paste gets no placeholder at all, so k new numbers belong to the
   * last k pastes, in order. Returns whether any new number was found.
   */
  learn(screenText, pastes) {
    if (this.label.key !== "number") return false;
    const fresh = [...new Set([...screenText.matchAll(this.label.pattern)].map((m) => Number(m[1])))].filter((n) => n > this.highest).sort((a, b) => a - b);
    if (!fresh.length || !pastes.length) return false;
    const owners = pastes.slice(-fresh.length);
    fresh.slice(-owners.length).forEach((n, i) => this.byNumber.set(n, owners[i]));
    this.highest = fresh[fresh.length - 1];
    return true;
  }
  /** The text with every placeholder replaced, or null when one of them can't be matched to a paste. */
  expand(text) {
    const bySize = this.label.key === "chars" ? this.sizeQueues(text) : null;
    let unknown = false;
    const out = text.replace(this.label.pattern, (whole, n) => {
      const pasted = bySize ? bySize.get(Number(n))?.shift() : this.byNumber.get(Number(n));
      if (pasted === void 0) unknown = true;
      return pasted ?? whole;
    });
    return unknown ? null : out;
  }
  // For k placeholders of one size, the last k pastes of that size, oldest first: the box
  // lists pastes in the order they were made.
  sizeQueues(text) {
    const wanted = /* @__PURE__ */ new Map();
    for (const match of text.matchAll(this.label.pattern)) wanted.set(Number(match[1]), (wanted.get(Number(match[1])) ?? 0) + 1);
    const queues = /* @__PURE__ */ new Map();
    for (const [size, count] of wanted) queues.set(size, this.recent.filter((p) => charCount(p) === size).slice(-count));
    return queues;
  }
};

// src/app.ts
var TOAST_MS = 3e3;
var ESC_FLUSH_MS = 25;
var PASTE_PENDING_MS = 5e3;
var PASTE_LEARN_MS = 100;
var TOAST_REDRAW_MS = 80;
var lastScope = "repo";
var describeError = (err) => err instanceof Error ? err.message : String(err);
var isCmdScript = (file) => /\.(cmd|bat)$/i.test(file);
function passthrough(command, args, env) {
  return new Promise((resolve2, reject) => {
    const child = spawn2(command, args, { stdio: "inherit", env, shell: isCmdScript(command) });
    const ignoreSigint = () => {
    };
    process.on("SIGINT", ignoreSigint);
    child.on("error", (err) => {
      process.off("SIGINT", ignoreSigint);
      reject(err);
    });
    child.on("exit", (code, signal) => {
      process.off("SIGINT", ignoreSigint);
      resolve2(code ?? (signal ? 128 + (osConstants.signals[signal] ?? 0) : 0));
    });
  });
}
async function runApp(opts) {
  const { adapter } = opts;
  const childEnv = { ...process.env, PATH: stripShimDir(process.env.PATH) };
  const real = findRealBinary(adapter.command, childEnv);
  if (!real) throw new Error(`${adapter.command} not found on PATH (install ${adapter.name} first)`);
  if (process.env.STASH_OFF) return passthrough(real, opts.args, childEnv);
  const command = isCmdScript(real) ? process.env.comspec ?? "cmd.exe" : real;
  const args = isCmdScript(real) ? ["/c", real, ...opts.args] : opts.args;
  const record = opts.record || Boolean(process.env.STASH_RECORD);
  const config = await loadConfig();
  for (const [spec, command2] of [
    [config.hotkey, "stash hotkey <key>"],
    [config.listHotkey, "stash hotkey list <key>"]
  ]) {
    if (adapter.reservedKeys.includes(spec.toLowerCase())) {
      process.stderr.write(`prompt-shelf: hotkey ${spec} is reserved by ${adapter.name}; pick another with \`${command2}\`
`);
      return 2;
    }
  }
  const hotkey = parseHotkey(config.hotkey);
  const listHotkey = parseHotkey(config.listHotkey);
  if (listHotkey.label === hotkey.label) {
    process.stderr.write(`prompt-shelf: the stash and list hotkeys are both ${hotkey.label}; change one with \`stash hotkey list <key>\`
`);
    return 2;
  }
  const hotkeys = [hotkey, listHotkey];
  const isHotkey = (chunk) => hotkeys.some((h) => h.sequences.some((seq) => chunk.equals(seq)));
  const store = new Store(stashFile);
  const stdout = process.stdout;
  const stdin = process.stdin;
  const cols = () => stdout.columns || 80;
  const rows = () => stdout.rows || 24;
  const screen = new Screen(cols(), rows());
  const input = new StdinPipeline(new KeyInterceptor(hotkeys));
  const pty = spawnAgent({ command, args, cols: cols(), rows: rows(), cwd: process.cwd(), env: childEnv });
  let overlay = null;
  let panel = null;
  let openDraft = null;
  const pastes = new PasteRecorder();
  const pasteLabels = adapter.pasteLabel ? new PasteLabels(adapter.pasteLabel) : null;
  let pendingPastes = [];
  let learnTimer = null;
  const learnPastes = () => {
    if (!pasteLabels || !pendingPastes.length) return;
    const now = Date.now();
    pendingPastes = pendingPastes.filter((p) => now - p.at < PASTE_PENDING_MS);
    if (pasteLabels.learn(screen.lines().join("\n"), pendingPastes.map((p) => p.text))) pendingPastes = [];
  };
  const scheduleLearn = () => {
    if (learnTimer) clearTimeout(learnTimer);
    learnTimer = setTimeout(learnPastes, PASTE_LEARN_MS);
  };
  let toastTimer = null;
  let toastBar = null;
  let toastRedraw = null;
  let escTimer = null;
  const repaintAgent = () => {
    stdout.write(ansi.clearScreen + ansi.home + screen.serialize() + ansi.showCursor);
  };
  const inputAnchor = () => {
    const lines = screen.lines();
    const inputTop = adapter.inputTop(lines);
    const hasBorderAbove = inputTop !== null && inputTop > 0 && adapter.isBorder(lines[inputTop - 1] ?? "");
    return { rows: rows(), inputTop, hasBorderAbove };
  };
  const drawOverlay = (status) => {
    if (!overlay) return;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = null;
    toastBar = null;
    const next = panelPlacement({ ...inputAnchor(), entryCount: overlay.visible().length });
    if (panel && (panel.top !== next.top || panel.height !== next.height)) repaintAgent();
    panel = next;
    const frame = overlay.render(cols(), next.height, status).split("\r\n");
    stdout.write(ansi.hideCursor + frame.map((line, i) => ansi.moveTo(next.top + i, 0) + line).join(""));
  };
  const drawToast = () => {
    if (!toastBar || overlay) return;
    stdout.write("\x1B7" + ansi.moveTo(toastRow(inputAnchor()), 0) + toastBar + "\x1B8");
  };
  const toast = (message) => {
    if (toastTimer) clearTimeout(toastTimer);
    if (overlay) {
      drawOverlay(message);
      toastTimer = setTimeout(() => drawOverlay(), TOAST_MS);
      return;
    }
    toastBar = ansi.reverse + fitVisible(` ${message} `, cols()) + ansi.reset;
    drawToast();
    toastTimer = setTimeout(() => {
      toastBar = null;
      repaintAgent();
    }, TOAST_MS);
  };
  const guard = (fn) => {
    Promise.resolve().then(fn).catch((err) => toast(`error: ${describeError(err)}`));
  };
  const onProcessError = (err) => toast(`error: ${describeError(err)}`);
  const recordFrame = async () => {
    await screen.write("");
    const file = join3(stashDir, `record-${adapter.name}-${Date.now()}.txt`);
    await writeFile3(file, screen.lines().join("\n") + `
--- cursor ${JSON.stringify(screen.cursor())}
`);
    toast(`recorded ${file}`);
  };
  const openOverlay = async (draft) => {
    openDraft = draft;
    overlay = new Overlay(await store.list(), { hotkeyLabel: hotkey.label, cwd: process.cwd(), scope: lastScope });
    drawOverlay();
  };
  const readDraft = async () => {
    await screen.write("");
    return adapter.readDraft(screen.lines({ dropDim: adapter.dimPlaceholder }), screen.cursor(), screen.cols);
  };
  const stash = async () => {
    const draft = await readDraft();
    if (!draft) return toast("nothing to stash");
    learnPastes();
    const text = pasteLabels ? pasteLabels.expand(draft.text) : draft.text;
    if (text === null || adapter.unsafeDraft.test(text)) return toast("draft contains a collapsed paste \u2014 expand it first");
    await store.add({ text, agent: adapter.name, cwd: process.cwd() });
    pty.write(adapter.clearDraft(draft));
    toast(`stashed (${(await store.list()).length})`);
  };
  const placeEntry = async (text) => {
    const draft = openDraft;
    openDraft = null;
    await injectPaste(pty, draft ? "\n" + text : text);
    return draft !== null;
  };
  const placedToast = async (type, appended) => {
    if (type === "pop") return `${appended ? "appended" : "popped"} \xB7 ${(await store.list()).length} left`;
    return appended ? "appended (kept)" : "applied (kept in stash)";
  };
  const closeOverlay = () => {
    if (overlay) lastScope = overlay.scope;
    overlay = null;
    panel = null;
    repaintAgent();
  };
  const LIST_KEY = 1;
  const onHotkey = async (index) => {
    if (record) return recordFrame();
    if (index === LIST_KEY) return openOverlay(await readDraft());
    await stash();
  };
  const onOverlayKey = async (key) => {
    if (!overlay) return;
    const action = overlay.handleKey(key);
    switch (action.type) {
      case "close":
        closeOverlay();
        break;
      case "pop":
      case "apply": {
        closeOverlay();
        const appended = await placeEntry(action.entry.text);
        if (action.type === "pop") await store.remove(action.entry.id);
        toast(await placedToast(action.type, appended));
        break;
      }
      case "delete":
        await store.remove(action.entry.id);
        overlay.update(await store.list());
        drawOverlay();
        break;
      default:
        drawOverlay();
    }
  };
  pty.onData((data) => {
    try {
      void screen.write(data);
      if (!overlay) stdout.write(data);
      if (pendingPastes.length) scheduleLearn();
      if (toastBar && !overlay) {
        if (toastRedraw) clearTimeout(toastRedraw);
        toastRedraw = setTimeout(drawToast, TOAST_REDRAW_MS);
      }
    } catch (err) {
      toast(`error: ${describeError(err)}`);
    }
  });
  stdin.setRawMode?.(true);
  stdin.resume();
  stdin.on("data", (chunk) => {
    guard(() => {
      if (overlay) {
        if (isHotkey(chunk)) {
          closeOverlay();
          return;
        }
        const key = input.decodeOnly(chunk);
        if (key) guard(() => onOverlayKey(key));
        return;
      }
      const { text, presses } = input.feed(chunk);
      if (text) pty.write(text);
      for (const pasted of pastes.feed(text)) {
        if (!pasteLabels) continue;
        pasteLabels.remember(pasted);
        pendingPastes.push({ text: pasted, at: Date.now() });
        scheduleLearn();
      }
      for (const index of presses) guard(() => onHotkey(index));
      if (escTimer) clearTimeout(escTimer);
      if (input.hasPending) {
        escTimer = setTimeout(() => {
          if (overlay) return;
          const rest = input.flush();
          if (rest) pty.write(rest);
        }, ESC_FLUSH_MS);
      }
    });
  });
  stdout.on("resize", () => {
    guard(() => {
      screen.resize(cols(), rows());
      pty.resize(cols(), rows());
      if (overlay) drawOverlay();
    });
  });
  process.on("uncaughtException", onProcessError);
  process.on("unhandledRejection", onProcessError);
  return new Promise((resolve2) => {
    pty.onExit((code) => {
      if (escTimer) clearTimeout(escTimer);
      if (toastTimer) clearTimeout(toastTimer);
      if (toastRedraw) clearTimeout(toastRedraw);
      if (learnTimer) clearTimeout(learnTimer);
      process.off("uncaughtException", onProcessError);
      process.off("unhandledRejection", onProcessError);
      if (overlay) closeOverlay();
      stdout.write(ansi.saneEpilogue);
      stdin.setRawMode?.(false);
      stdin.pause();
      resolve2(code);
    });
  });
}

// src/cli.ts
import { existsSync as existsSync2 } from "fs";
import { basename as basename2, join as join4 } from "path";
var { version } = createRequire(import.meta.url)("../package.json");
function parseArgs(argv) {
  let record = false;
  const rest = [...argv];
  if (rest[0] === "--record") {
    record = true;
    rest.shift();
  }
  const [first, ...args] = rest;
  if (!first || first === "--help" || first === "-h") return { kind: "help" };
  if (first === "--version" || first === "-v") return { kind: "version" };
  const all = args.includes("--all");
  const positional = args.filter((a) => a !== "--all");
  if (first === "list") return { kind: "list", all };
  if (first === "add") return { kind: "add", text: args.join(" ") };
  if (first === "rm") return { kind: "rm", ref: positional[0] ?? "", all };
  if (first === "pop") return { kind: "pop", ref: positional[0], all };
  if (first === "enable" || first === "disable" || first === "doctor") return { kind: first };
  if (first === "hotkey") return args[0] === "list" ? { kind: "hotkey", list: true, spec: args[1] } : { kind: "hotkey", list: false, spec: args[0] };
  return { kind: "run", agent: first, args, record };
}
var help = `prompt-shelf ${version}

Usage:
  stash <agent> [agent args...]   run an agent with stash support (${adapterNames.join(", ")})
  stash --record <agent>          run, but the hotkey dumps the screen to ~/.prompt-shelf/ (for adapter tuning)
  stash list [--all]              print entries stashed in this repo (--all: every repo)
  stash add <text>                stash text from the command line
  stash pop [n] [--all]           print entry n of that listing (1 = newest) and remove it
  stash rm <n> [--all]            remove entry n of that listing
  stash enable                    install shims so plain ${adapterNames.join(" / ")} run through stash
  stash disable                   remove the shims and the PATH line
  stash doctor                    show shim dir, shims, and real agent binaries
  stash hotkey [key]              show both hotkeys, or set the stash hotkey (ctrl+<letter> or f1..f12), e.g. stash hotkey f2
  stash hotkey list [key]         show or set the list hotkey

Env:
  STASH_OFF=1 <agent>             run the real binary directly (no wrapper)
  STASH_RECORD=1 <agent>          same as stash --record <agent>

Hotkeys:
  ctrl+f  stash what is in the box
  ctrl+q  open the list; the entry you pick is added after what you typed
Config: ~/.prompt-shelf/config.json  { "hotkey": "ctrl+f", "listHotkey": "ctrl+q" }
`;
async function runHotkeyCommand(spec, filePath = configFile, list = false) {
  const config = await loadConfig(filePath);
  if (spec === void 0) {
    if (list) return { code: 0, message: `list hotkey: ${config.listHotkey}` };
    return { code: 0, message: `hotkey: ${config.hotkey}
list hotkey: ${config.listHotkey}` };
  }
  let label;
  try {
    label = parseHotkey(spec).label;
  } catch (err) {
    return { code: 1, message: err instanceof Error ? err.message : String(err) };
  }
  const owners = reservedBy(label);
  if (owners.length) return { code: 1, message: `${label} is reserved by ${owners.join(", ")}; pick another` };
  const other = list ? config.hotkey : config.listHotkey;
  if (label === other) return { code: 1, message: `${label} is already the ${list ? "stash" : "list"} hotkey; pick another` };
  await saveConfig(list ? { listHotkey: label } : { hotkey: label }, filePath);
  return { code: 0, message: `${list ? "list hotkey" : "hotkey"} set to ${label} \u2014 takes effect in new sessions` };
}
var scopeOf = ({ all }) => all ? "all" : "repo";
var REMOVED_PREVIEW = 60;
var describeRemoved = (e) => {
  const flat = e.text.replace(/\r?\n/g, " \u23CE ");
  const preview = [...flat].length > REMOVED_PREVIEW ? [...flat].slice(0, REMOVED_PREVIEW).join("") + "\u2026" : flat;
  return `removed: [${e.agent} \xB7 ${basename2(e.cwd)}] ${preview}`;
};
var formatEntry = (e, i) => `${i + 1}. [${e.agent} \xB7 ${e.cwd}] ${e.text.replace(/\r?\n/g, " \u23CE ")}`;
function listLines(entries, scope) {
  const shown = scoped(entries, scopeOf(scope), scope.cwd);
  const lines = shown.map(formatEntry);
  const hidden = entries.length - shown.length;
  if (hidden > 0) lines.push(`${hidden} more in other repos \u2014 stash list --all`);
  return lines;
}
function resolveRef(entries, ref, scope) {
  const shown = scoped(entries, scopeOf(scope), scope.cwd);
  const n = Number.parseInt(ref ?? "1", 10);
  if (!Number.isInteger(n) || n < 1 || n > shown.length) throw new Error(`no entry ${ref ?? "1"} (have ${shown.length})`);
  return shown[n - 1];
}
async function main(argv) {
  const parsed = parseArgs(argv);
  const store = new Store(stashFile);
  switch (parsed.kind) {
    case "help":
      process.stdout.write(help);
      return 0;
    case "version":
      process.stdout.write(version + "\n");
      return 0;
    case "list": {
      const lines = listLines(await store.list(), { all: parsed.all, cwd: process.cwd() });
      if (lines.length) process.stdout.write(lines.join("\n") + "\n");
      return 0;
    }
    case "add":
      if (!parsed.text) throw new Error("nothing to add");
      await store.add({ text: parsed.text, agent: "cli", cwd: process.cwd() });
      return 0;
    case "pop": {
      const entry = resolveRef(await store.list(), parsed.ref, { all: parsed.all, cwd: process.cwd() });
      process.stdout.write(entry.text + "\n");
      await store.remove(entry.id);
      process.stderr.write(describeRemoved(entry) + "\n");
      return 0;
    }
    case "rm": {
      const entry = resolveRef(await store.list(), parsed.ref, { all: parsed.all, cwd: process.cwd() });
      await store.remove(entry.id);
      process.stderr.write(describeRemoved(entry) + "\n");
      return 0;
    }
    case "enable": {
      const lines = describeInstall(await installShims());
      process.stdout.write(lines.join("\n") + "\n");
      return 0;
    }
    case "disable": {
      const lines = describeRemove(await removeShims());
      process.stdout.write(lines.join("\n") + "\n");
      return 0;
    }
    case "doctor": {
      const onPath = shimDirOnPath();
      const lines = [`shim dir: ${shimDir}`, `on PATH: ${onPath ? "yes" : "no"}`];
      for (const name of adapterNames) {
        const shimmed = existsSync2(join4(shimDir, name)) || existsSync2(join4(shimDir, `${name}.cmd`));
        lines.push(`${name}: shim ${shimmed ? "installed" : "missing"}, real binary ${findRealBinary(name) ?? "not found"}`);
      }
      if (!onPath) lines.push(`fix: ${pathHint()}`);
      process.stdout.write(lines.join("\n") + "\n");
      return 0;
    }
    case "hotkey": {
      const { code, message } = await runHotkeyCommand(parsed.spec, configFile, parsed.list);
      (code ? process.stderr : process.stdout).write(message + "\n");
      return code;
    }
    case "run": {
      const adapter = getAdapter(parsed.agent);
      if (!adapter) throw new Error(`unknown agent "${parsed.agent}". Supported: ${adapterNames.join(", ")}`);
      return runApp({ adapter, args: parsed.args, record: parsed.record });
    }
  }
}
export {
  describeRemoved,
  listLines,
  main,
  parseArgs,
  resolveRef,
  runHotkeyCommand
};
//# sourceMappingURL=cli.js.map