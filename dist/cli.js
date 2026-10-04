import {
  PASTE_END,
  PASTE_START,
  adapterNames,
  allAdapters,
  clip,
  describeInstall,
  describeRemove,
  findRealBinary,
  fitLine,
  flatten,
  getAdapter,
  installShims,
  isCmdScript,
  padCells,
  pathHint,
  removeShims,
  reservedBy,
  scoped,
  shimDir,
  shimDirOnPath,
  stripShimDir,
  truncateLine,
  visibleWidth
} from "./chunk-GH7BL566.js";

// package.json
var package_default = {
  name: "prompt-shelf",
  version: "0.1.3",
  description: "Stash multiple prompts for later in Claude Code and Codex CLI: Ctrl+F to park a draft, Ctrl+Q to bring it back. Persistent, per repo.",
  type: "module",
  license: "MIT",
  author: "Sourabh Shegane (https://github.com/sourabhshegane)",
  homepage: "https://github.com/sourabhshegane/prompt-shelf#readme",
  repository: {
    type: "git",
    url: "git+https://github.com/sourabhshegane/prompt-shelf.git"
  },
  bugs: {
    url: "https://github.com/sourabhshegane/prompt-shelf/issues"
  },
  bin: {
    stash: "bin/stash.js"
  },
  keywords: [
    "prompt-library",
    "prompt-shelf",
    "claude-code",
    "claude",
    "anthropic",
    "codex",
    "openai-codex",
    "coding-agent",
    "ai-agent",
    "ai-coding",
    "prompt",
    "prompt-stash",
    "prompt-queue",
    "stash",
    "clipboard",
    "terminal",
    "tui",
    "cli",
    "pty",
    "developer-tools",
    "productivity"
  ],
  files: [
    "bin",
    "dist",
    "scripts",
    "README.md",
    "docs/install"
  ],
  engines: {
    node: ">=20"
  },
  scripts: {
    build: "tsup",
    dev: "tsup --watch",
    test: "vitest run",
    typecheck: "tsc --noEmit",
    postinstall: "node scripts/postinstall.js",
    prepublishOnly: "npm run typecheck && npm test && npm run build"
  },
  dependencies: {
    "@xterm/addon-serialize": "^0.14.0",
    "@xterm/headless": "^6.0.0",
    "node-pty": "^1.1.0"
  },
  devDependencies: {
    "@types/node": "^24.0.0",
    tsup: "^8.5.1",
    typescript: "^5.6.0",
    vitest: "^5.0.1"
  }
};

// src/errors.ts
var UserError = class extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.exitCode = exitCode;
    this.name = "UserError";
  }
  exitCode;
};
var describeError = (err) => err instanceof Error ? err.message : String(err);

// src/debug.ts
import { appendFileSync, mkdirSync } from "fs";
import { dirname, join as join2 } from "path";

// src/storage/paths.ts
import { homedir } from "os";
import { join } from "path";
function dataDir(env = process.env) {
  return env.PROMPT_SHELF_DIR || join(homedir(), ".prompt-shelf");
}
var stashDir = dataDir();
var promptsFile = join(stashDir, "stash.jsonl");
var shelvesFile = join(stashDir, "shelves.json");
var configFile = join(stashDir, "config.json");

// src/debug.ts
function debugLogFile(env = process.env) {
  const setting = env.PROMPT_SHELF_DEBUG;
  if (!setting || setting === "0") return null;
  return setting === "1" || setting.toLowerCase() === "true" ? join2(dataDir(env), "debug.log") : setting;
}
var file = debugLogFile();
function debug(area, message, data) {
  if (!file) return;
  try {
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, `${(/* @__PURE__ */ new Date()).toISOString()} ${area} ${message}${data ? " " + JSON.stringify(data) : ""}
`);
  } catch {
  }
}

// src/storage/files.ts
import { chmod, mkdir, open, readFile, rename, rm, stat } from "fs/promises";
import { fsyncSync } from "fs";
import { randomUUID } from "crypto";
import { dirname as dirname2 } from "path";
var LOCK_RETRY_MS = 15;
var LOCK_TIMEOUT_MS = 5e3;
var STALE_LOCK_MS = 1e4;
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function withFileLock(file2, fn) {
  const lock = `${file2}.lock`;
  const lockToken = `${process.pid}-${randomUUID()}`;
  await mkdir(dirname2(file2), { recursive: true, mode: 448 });
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  for (; ; ) {
    try {
      const handle = await open(lock, "wx");
      await handle.writeFile(lockToken);
      await handle.close();
      break;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
      const age = await stat(lock).then((s) => Date.now() - s.mtimeMs, () => 0);
      if (age > STALE_LOCK_MS) {
        debug("lock", "removed a stale lock", { file: lock, ageMs: Math.round(age) });
        await rm(lock, { force: true });
      } else if (Date.now() > deadline) throw new UserError(`${file2} is locked by another prompt-shelf session`);
      else await sleep(LOCK_RETRY_MS);
    }
  }
  try {
    return await fn();
  } finally {
    try {
      const content = await readTextIfExists(lock);
      if (content === lockToken) await rm(lock, { force: true });
    } catch {
    }
  }
}
async function writeFileAtomic(file2, content) {
  await mkdir(dirname2(file2), { recursive: true, mode: 448 });
  const tmp = `${file2}.${process.pid}.${randomUUID()}.tmp`;
  const fd = await open(tmp, "w");
  try {
    await fd.writeFile(content, "utf8");
    try {
      fsyncSync(fd.fd);
    } catch {
    }
  } finally {
    await fd.close();
  }
  try {
    await chmod(tmp, 384);
  } catch {
  }
  await rename(tmp, file2);
}
async function readTextIfExists(file2) {
  try {
    return await readFile(file2, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

// src/storage/config.ts
var DEFAULT_CONFIG = { hotkey: "ctrl+f", listHotkey: "ctrl+q" };
async function readRaw(filePath) {
  const raw = await readTextIfExists(filePath);
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
  return { ...DEFAULT_CONFIG, ...raw };
}
async function saveConfig(partial, filePath = configFile) {
  await withFileLock(filePath, async () => {
    const merged = { ...await readRaw(filePath), ...partial };
    await writeFileAtomic(filePath, JSON.stringify(merged, null, 2) + "\n");
  });
}

// src/storage/prompt-store.ts
import { appendFile } from "fs/promises";
import { randomUUID as randomUUID2 } from "crypto";

// src/domain/prompt.ts
var isStashDraft = (p) => !p.shelfId && !p.shelf;
var onShelf = (nameOrId) => (p) => {
  if (p.shelfId === nameOrId) return true;
  return p.shelf?.toLowerCase() === nameOrId.toLowerCase();
};
var SORT_ORDERS = ["newest", "most-used", "recent"];
var nextSort = (order) => SORT_ORDERS[(SORT_ORDERS.indexOf(order) + 1) % SORT_ORDERS.length];
function sortSaved(prompts, order) {
  if (order === "most-used") return [...prompts].sort((a, b) => (b.usedCount ?? 0) - (a.usedCount ?? 0));
  if (order === "recent") return [...prompts].sort((a, b) => (b.lastUsedAt ?? "").localeCompare(a.lastUsedAt ?? ""));
  return prompts;
}

// src/storage/prompt-store.ts
var FILE_VERSION = 2;
var isFileHeader = (value) => {
  const v = value;
  return typeof v === "object" && v !== null && typeof v.version === "number";
};
var isPrompt = (value) => {
  const v = value;
  return typeof v === "object" && v !== null && ["id", "text", "agent", "cwd", "createdAt"].every((k) => typeof v[k] === "string") && (v.shelfId === void 0 || typeof v.shelfId === "string") && (v.shelf === void 0 || typeof v.shelf === "string");
};
var Store = class {
  constructor(filePath) {
    this.filePath = filePath;
  }
  filePath;
  /** Prompts, oldest first, plus lines that aren't prompts; those are kept verbatim on every rewrite. */
  async read() {
    const raw = await readTextIfExists(this.filePath) ?? "";
    const prompts = [];
    const unreadable = [];
    let version2 = 1;
    const lines = raw.split("\n");
    let startIdx = 0;
    if (lines.length > 0 && lines[0]) {
      try {
        const firstParsed = JSON.parse(lines[0]);
        if (isFileHeader(firstParsed)) {
          version2 = firstParsed.version;
          if (version2 > FILE_VERSION) throw new UserError(`${this.filePath} is from a newer version (v${version2}); upgrade prompt-shelf`);
          startIdx = 1;
        }
      } catch (err) {
        if (!(err instanceof UserError)) startIdx = 0;
        else throw err;
      }
    }
    for (const line of lines.slice(startIdx)) {
      if (!line.trim()) continue;
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch {
        unreadable.push(line);
        continue;
      }
      if (isPrompt(parsed)) prompts.push(parsed);
      else unreadable.push(line);
    }
    return { prompts, unreadable, version: version2 };
  }
  /** Newest first. */
  async list() {
    return (await this.read()).prompts.reverse();
  }
  async add(input) {
    const { shelf, ...rest } = input;
    const prompt = { id: randomUUID2(), createdAt: (/* @__PURE__ */ new Date()).toISOString(), ...rest, ...shelf ? { shelf } : {} };
    await withFileLock(this.filePath, async () => {
      const raw = await readTextIfExists(this.filePath) ?? "";
      if (!raw || !raw.includes('"version"') && raw.trim() === "") {
        const { prompts, unreadable } = await this.read();
        const header = JSON.stringify({ version: FILE_VERSION });
        const lines = [header, ...unreadable, ...prompts.map((e) => JSON.stringify(e)), JSON.stringify(prompt)];
        await writeFileAtomic(this.filePath, lines.join("\n") + "\n");
      } else {
        await appendFile(this.filePath, JSON.stringify(prompt) + "\n", "utf8");
      }
    });
    return prompt;
  }
  async remove(id) {
    return this.change((prompts) => {
      const i = prompts.findIndex((e) => e.id === id);
      if (i < 0) return false;
      prompts.splice(i, 1);
      return true;
    });
  }
  /** Moves a prompt onto a shelf; null when the prompt no longer exists (e.g. deleted in another session). */
  async setShelf(id, shelf) {
    return this.change((prompts) => {
      const prompt = prompts.find((e) => e.id === id);
      if (prompt) prompt.shelf = shelf;
      return prompt ?? null;
    });
  }
  /** Counts one use of a prompt that stays saved. */
  async markUsed(id, at = /* @__PURE__ */ new Date()) {
    return this.change((prompts) => {
      const prompt = prompts.find((e) => e.id === id);
      if (!prompt) return null;
      prompt.usedCount = (prompt.usedCount ?? 0) + 1;
      prompt.lastUsedAt = at.toISOString();
      return prompt;
    });
  }
  /** Moves every prompt on shelf `from` to shelf `to`, or deletes them when `to` is null. */
  async reshelve(from, to) {
    return this.change((prompts) => {
      const matches = prompts.filter(onShelf(from));
      if (to === null) prompts.splice(0, prompts.length, ...prompts.filter((e) => !onShelf(from)(e)));
      else for (const e of matches) e.shelf = to;
      return matches.length;
    });
  }
  // Read, change in place and write back, all under the lock. The file is only rewritten when
  // `edit` reports it changed something (a truthy result, or a count above zero).
  async change(edit) {
    return withFileLock(this.filePath, async () => {
      const { prompts, unreadable } = await this.read();
      const result = edit(prompts);
      if (result) {
        const header = JSON.stringify({ version: FILE_VERSION });
        const lines = [header, ...unreadable, ...prompts.map((e) => JSON.stringify(e))];
        await writeFileAtomic(this.filePath, lines.length ? lines.join("\n") + "\n" : "");
      }
      return result;
    });
  }
};

// src/storage/shelf-store.ts
import { randomUUID as randomUUID3 } from "crypto";

// src/domain/shelf.ts
var RESERVED_SHELF_NAMES = ["stash", "skills"];
var MAX_SHELF_NAME = 30;
var DEFAULT_SHELVES = ["Ideas", "To explore", "Common"];
var findShelf = (shelves, name) => shelves.find((n) => n.toLowerCase() === name.trim().toLowerCase());
function validName(name) {
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean) throw new UserError("a shelf needs a name");
  if ([...clean].length > MAX_SHELF_NAME) throw new UserError(`shelf names can be at most ${MAX_SHELF_NAME} characters`);
  if (RESERVED_SHELF_NAMES.includes(clean.toLowerCase())) throw new UserError(`"${clean}" is reserved; pick another name`);
  return clean;
}
function withOrphans(shelves, prompts) {
  const all = [...shelves];
  for (const p of prompts) if (p.shelf && !findShelf(all, p.shelf)) all.push(p.shelf);
  return all;
}

// src/storage/shelf-store.ts
var FILE_VERSION2 = 2;
var Shelves = class {
  constructor(filePath) {
    this.filePath = filePath;
  }
  filePath;
  // A missing file means the defaults; a damaged one is an error, so a save can't silently wipe it.
  async read() {
    const raw = await readTextIfExists(this.filePath);
    if (raw === null) {
      const defaults = DEFAULT_SHELVES.map((name) => ({ id: randomUUID3(), name }));
      return { version: FILE_VERSION2, shelves: defaults, starred: [] };
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new UserError(`${this.filePath} is damaged; fix or delete it (your prompts are safe in the stash file)`);
    }
    const version2 = typeof parsed.version === "number" ? parsed.version : 1;
    if (version2 > FILE_VERSION2) throw new UserError(`${this.filePath} is from a newer version (v${version2}); upgrade prompt-shelf`);
    let shelves;
    if (version2 === 1 && Array.isArray(parsed.shelves) && typeof parsed.shelves[0] === "string") {
      shelves = parsed.shelves.map((name) => ({ id: randomUUID3(), name }));
    } else {
      const isShelves = (v) => Array.isArray(v) && v.every((s) => typeof s === "object" && s !== null && typeof s.id === "string" && typeof s.name === "string");
      shelves = isShelves(parsed.shelves) ? parsed.shelves : [];
    }
    const starred = (v) => Array.isArray(v) ? v.filter((id) => typeof id === "string") : [];
    const starredIds = starred(parsed.starred).filter((id) => shelves.some((s) => s.id === id));
    return { ...parsed, version: FILE_VERSION2, shelves, starred: starredIds };
  }
  // Read, change and save under a lock, so sessions and quick key presses never lose each other's changes.
  async change(edit) {
    return withFileLock(this.filePath, async () => {
      const file2 = await this.read();
      const result = edit(file2);
      await writeFileAtomic(this.filePath, JSON.stringify(file2, null, 2) + "\n");
      return result;
    });
  }
  /** Shelf names in display order: starred ones first, each group in the user's order. */
  async list() {
    const { shelves, starred } = await this.read();
    return [
      ...shelves.filter((s) => starred.includes(s.id)).map((s) => s.name),
      ...shelves.filter((s) => !starred.includes(s.id)).map((s) => s.name)
    ];
  }
  /** Shelf names that are starred. */
  async starred() {
    const { shelves, starred: starredIds } = await this.read();
    return starredIds.map((id) => shelves.find((s) => s.id === id)?.name).filter((n) => n !== void 0);
  }
  /** The shelf object with matching name (case-insensitive). */
  findByName(shelves, name) {
    const target = name.toLowerCase();
    return shelves.find((s) => s.name.toLowerCase() === target);
  }
  /** The stored spelling of a shelf name, matched case-insensitively. */
  async find(name) {
    const shelf = this.findByName((await this.read()).shelves, name);
    return shelf?.name;
  }
  /** The shelf ID with matching name (case-insensitive), or undefined if not found. */
  async findId(name) {
    const shelf = this.findByName((await this.read()).shelves, name);
    return shelf?.id;
  }
  /** Adds a shelf and returns its name; an existing shelf with that name is returned as is. */
  async create(name) {
    const clean = validName(name);
    return this.change((file2) => {
      const existing = this.findByName(file2.shelves, clean);
      if (existing) return existing.name;
      file2.shelves.push({ id: randomUUID3(), name: clean });
      return clean;
    });
  }
  async rename(from, to) {
    const clean = validName(to);
    return this.change((file2) => {
      const current = this.requireByName(file2.shelves, from);
      const clash = this.findByName(file2.shelves, clean);
      if (clash && clash.id !== current.id) throw new UserError(`a shelf named "${clash.name}" already exists`);
      current.name = clean;
      return clean;
    });
  }
  async remove(name) {
    await this.change((file2) => {
      const current = this.requireByName(file2.shelves, name);
      file2.shelves = file2.shelves.filter((s) => s.id !== current.id);
      file2.starred = file2.starred.filter((id) => id !== current.id);
    });
  }
  /** Stars or unstars a shelf; returns whether it is starred now. */
  async toggleStar(name) {
    return this.change((file2) => {
      const current = this.requireByName(file2.shelves, name);
      const isStarred = file2.starred.includes(current.id);
      file2.starred = isStarred ? file2.starred.filter((id) => id !== current.id) : [...file2.starred, current.id];
      return !isStarred;
    });
  }
  /**
   * Moves a shelf one place left (-1) or right (1) in the display order. Starred and other shelves
   * stay in their own groups, so a move never crosses between them. Returns whether it moved.
   */
  async move(name, step) {
    return this.change((file2) => {
      const current = this.requireByName(file2.shelves, name);
      const isStarred = file2.starred.includes(current.id);
      const group = file2.shelves.filter((s) => file2.starred.includes(s.id) === isStarred);
      const neighbourIdx = group.indexOf(current) + step;
      if (neighbourIdx < 0 || neighbourIdx >= group.length) return false;
      const neighbour = group[neighbourIdx];
      const a = file2.shelves.indexOf(current);
      const b = file2.shelves.indexOf(neighbour);
      [file2.shelves[a], file2.shelves[b]] = [file2.shelves[b], file2.shelves[a]];
      return true;
    });
  }
  requireByName(shelves, name) {
    const found = this.findByName(shelves, name);
    if (!found) throw new UserError(`no shelf named "${name}"`);
    return found;
  }
};

// src/system/passthrough.ts
import { spawn } from "child_process";
import { constants as osConstants } from "os";
function passthrough(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env, shell: isCmdScript(command) });
    const ignoreSigint = () => {
    };
    process.on("SIGINT", ignoreSigint);
    child.on("error", (err) => {
      process.off("SIGINT", ignoreSigint);
      reject(err);
    });
    child.on("exit", (code, signal) => {
      process.off("SIGINT", ignoreSigint);
      resolve(code ?? (signal ? 128 + (osConstants.signals[signal] ?? 0) : 0));
    });
  });
}

// src/terminal/ansi.ts
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
var noColor = Boolean(process.env.NO_COLOR);
var trueColor = !noColor && /^(truecolor|24bit)$/i.test(process.env.COLORTERM ?? "");
var colour = (rgb, ansi16) => noColor ? "" : trueColor ? `\x1B[38;2;${rgb.join(";")}m` : `\x1B[${ansi16}m`;
var theme = {
  /** Where you are: the selection marker, keys in the hints. (Current items use reverse video, readable in every theme.) */
  accent: colour([79, 163, 255], 36),
  success: colour([126, 196, 110], 32),
  error: colour([232, 104, 104], 31),
  star: colour([232, 180, 70], 33)
};

// src/terminal/pty.ts
import { accessSync, chmodSync, constants, existsSync, readdirSync } from "fs";
import { createRequire } from "module";
import { dirname as dirname3, join as join3 } from "path";
import * as nodePty from "node-pty";
var helperChecked = false;
function ensureSpawnHelperExecutable() {
  if (helperChecked || process.platform === "win32") return;
  helperChecked = true;
  try {
    const prebuilds = join3(dirname3(createRequire(import.meta.url).resolve("node-pty/package.json")), "prebuilds");
    if (!existsSync(prebuilds)) return;
    for (const entry of readdirSync(prebuilds)) {
      const helper = join3(prebuilds, entry, "spawn-helper");
      if (!existsSync(helper)) continue;
      try {
        accessSync(helper, constants.X_OK);
      } catch {
        chmodSync(helper, 493);
      }
    }
  } catch {
  }
}
function spawnAgent(opts) {
  ensureSpawnHelperExecutable();
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
    onExit: (cb) => void child.onExit(({ exitCode, signal }) => cb(signal ? 128 + signal : exitCode))
  };
}

// src/terminal/screen.ts
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
    return new Promise((resolve) => this.term.write(typeof data === "string" ? data : new Uint8Array(data), resolve));
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

// src/ui/layout.ts
var PANEL_MAX_ROWS = 11;
var FALLBACK_BOTTOM_GAP = 4;
var TOAST_BOTTOM_GAP = 3;
var anchorRow = ({ inputTop, hasBorderAbove }) => inputTop === null ? null : inputTop - (hasBorderAbove ? 1 : 0);
function panelPlacement(input, height = PANEL_MAX_ROWS) {
  const rows = Math.max(1, input.rows);
  const h = Math.min(height, rows);
  const anchor = anchorRow(input);
  const anchored = anchor === null ? -1 : anchor - h;
  const preferred = anchored < 0 ? rows - h - FALLBACK_BOTTOM_GAP : anchored;
  const top = Math.max(0, Math.min(preferred, rows - h));
  return { top, height: h };
}
function toastRow(input) {
  const anchor = anchorRow(input);
  const above = anchor === null ? -1 : anchor - 1;
  return above < 0 ? Math.max(0, input.rows - TOAST_BOTTOM_GAP) : above;
}

// src/session/display.ts
var TOAST_MS = 3e3;
var TOAST_REDRAW_MS = 80;
var Display = class {
  constructor(out, screen, adapter) {
    this.out = out;
    this.screen = screen;
    this.adapter = adapter;
  }
  out;
  screen;
  adapter;
  shown = null;
  placement = null;
  toastBar = null;
  toastTimer = null;
  toastRedraw = null;
  get cols() {
    return this.out.columns || 80;
  }
  get rows() {
    return this.out.rows || 24;
  }
  get panelShown() {
    return this.shown !== null;
  }
  /** The agent's output: passed straight through unless a panel covers the screen. */
  agentOutput(data) {
    if (this.shown) return;
    this.out.write(data);
    if (this.toastBar) {
      if (this.toastRedraw) clearTimeout(this.toastRedraw);
      this.toastRedraw = setTimeout(() => this.drawToast(), TOAST_REDRAW_MS);
    }
  }
  /** Shows `panel` above the input box; `height` defaults to the full panel height. */
  show(panel, height) {
    this.shown = { panel, height };
    this.redraw();
  }
  hide() {
    this.shown = null;
    this.placement = null;
    this.repaintAgent();
  }
  /** Draws the shown panel again, with `status` in place of its key hints. */
  redraw(status) {
    if (!this.shown) return;
    this.clearToast();
    const next = panelPlacement(this.inputAnchor(), this.shown.height);
    if (this.placement && (this.placement.top !== next.top || this.placement.height !== next.height)) this.repaintAgent();
    this.placement = next;
    const frame = this.shown.panel.render(this.cols, next.height, status).split("\r\n");
    this.out.write(ansi.hideCursor + frame.map((line, i) => ansi.moveTo(next.top + i, 0) + line).join(""));
  }
  /** A short message: in the panel's footer when one is shown, otherwise in a bar above the input box. */
  toast(status, ms = TOAST_MS) {
    this.clearToast();
    if (this.shown) {
      this.redraw(status);
      this.toastTimer = setTimeout(() => this.redraw(), ms);
      return;
    }
    const style = status.hint ? ansi.dim : ansi.reverse + (status.error ? theme.error : "");
    this.toastBar = style + fitLine(` ${status.text} `, this.cols) + ansi.reset;
    this.drawToast();
    this.toastTimer = setTimeout(() => {
      this.toastBar = null;
      this.repaintAgent();
    }, ms);
  }
  dispose() {
    this.clearToast();
    if (this.shown) this.hide();
  }
  repaintAgent() {
    this.out.write(ansi.clearScreen + ansi.home + this.screen.serialize() + ansi.showCursor);
  }
  drawToast() {
    if (!this.toastBar || this.shown) return;
    this.out.write("\x1B7" + ansi.moveTo(toastRow(this.inputAnchor()), 0) + this.toastBar + "\x1B8");
  }
  clearToast() {
    for (const timer of [this.toastTimer, this.toastRedraw]) if (timer) clearTimeout(timer);
    this.toastTimer = null;
    this.toastRedraw = null;
    this.toastBar = null;
  }
  inputAnchor() {
    const lines = this.screen.lines();
    const inputTop = this.adapter.inputTop(lines);
    const hasBorderAbove = inputTop !== null && inputTop > 0 && this.adapter.isBorder(lines[inputTop - 1] ?? "");
    return { rows: this.rows, inputTop, hasBorderAbove };
  }
};

// src/terminal/keys.ts
var PASTE_START2 = Buffer.from(PASTE_START);
var PASTE_END2 = Buffer.from(PASTE_END);
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
  throw new UserError(`Unsupported hotkey "${spec}". Use ctrl+<letter> or f1..f12.`);
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
        const marker = this.matchPrefix(data, i, [PASTE_START2, PASTE_END2, ...this.escaped]);
        if (marker === "partial") {
          this.pending = data.subarray(i);
          break;
        }
        if (marker === PASTE_START2 || marker === PASTE_END2) {
          this.inPaste = marker === PASTE_START2;
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
var CSI_U = /^\x1b\[(\d+)(?:;(\d+))?u$/;
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
var ESCAPE_SEQUENCE = /^\x1b(?:\[[0-9;?]*[@-~]|O.)/;
function splitKeys(chunk) {
  const keys = [];
  for (let i = 0; i < chunk.length; ) {
    const seq = chunk[i] === "\x1B" ? ESCAPE_SEQUENCE.exec(chunk.slice(i)) : null;
    const key = seq ? seq[0] : String.fromCodePoint(chunk.codePointAt(i));
    keys.push(normalizeKey(key));
    i += key.length;
  }
  return keys;
}

// src/session/hotkeys.ts
function sessionKeys(config, adapter) {
  for (const [spec, fix] of [
    [config.hotkey, "stash hotkey <key>"],
    [config.listHotkey, "stash hotkey list <key>"]
  ]) {
    if (adapter.reservedKeys.includes(spec.toLowerCase())) throw new UserError(`hotkey ${spec} is reserved by ${adapter.name}; pick another with \`${fix}\``, 2);
  }
  const save = parseHotkey(config.hotkey);
  const list = parseHotkey(config.listHotkey);
  if (save.label === list.label) throw new UserError(`the stash and list hotkeys are both ${save.label}; change one with \`stash hotkey list <key>\``, 2);
  return { save, list };
}

// src/session/record.ts
import { writeFile as writeFile2 } from "fs/promises";
import { join as join4 } from "path";
async function recordScreen(screen, dir, agent) {
  await screen.write("");
  const base = join4(dir, `record-${agent}-${Date.now()}`);
  await writeFile2(`${base}.txt`, screen.lines().join("\n") + `
--- cursor ${JSON.stringify(screen.cursor())}
`);
  await writeFile2(`${base}.ans`, screen.serialize());
  return `${base}.txt`;
}

// src/i18n/en.ts
var en = {
  // Session actions and effects
  "save.nothing": "nothing to stash",
  "save.collapsedPaste": "draft contains a collapsed paste \u2014 expand it first",
  "save.stashed": "stashed ({count})",
  "save.savedTo": "saved to {shelf}",
  "actions.poppedLeft": "popped \xB7 {left} left",
  "actions.appendedLeft": "appended \xB7 {left} left",
  "actions.keptStash": "used \xB7 kept in stash",
  "actions.appendedKeptStash": "appended \xB7 kept in stash",
  "actions.keptShelf": "used \xB7 kept on {shelf}",
  "actions.appendedShelf": "appended \xB7 kept on {shelf}",
  "actions.skillInserted": "skill: {name}",
  "actions.deleted": "deleted",
  "actions.changedOtherSession": "that prompt was changed in another session",
  "actions.shelfReady": "shelf {name} is ready",
  "actions.alreadyFirst": "already first",
  "actions.alreadyLast": "already last",
  "actions.starredShelf": "starred {shelf}",
  "actions.unstarredShelf": "unstarred {shelf}",
  // Start-up notice and the Claude Code status line
  "welcome.keys": "prompt-shelf on \xB7 {save} park \xB7 {list} list",
  "welcome.parked_one": "1 draft parked here",
  "welcome.parked_other": "{count} drafts parked here",
  "statusline.parked_one": "\u2301 1 parked \xB7 {list}",
  "statusline.parked_other": "\u2301 {count} parked \xB7 {list}",
  "statusline.idle": "\u2301 stash \xB7 {save} park \xB7 {list} list",
  // List panel
  "list.noSkillsFor": "no skills found for {agent} here",
  "list.emptyShelf": "{name} is empty \u2014 on the stash tab press s on a draft to save it here",
  "list.emptyStashTab": "nothing stashed here \u2014 tab to see all ({count})",
  "list.emptyStash": "nothing stashed \u2014 type in the agent's box and press {hotkey}",
  "list.deletePrompt": "delete this prompt?",
  "list.deleteYes": "yes",
  "list.deleteNo": "no",
  "list.filterDone": "enter done \xB7 esc clear",
  "list.newShelfHint": "enter create \xB7 esc cancel",
  "list.renameShelfLabel": "rename shelf:",
  "list.renameShelfHint": "enter rename \xB7 esc cancel",
  "list.deleteShelf": "delete {name}?",
  "list.deleteShelfWithPrompts": "delete {name} and its {count}?",
  "list.pickShelfHint": "\u2190\u2192 choose \xB7 enter save \xB7 n new shelf \xB7 esc cancel",
  "list.saveToShelf": "save to shelf:",
  "list.noMatches": "no matches for /{query}",
  "list.skillsTip": "what {agent} can use in this folder \xB7 enter names one in the box",
  "list.savedPromptsTip": "saved prompts \xB7 they stay here when you use them \xB7 {sort}",
  "list.draftsTip": "drafts you parked {where} \xB7 used once, then gone",
  "list.draftsCross": "from every repo ({count})",
  "list.draftsThisRepo": "in this repo ({shown} of {total})",
  "list.filterIndicator": "/{query}",
  "list.stashTab": "Stash",
  "list.skillsTab": "Skills",
  "list.newShelfButton": "+ new",
  "list.switchLists": "\u2190\u2192 switch list",
  "list.key.navUp": "\u2191  \u2193  j  k",
  "list.key.moveUp": "move",
  "list.key.switchTab": "\u2190  \u2192",
  "list.key.switchList": "switch list",
  "list.key.enter": "enter",
  "list.key.useSkill": "put the skill in the box, the way {agent} runs skills",
  "list.key.search": "search skills",
  "list.key.moreKeys": "more keys",
  "list.key.closeList": "close the list",
  "list.key.usePrompt": "use",
  "list.key.putDraft": "put the draft in the box (it leaves the stash)",
  "list.key.keepDraft": "put the draft in the box and keep it",
  "list.key.usePromptKeep": "put the prompt in the box (it stays on the shelf)",
  "list.key.saveDraft": "save to a shelf",
  "list.key.movePrompt": "move to another shelf",
  "list.key.newShelf": "new shelf",
  "list.key.sortNext": "sort: {next} next",
  "list.key.starShelf": "{action} this shelf (starred come first)",
  "list.key.moveShelfLR": "move this list left / right",
  "list.key.scopeToggle": "{change}",
  "list.key.scopeToAll": "this repo \u2192 all repos",
  "list.key.scopeToRepo": "all repos \u2192 this repo",
  "list.key.delete": "delete",
  "list.key.rename": "rename",
  "list.key.renameShelf": "rename this shelf",
  "list.key.deleteShelf": "delete this shelf and its prompts",
  "list.key.deleteShelfShort": "delete shelf",
  "list.key.filter": "search this list",
  "list.key.esc": "close the list",
  "list.sortLabel_newest": "newest first",
  "list.sortLabel_mostUsed": "most used",
  "list.sortLabel_recent": "recently used",
  "list.sortNext_newest": "most used",
  "list.sortNext_mostUsed": "recent",
  "list.sortNext_recent": "newest",
  // Save picker
  "picker.newShelfHint": "enter create \xB7 esc cancel",
  "picker.pickShelfHint": "\u2190\u2192 choose \xB7 enter save \xB7 n new shelf \xB7 esc cancel",
  "picker.saveToShelf": "save to shelf:",
  // CLI commands
  "cli.prompt.noPromptError": "no prompt {ref} (have {count})",
  "cli.shelf.notFoundError": 'no shelf named "{name}" \u2014 stash shelves lists them',
  "cli.shelf.usageError": "usage: stash shelf {action} <name>{rename}",
  "cli.shelf.usageRenameError": "usage: stash shelf rename <old> <new>",
  "cli.shelf.readyMsg": "shelf {name} is ready",
  "cli.shelf.starredMsg": "starred {name}",
  "cli.shelf.unstarredMsg": "unstarred {name}",
  "cli.shelf.renamedMsg": "renamed {old} to {new}",
  "cli.shelf.deleteForce": "shelf {name} has {count}; add --force to delete them too",
  "cli.shelf.deletedMsg": "deleted shelf {name}{count}",
  "cli.shelf.deletedWithPrompts": " and its {count}",
  "cli.shelf.moreInOtherRepos": "{count} more in other repos \u2014 stash list --all",
  "cli.shelf.removed": "removed: [{location}] {text}",
  "cli.shelf.removedShelfFormat": "shelf {shelf}",
  "cli.shelf.removedAgentFormat": "{agent} \xB7 {path}",
  "cli.shelf.pluralPrompts_one": "1 prompt",
  "cli.shelf.pluralPrompts_other": "{count} prompts",
  // Setup commands
  "cli.setup.hotkeyMsg": "hotkey: {hotkey}",
  "cli.setup.listHotkeyMsg": "list hotkey: {hotkey}",
  "cli.setup.bothHotkeysMsg": "hotkey: {hotkey}\nlist hotkey: {listHotkey}",
  "cli.setup.hotkeyReservedError": "{label} is reserved by {owners}; pick another",
  "cli.setup.hotkeyConflictError": "{label} is already the {which} hotkey; pick another",
  "cli.setup.hotkeySetMsg": "{which} set to {label} \u2014 takes effect in new sessions",
  "cli.setup.hotkeySetStash": "hotkey",
  "cli.setup.hotkeySetList": "list hotkey",
  "cli.setup.doctorVersion": "prompt-shelf {version} \xB7 node {nodeVersion} \xB7 {platform}",
  "cli.setup.doctorData": "data: {dir}",
  "cli.setup.doctorDebugOff": "debug log: off (PROMPT_SHELF_DEBUG=1 turns it on)",
  "cli.setup.doctorDebugOn": "debug log: {file}",
  "cli.setup.doctorShimDir": "shim dir: {dir}",
  "cli.setup.doctorOnPath_yes": "on PATH: yes",
  "cli.setup.doctorOnPath_no": "on PATH: no",
  "cli.setup.doctorShimStatus": "{command}: shim {status}, real binary {binary}",
  "cli.setup.doctorShimInstalled": "installed",
  "cli.setup.doctorShimMissing": "missing",
  "cli.setup.doctorBinaryNotFound": "not found",
  "cli.setup.doctorPathFix": "fix: {hint}",
  // Error formatting
  "error.prefix": "error: {message}"
};

// src/i18n/index.ts
var LOCALES = { en };
function detectLocale(env = process.env, supported = Object.keys(LOCALES)) {
  for (const value of [env.PROMPT_SHELF_LANG, env.LC_ALL, env.LC_MESSAGES, env.LANG]) {
    if (!value || value === "C" || value === "POSIX") continue;
    const tag = value.split(".")[0].replace("_", "-").toLowerCase();
    for (const candidate of [tag, tag.split("-")[0]]) if (supported.includes(candidate)) return candidate;
  }
  return "en";
}
var locale = detectLocale();
var messages = LOCALES[locale];
var fill = (text, params) => text.replace(/\{(\w+)\}/g, (whole, name) => name in params ? String(params[name]) : whole);
function t(key, params = {}) {
  return fill(messages[key] ?? en[key], params);
}
function tn(key, count, params = {}) {
  const form = new Intl.PluralRules(locale).select(count);
  const all = messages;
  const text = all[`${key}_${form}`] ?? all[`${key}_other`] ?? en[`${key}_other`];
  return fill(text, { count, ...params });
}

// src/terminal/inject.ts
var yieldTick = () => new Promise((r) => setTimeout(r, 0));
async function injectPaste(target, text, chunkSize = 512) {
  const body = text.replace(/\r?\n/g, "\r");
  target.write(PASTE_START);
  for (let i = 0; i < body.length; i += chunkSize) {
    target.write(body.slice(i, i + chunkSize));
    await yieldTick();
  }
  target.write(PASTE_END);
}

// src/terminal/pastes.ts
var PasteRecorder = class {
  buffer = null;
  feed(text) {
    const done = [];
    let rest = text;
    while (rest) {
      if (this.buffer === null) {
        const start = rest.indexOf(PASTE_START);
        if (start < 0) break;
        this.buffer = "";
        rest = rest.slice(start + PASTE_START.length);
        continue;
      }
      const end = rest.indexOf(PASTE_END);
      if (end < 0) {
        this.buffer += rest;
        break;
      }
      done.push((this.buffer + rest.slice(0, end)).replace(/\r\n?/g, "\n"));
      this.buffer = null;
      rest = rest.slice(end + PASTE_END.length);
    }
    return done;
  }
};
var RECENT_PASTES = 50;
var charCount = (text) => [...text].length;
var lineBreaks = (text) => text.split("\n").length - 1;
var PasteLabels = class _PasteLabels {
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
  // Whether `text` can be the paste behind a placeholder that says it hides `extraLines` lines.
  static fits(text, extraLines) {
    return lineBreaks(text) === (extraLines === void 0 ? 0 : Number(extraLines));
  }
  /**
   * Maps placeholder numbers on screen to the pastes that produced them. A short paste gets no
   * placeholder, so k numbers above the highest seen belong to the last k pastes, in order. If
   * the agent starts numbering again (a new session, /clear), a number already mapped to a paste
   * that doesn't fit its placeholder goes to the newest paste that does. Returns whether it
   * mapped anything.
   */
  learn(screenText, pastes) {
    if (this.label.key !== "number" || !pastes.length) return false;
    const labels = /* @__PURE__ */ new Map();
    for (const m of screenText.matchAll(this.label.pattern)) labels.set(Number(m[1]), m[2]);
    const fresh = [...labels.keys()].filter((n) => n > this.highest).sort((a, b) => a - b);
    let mapped = false;
    if (fresh.length) {
      const owners = pastes.slice(-fresh.length);
      fresh.slice(-owners.length).forEach((n, i) => this.byNumber.set(n, owners[i]));
      this.highest = fresh[fresh.length - 1];
      mapped = true;
    }
    for (const [n, extra] of labels) {
      const known = this.byNumber.get(n);
      if (known !== void 0 && _PasteLabels.fits(known, extra)) continue;
      const owner = [...pastes].reverse().find((p) => _PasteLabels.fits(p, extra));
      if (owner === void 0) continue;
      this.byNumber.set(n, owner);
      mapped = true;
    }
    return mapped;
  }
  /**
   * The text with every placeholder replaced, or null when one of them can't be matched to a paste
   * that fits it; never a wrong paste's text.
   */
  expand(text) {
    const bySize = this.label.key === "chars" ? this.sizeQueues(text) : null;
    let unknown = false;
    const out = text.replace(this.label.pattern, (whole, n, extra) => {
      const pasted = bySize ? bySize.get(Number(n))?.shift() : this.byNumber.get(Number(n));
      if (pasted === void 0 || !bySize && !_PasteLabels.fits(pasted, extra)) unknown = true;
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
var PENDING_MS = 5e3;
var PasteTracker = class {
  constructor(labels, screenText, now = Date.now) {
    this.labels = labels;
    this.screenText = screenText;
    this.now = now;
  }
  labels;
  screenText;
  now;
  pending = [];
  get waiting() {
    return this.pending.length > 0;
  }
  pasted(text) {
    this.labels.remember(text);
    this.pending.push({ text, at: this.now() });
  }
  check() {
    this.match();
    const now = this.now();
    this.pending = this.pending.filter((p) => now - p.at < PENDING_MS);
  }
  expand(draft) {
    this.match();
    return this.labels.expand(draft);
  }
  match() {
    if (this.pending.length && this.labels.learn(this.screenText(), this.pending.map((p) => p.text))) this.pending = [];
  }
};

// src/terminal/stdin.ts
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

// src/ui/list-panel.ts
import { basename } from "path";

// src/domain/time.ts
function ago(iso, now = /* @__PURE__ */ new Date()) {
  if (!iso) return "";
  const then = new Date(iso);
  const seconds = Math.max(0, (now.getTime() - then.getTime()) / 1e3);
  if (Number.isNaN(seconds)) return "";
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 7 * 86400) return `${Math.floor(seconds / 86400)}d ago`;
  return then.toLocaleDateString(void 0, { day: "numeric", month: "short", ...then.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {} });
}
function localTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(void 0, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// src/ui/widgets.ts
var keyHints = (pairs) => " " + pairs.map(([k, what]) => `${ansi.bold}${theme.accent}${k}${ansi.reset} ${ansi.dim}${what}${ansi.reset}`).join("   ");
function choiceRow(labels, active, width, style = (l) => l) {
  const cells = labels.map((l) => visibleWidth(l) + 2);
  const widthFrom = (from2) => cells.slice(from2).reduce((n, w) => n + w + 1, 1);
  let from = 0;
  while (from < active && widthFrom(from) > width) from++;
  const parts = labels.slice(from).map((l, i) => from + i === active ? `${ansi.reverse}${ansi.bold} ${l} ${ansi.reset}` : ` ${style(l)} `);
  return truncateLine(`${from > 0 ? "\u2039" : " "}${parts.join(" ")}`, width);
}
var TextInput = class {
  constructor(value = "") {
    this.value = value;
  }
  value;
  /** Returns 'done' on Enter, 'cancel' on Esc / Ctrl+C, and 'editing' otherwise. */
  handle(key) {
    if (key === "\r") return "done";
    if (key === "\x1B" || key === "") return "cancel";
    if (key === "\x7F") this.value = [...this.value].slice(0, -1).join("");
    else if ([...key].length === 1 && key >= " ") this.value += key;
    return "editing";
  }
  render(label, hint) {
    return ` ${ansi.bold}${label} ${this.value}\u258F${ansi.reset}${ansi.dim}   ${hint}${ansi.reset}`;
  }
};
var statusLine = (status) => ` ${ansi.bold}${status.error ? theme.error : theme.success}${status.text}${ansi.reset}`;
var addNewHint = () => `  ${ansi.dim}+ new (${ansi.reset}${ansi.bold}${theme.accent}n${ansi.reset}${ansi.dim})${ansi.reset}`;
function panelFrame(lines, footer, cols, rows) {
  const body = lines.slice(0, Math.max(0, rows - 1));
  while (body.length < rows - 1) body.push("");
  if (rows > 0) body.push(footer);
  return body.map((l) => ansi.clearLine + truncateLine(l, cols)).join("\r\n");
}
var shelfLabel = (name, starred) => starred.includes(name) ? `\u2605 ${name}` : name;
var styleStar = (label) => label.replace(/^★/, `${theme.star}\u2605${ansi.reset}`);

// src/ui/list-panel.ts
var SORT_LABEL = (order) => {
  const labels = {
    newest: t("list.sortLabel_newest"),
    "most-used": t("list.sortLabel_mostUsed"),
    recent: t("list.sortLabel_recent")
  };
  return labels[order];
};
var sameTab = (a, b) => a.kind === b.kind && (a.kind !== "shelf" || b.kind === "shelf" && a.name === b.name);
var rowText = (row) => row.kind === "skill" ? `${row.skill.name} ${row.skill.description}` : row.prompt.text;
var usageTag = (p) => p.usedCount ? `used ${p.usedCount}\xD7 \xB7 ${ago(p.lastUsedAt)}` : `saved ${ago(p.createdAt)}`;
var KEY_COLUMN = 11;
var ListPanel = class {
  index = 0;
  mode = "list";
  filterText = "";
  tabIndex = 0;
  prompts;
  shelves;
  starredShelves;
  currentScope;
  sortOrder;
  // Saving a prompt to a shelf: which prompt, which shelf is picked, and a new shelf's name.
  saving;
  target = 0;
  nameInput = new TextInput();
  skills;
  agent;
  hotkeyLabel;
  cwd;
  constructor(prompts, options) {
    this.prompts = prompts;
    this.cwd = options.cwd;
    this.shelves = options.shelves ?? [];
    this.starredShelves = options.starredShelves ?? [];
    this.skills = options.skills ?? [];
    this.agent = options.agent ?? "the agent";
    this.hotkeyLabel = options.hotkeyLabel;
    this.currentScope = options.scope ?? "repo";
    this.sortOrder = options.sort ?? "newest";
    const start = options.tab ? this.tabs().findIndex((t2) => sameTab(t2, options.tab)) : 0;
    this.tabIndex = Math.max(0, start);
  }
  tabs() {
    return [{ kind: "stash" }, { kind: "skills" }, ...this.shelves.map((name) => ({ kind: "shelf", name }))];
  }
  get tab() {
    return this.tabs()[this.tabIndex] ?? { kind: "stash" };
  }
  get scope() {
    return this.currentScope;
  }
  get sort() {
    return this.sortOrder;
  }
  /** New data after a change; the same tab stays open, or the stash if that shelf is gone. */
  update(prompts, shelves = this.shelves, starredShelves = this.starredShelves) {
    const tab = this.tab;
    this.prompts = prompts;
    this.shelves = shelves;
    this.starredShelves = starredShelves;
    this.tabIndex = Math.max(0, this.tabs().findIndex((t2) => sameTab(t2, tab)));
    this.clampIndex();
  }
  /** Opens a shelf's tab, e.g. right after creating it. */
  showShelf(name) {
    const i = this.tabs().findIndex((t2) => t2.kind === "shelf" && t2.name === name);
    if (i >= 0) this.goToTab(i);
  }
  drafts() {
    return this.prompts.filter(isStashDraft);
  }
  tabRows(tab) {
    if (tab.kind === "skills") return this.skills.map((skill) => ({ kind: "skill", skill }));
    const prompts = tab.kind === "shelf" ? sortSaved(this.prompts.filter(onShelf(tab.name)), this.sortOrder) : scoped(this.drafts(), this.currentScope, this.cwd);
    return prompts.map((prompt) => ({ kind: "prompt", prompt }));
  }
  /** The rows shown on the current tab, after the search; for skills, name matches come first. */
  visible() {
    const rows = this.tabRows(this.tab);
    const q = this.filterText.toLowerCase();
    if (!q) return rows;
    const matches = rows.filter((r) => rowText(r).toLowerCase().includes(q));
    const inName = (r) => r.kind === "skill" && r.skill.name.toLowerCase().includes(q);
    return [...matches.filter(inName), ...matches.filter((r) => !inName(r))];
  }
  /** Handles a chunk of input; fast typing or a burst of arrows can arrive as one chunk. */
  handleKey(chunk) {
    for (const key of splitKeys(chunk)) {
      const action = this.handleOne(key);
      if (action.type !== "none") return action;
    }
    return { type: "none" };
  }
  handleOne(key) {
    if (this.mode === "filter") return this.handleFilterKey(key);
    if (this.mode === "pick-shelf") return this.handlePickKey(key);
    if (this.mode === "new-shelf") return this.handleNameKey(key);
    if (this.mode === "rename-shelf") return this.handleRenameKey(key);
    if (this.mode === "help") {
      this.mode = "list";
      return { type: "none" };
    }
    const row = this.visible()[this.index];
    const prompt = row?.kind === "prompt" ? row.prompt : void 0;
    if (this.mode === "confirm-delete") {
      this.mode = "list";
      return key === "y" && prompt ? { type: "delete", prompt } : { type: "none" };
    }
    const tab = this.tab;
    if (this.mode === "confirm-delete-shelf") {
      this.mode = "list";
      return key === "y" && tab.kind === "shelf" ? { type: "delete-shelf", shelf: tab.name } : { type: "none" };
    }
    switch (key) {
      case "\x1B[A":
      case "k":
        this.index = Math.max(0, this.index - 1);
        return { type: "none" };
      case "\x1B[B":
      case "j":
        this.index = Math.min(Math.max(0, this.visible().length - 1), this.index + 1);
        return { type: "none" };
      case "\x1B[C":
        this.goToTab((this.tabIndex + 1) % this.tabs().length);
        return { type: "none" };
      case "\x1B[D":
        this.goToTab((this.tabIndex - 1 + this.tabs().length) % this.tabs().length);
        return { type: "none" };
      case "\r":
        if (row?.kind === "skill") return { type: "use-skill", name: row.skill.name };
        if (!prompt) return { type: "none" };
        return isStashDraft(prompt) ? { type: "pop", prompt } : { type: "use", prompt };
      case "a":
        return prompt ? { type: "use", prompt } : { type: "none" };
      case "s":
        if (prompt) this.startSaving(prompt);
        return { type: "none" };
      case "d":
        if (prompt) this.mode = "confirm-delete";
        return { type: "none" };
      case "D":
        if (tab.kind === "shelf") this.mode = "confirm-delete-shelf";
        return { type: "none" };
      case "r":
        if (tab.kind === "shelf") {
          this.nameInput = new TextInput(tab.name);
          this.mode = "rename-shelf";
        }
        return { type: "none" };
      case "n":
        this.saving = void 0;
        this.nameInput = new TextInput();
        this.mode = "new-shelf";
        return { type: "none" };
      case "*":
        return tab.kind === "shelf" ? { type: "star-shelf", shelf: tab.name } : { type: "none" };
      case "<":
      case ">":
        return tab.kind === "shelf" ? { type: "move-shelf", shelf: tab.name, step: key === "<" ? -1 : 1 } : { type: "none" };
      case "o":
        if (tab.kind === "shelf") {
          this.sortOrder = nextSort(this.sortOrder);
          this.index = 0;
        }
        return { type: "none" };
      case "	":
        if (tab.kind === "stash") {
          this.currentScope = this.currentScope === "repo" ? "all" : "repo";
          this.clampIndex();
        }
        return { type: "none" };
      case "/":
        this.mode = "filter";
        return { type: "none" };
      case "?":
        this.mode = "help";
        return { type: "none" };
      case "\x1B":
      case "":
      case "q":
        return { type: "close" };
      default:
        return { type: "none" };
    }
  }
  /** Exactly `rows` lines of at most `cols` cells; the key hints (or `status`) always get the last line. */
  render(cols, rows, status) {
    const list = this.visible();
    const body = [];
    const bodyRows = Math.max(0, rows - 3);
    const empty = this.emptyMessage();
    if (this.mode === "help") body.push(...this.helpLines());
    else if (empty) body.push(`  ${ansi.dim}${empty}${ansi.reset}`);
    else if (list.length === 0) body.push(`  ${ansi.dim}no matches for /${this.filterText}${ansi.reset}`);
    else {
      const top = Math.max(0, Math.min(this.index - Math.floor(bodyRows / 2), list.length - bodyRows));
      list.slice(top, top + bodyRows).forEach((row, i) => body.push(this.rowLine(row, top + i === this.index, cols)));
    }
    const footer = status ? statusLine(status) : this.footer(cols);
    return panelFrame([this.tabBar(cols), this.infoLine(cols, list.length), ...body.slice(0, bodyRows)], footer, cols, rows);
  }
  rowLine(row, selected, cols) {
    const marker = selected ? `${theme.accent}\u25B8${ansi.reset}` : " ";
    const box = (text2) => selected ? `${ansi.reverse}${ansi.bold} ${text2} ${ansi.reset}` : ` ${text2} `;
    if (row.kind === "skill") {
      const nameWidth = Math.min(28, Math.max(12, Math.floor(cols / 4)));
      const about = clip(flatten(`${row.skill.description} \xB7 ${row.skill.source}`), Math.max(0, cols - nameWidth - 5));
      return `${marker}${box(padCells(clip(row.skill.name, nameWidth), nameWidth))} ${ansi.dim}${about}${ansi.reset}`;
    }
    const p = row.prompt;
    const tag = clip(p.shelf === void 0 ? `${p.agent} \xB7 ${basename(p.cwd)} \xB7 ${ago(p.createdAt)}` : usageTag(p), Math.floor(cols / 3));
    const text = clip(flatten(p.text), Math.max(0, cols - 5 - visibleWidth(tag)));
    return `${marker}${box(text)}${tag ? ` ${ansi.dim}${tag}${ansi.reset}` : ""}`;
  }
  footer(cols) {
    switch (this.mode) {
      case "confirm-delete":
        return ` ${ansi.bold}${theme.error}${t("list.deletePrompt")}${ansi.reset}  ${keyHints([["y", t("list.deleteYes")], ["n", t("list.deleteNo")]])}`;
      case "confirm-delete-shelf": {
        const name = this.tab.kind === "shelf" ? this.tab.name : "";
        const count = this.prompts.filter(onShelf(name)).length;
        const msg = count ? t("list.deleteShelfWithPrompts", { name, count: tn("cli.shelf.pluralPrompts", count, { count }) }) : t("list.deleteShelf", { name });
        return ` ${ansi.bold}${theme.error}${msg}${ansi.reset}  ${keyHints([["y", t("list.deleteYes")], ["n", t("list.deleteNo")]])}`;
      }
      case "help":
        return keyHints([["any key", "back"]]);
      case "filter":
        return ` ${ansi.bold}/ ${this.filterText}\u258F${ansi.reset}${ansi.dim}   ${t("list.filterDone")}${ansi.reset}`;
      case "new-shelf":
        return this.nameInput.render("new shelf name:", t("list.newShelfHint"));
      case "rename-shelf":
        return this.nameInput.render(t("list.renameShelfLabel"), t("list.renameShelfHint"));
      case "pick-shelf": {
        const hint = `   ${t("list.pickShelfHint")}`;
        const label = ` ${t("list.saveToShelf")}`;
        const row = choiceRow(this.saveTargets(), this.target, Math.max(10, cols - label.length - hint.length));
        return `${ansi.bold}${label}${ansi.reset}${row}${ansi.dim}${hint}${ansi.reset}`;
      }
    }
    if (this.tab.kind === "skills") return keyHints([["enter", t("list.key.useSkill", { agent: this.agent })], ["/", t("list.key.search")], ["?", t("list.key.moreKeys")], ["esc", t("list.key.closeList")]]);
    const shelfKeys = this.tab.kind === "shelf" ? [["r", t("list.key.rename")], ["D", t("list.key.deleteShelfShort")]] : [];
    const save = this.tab.kind === "shelf" ? ["s", t("list.key.movePrompt")] : ["s", t("list.key.saveDraft")];
    return keyHints([["enter", t("list.key.usePrompt")], save, ...shelfKeys, ["/", t("list.key.filter")], ["?", t("list.key.moreKeys")], ["esc", t("list.key.esc")]]);
  }
  helpLines() {
    const tab = this.tab;
    const shelf = tab.kind === "shelf";
    const both = [
      [t("list.key.switchTab"), t("list.key.switchList")],
      [t("list.key.navUp"), t("list.key.moveUp")]
    ];
    let rows;
    if (tab.kind === "skills") {
      rows = [...both, ["enter", t("list.key.useSkill", { agent: this.agent })], ["/", t("list.key.search")], ["esc", t("list.key.closeList")]];
    } else {
      const starAction = shelf && this.starredShelves.includes(tab.name) ? "unstar" : "star";
      const star = t("list.key.starShelf", { action: starAction });
      const scopeChange = this.currentScope === "repo" ? t("list.key.scopeToAll") : t("list.key.scopeToRepo");
      rows = [
        ...both,
        ["enter", shelf ? t("list.key.usePromptKeep") : t("list.key.putDraft")],
        ...shelf ? [] : [["a", t("list.key.keepDraft")]],
        ["s", shelf ? t("list.key.movePrompt") : t("list.key.saveDraft")],
        ["n", t("list.key.newShelf")],
        ...shelf ? [
          ["o", t("list.key.sortNext", { next: SORT_LABEL(nextSort(this.sortOrder)) })],
          ["*", star],
          ["<  >", t("list.key.moveShelfLR")],
          ["r", t("list.key.renameShelf")],
          ["D", t("list.key.deleteShelf")]
        ] : [["tab", t("list.key.scopeToggle", { change: scopeChange })]],
        ["d", t("list.key.delete")],
        ["/", t("list.key.filter")],
        ["esc", t("list.key.esc")]
      ];
    }
    const half = Math.ceil(rows.length / 2);
    const cell = ([k, what]) => `${ansi.bold}${theme.accent}${padCells(k, KEY_COLUMN)}${ansi.reset}${what}`;
    const leftWidth = Math.max(...rows.slice(0, half).map(([, what]) => KEY_COLUMN + visibleWidth(what))) + 4;
    return rows.slice(0, half).map((left, i) => {
      const right = rows[half + i];
      return `   ${cell(left)}${right ? " ".repeat(leftWidth - KEY_COLUMN - visibleWidth(left[1])) + cell(right) : ""}`;
    });
  }
  emptyMessage() {
    const tab = this.tab;
    if (this.tabRows(tab).length) return null;
    if (tab.kind === "skills") return t("list.noSkillsFor", { agent: this.agent });
    if (tab.kind === "shelf") return t("list.emptyShelf", { name: tab.name });
    const drafts = this.drafts().length;
    return drafts ? t("list.emptyStashTab", { count: drafts }) : t("list.emptyStash", { hotkey: this.hotkeyLabel });
  }
  tabName(tab) {
    if (tab.kind === "stash") return "Stash";
    if (tab.kind === "skills") return "Skills";
    return shelfLabel(tab.name, this.starredShelves);
  }
  // The lists as tabs, then "+ new (n)", with "←→ switch list" on the right when there's room.
  tabBar(cols) {
    const addNew = addNewHint();
    const hint = t("list.switchLists");
    const labels = this.tabs().map((t2) => `${this.tabName(t2)} ${this.tabRows(t2).length}`);
    const style = (l) => styleStar(l).replace(/ (\d+)$/, ` ${ansi.dim}$1${ansi.reset}`);
    const row = choiceRow(labels, this.tabIndex, cols - visibleWidth(addNew) - hint.length - 2, style) + addNew;
    const gap = cols - visibleWidth(row) - hint.length - 1;
    return gap > 0 ? `${row}${" ".repeat(gap)}${ansi.dim}${hint}${ansi.reset}` : row;
  }
  // What the current list is and how using a prompt from it behaves, plus the position.
  infoLine(cols, shown) {
    const tab = this.tab;
    let about;
    if (tab.kind === "skills") about = t("list.skillsTip", { agent: this.agent });
    else if (tab.kind === "shelf") about = t("list.savedPromptsTip", { sort: SORT_LABEL(this.sortOrder) });
    else {
      const drafts = this.drafts().length;
      const where = this.currentScope === "all" ? t("list.draftsCross", { count: drafts }) : t("list.draftsThisRepo", { shown: this.tabRows(tab).length, total: drafts });
      about = t("list.draftsTip", { where });
    }
    if (this.filterText) about += ` \xB7 ${t("list.filterIndicator", { query: this.filterText })}`;
    const title = tab.kind === "shelf" ? tab.name : this.tabName(tab);
    const position = shown && this.mode !== "help" ? `${this.index + 1}/${shown}` : "";
    const gap = Math.max(1, cols - 4 - visibleWidth(title) - visibleWidth(about) - position.length);
    return ` ${ansi.bold}${title}${ansi.reset} ${ansi.dim}\u2014 ${about}${" ".repeat(gap)}${position}${ansi.reset}`;
  }
  // Shelves a prompt can be saved to: all of them except the one it is already on.
  saveTargets() {
    return this.shelves.filter((n) => n !== this.saving?.shelf);
  }
  startSaving(prompt) {
    this.saving = prompt;
    this.target = 0;
    this.nameInput = new TextInput();
    this.mode = this.saveTargets().length ? "pick-shelf" : "new-shelf";
  }
  handlePickKey(key) {
    const targets = this.saveTargets();
    if (key === "\x1B[C" || key === "\x1B[D") {
      this.target = (this.target + (key === "\x1B[C" ? 1 : -1) + targets.length) % targets.length;
      return { type: "none" };
    }
    if (key === "n") {
      this.mode = "new-shelf";
      return { type: "none" };
    }
    const prompt = this.saving;
    this.mode = "list";
    this.saving = void 0;
    const shelf = targets[this.target];
    return key === "\r" && prompt && shelf ? { type: "save-to-shelf", prompt, shelf } : { type: "none" };
  }
  handleNameKey(key) {
    const state = this.nameInput.handle(key);
    if (state === "editing") return { type: "none" };
    const prompt = this.saving;
    this.mode = "list";
    this.saving = void 0;
    const name = this.nameInput.value.trim();
    if (state === "cancel" || !name) return { type: "none" };
    return { type: "create-shelf", name, ...prompt ? { prompt } : {} };
  }
  handleRenameKey(key) {
    const state = this.nameInput.handle(key);
    if (state === "editing") return { type: "none" };
    this.mode = "list";
    const tab = this.tab;
    const name = this.nameInput.value.trim();
    if (state === "cancel" || !name || tab.kind !== "shelf" || name === tab.name) return { type: "none" };
    return { type: "rename-shelf", shelf: tab.name, newName: name };
  }
  handleFilterKey(key) {
    if (key === "\r") this.mode = "list";
    else if (key === "\x1B") {
      this.mode = "list";
      this.filterText = "";
    } else if (key === "\x7F") this.filterText = [...this.filterText].slice(0, -1).join("");
    else if ([...key].length === 1 && key >= " ") this.filterText += key;
    this.index = 0;
    return { type: "none" };
  }
  goToTab(i) {
    this.tabIndex = i;
    this.index = 0;
    this.filterText = "";
  }
  clampIndex() {
    this.index = Math.max(0, Math.min(this.index, this.visible().length - 1));
  }
};

// src/ui/save-picker.ts
var SavePicker = class {
  constructor(draft, shelves, starred = []) {
    this.draft = draft;
    this.shelves = shelves;
    this.starred = starred;
  }
  draft;
  shelves;
  starred;
  index = 0;
  naming = null;
  handleKey(chunk) {
    for (const key of splitKeys(chunk)) {
      const action = this.handleOne(key);
      if (action.type !== "none") return action;
    }
    return { type: "none" };
  }
  /** The hotkey pressed again saves to whatever is picked (not while a name is being typed). */
  confirm() {
    return this.naming ? { type: "none" } : this.pick();
  }
  pick() {
    const shelf = this.shelves[this.index - 1];
    return shelf === void 0 ? { type: "save" } : { type: "save", shelf };
  }
  handleOne(key) {
    if (this.naming) {
      const state = this.naming.handle(key);
      const name = this.naming.value.trim();
      if (state === "editing") return { type: "none" };
      this.naming = null;
      return state === "done" && name ? { type: "create-shelf", name } : { type: "none" };
    }
    const count = this.shelves.length + 1;
    switch (key) {
      case "\x1B[C":
      case "	":
        this.index = (this.index + 1) % count;
        return { type: "none" };
      case "\x1B[D":
        this.index = (this.index - 1 + count) % count;
        return { type: "none" };
      case "\r":
        return this.pick();
      case "n":
        this.naming = new TextInput();
        return { type: "none" };
      case "\x1B":
      case "":
        return { type: "cancel" };
      default:
        return { type: "none" };
    }
  }
  render(cols, rows, status) {
    const label = " Save to:";
    const addNew = addNewHint();
    const names = ["Stash", ...this.shelves.map((s) => shelfLabel(s, this.starred))];
    const places = choiceRow(names, this.index, cols - label.length - visibleWidth(addNew) - 1, styleStar);
    let footer;
    if (status) footer = statusLine(status);
    else if (this.naming) footer = this.naming.render("new shelf name:", "enter create \xB7 esc back");
    else footer = keyHints([["\u2190\u2192", "choose"], ["enter", "save"], ["n", "new shelf"], ["esc", "cancel"]]);
    return panelFrame([`${ansi.bold}${label}${ansi.reset}${places}${addNew}`, ` ${ansi.dim}${flatten(this.draft)}${ansi.reset}`], footer, cols, rows);
  }
};

// src/storage/shelf-ops.ts
var plural = (n) => tn("cli.shelf.pluralPrompts", n, { count: n });
async function requireShelf(shelves, store, name) {
  const saved = await shelves.find(name);
  if (saved) return { name: saved, saved: true };
  const orphan = findShelf(withOrphans([], await store.list()), name);
  if (orphan) return { name: orphan, saved: false };
  throw new UserError(t("cli.shelf.notFoundError", { name }));
}
async function renameShelf(shelves, store, name, to) {
  const current = await requireShelf(shelves, store, name);
  const renamed = current.saved ? await shelves.rename(current.name, to) : await shelves.create(to);
  await store.reshelve(current.name, renamed);
  return { from: current.name, to: renamed };
}
async function deleteShelf(shelves, store, name, force) {
  const current = await requireShelf(shelves, store, name);
  const count = (await store.list()).filter(onShelf(current.name)).length;
  if (count && !force) throw new UserError(t("cli.shelf.deleteForce", { name: current.name, count: plural(count) }));
  await store.reshelve(current.name, null);
  if (current.saved) await shelves.remove(current.name);
  return { name: current.name, count };
}
var deletedMessage = ({ name, count }) => t("cli.shelf.deletedMsg", { name, count: count ? t("cli.shelf.deletedWithPrompts", { count: plural(count) }) : "" });

// src/session/actions.ts
async function panelData(ctx) {
  const prompts = await ctx.store.list();
  return { prompts, shelves: withOrphans(await ctx.shelves.list(), prompts), starred: await ctx.shelves.starred() };
}
var gone = { refresh: true, status: { text: t("actions.changedOtherSession"), error: true } };
var draftsLeft = async (ctx) => (await ctx.store.list()).filter(isStashDraft).length;
async function listEffect(ctx, action, hasDraft) {
  switch (action.type) {
    case "close":
      return { close: true };
    case "pop": {
      if (!await ctx.store.remove(action.prompt.id)) return gone;
      const left = await draftsLeft(ctx);
      const key = hasDraft ? "actions.appendedLeft" : "actions.poppedLeft";
      return { close: true, insert: action.prompt.text, status: { text: t(key, { left }) } };
    }
    case "use": {
      if (!await ctx.store.markUsed(action.prompt.id)) return gone;
      const key = action.prompt.shelf ? hasDraft ? "actions.appendedShelf" : "actions.keptShelf" : hasDraft ? "actions.appendedKeptStash" : "actions.keptStash";
      return { close: true, insert: action.prompt.text, status: { text: t(key, { shelf: action.prompt.shelf ?? "" }) } };
    }
    case "use-skill":
      return { close: true, insert: ctx.skillPrompt(action.name, hasDraft), status: { text: t("actions.skillInserted", { name: action.name }) } };
    case "delete":
      return await ctx.store.remove(action.prompt.id) ? { refresh: true, status: { text: t("actions.deleted") } } : gone;
    case "save-to-shelf": {
      const shelf = await ctx.shelves.create(action.shelf);
      if (!await ctx.store.setShelf(action.prompt.id, shelf)) return gone;
      return { refresh: true, status: { text: t("save.savedTo", { shelf }) } };
    }
    case "create-shelf": {
      const shelf = await ctx.shelves.create(action.name);
      if (!action.prompt) return { refresh: true, showShelf: shelf, status: { text: t("actions.shelfReady", { name: shelf }) } };
      if (!await ctx.store.setShelf(action.prompt.id, shelf)) return gone;
      return { refresh: true, status: { text: t("save.savedTo", { shelf }) } };
    }
    case "star-shelf": {
      const shelf = await ctx.shelves.create(action.shelf);
      const starred = await ctx.shelves.toggleStar(shelf);
      const key = starred ? "actions.starredShelf" : "actions.unstarredShelf";
      return { refresh: true, status: { text: t(key, { shelf }) } };
    }
    case "move-shelf": {
      const moved = await ctx.shelves.move(await ctx.shelves.create(action.shelf), action.step);
      return moved ? { refresh: true } : { status: { text: t(action.step < 0 ? "actions.alreadyFirst" : "actions.alreadyLast") } };
    }
    case "delete-shelf":
      return { refresh: true, status: { text: deletedMessage(await deleteShelf(ctx.shelves, ctx.store, action.shelf, true)) } };
    case "rename-shelf": {
      const { from, to } = await renameShelf(ctx.shelves, ctx.store, action.shelf, action.newName);
      return { refresh: true, showShelf: to, status: { text: t("cli.shelf.renamedMsg", { old: from, new: to }) } };
    }
    case "none":
      return {};
  }
}
async function pickerEffect(ctx, action, text) {
  if (action.type === "none") return {};
  if (action.type === "cancel") return { close: true };
  const shelf = action.type === "create-shelf" ? await ctx.shelves.create(action.name) : action.shelf && await ctx.shelves.create(action.shelf);
  await ctx.store.add({ text, agent: ctx.agent, cwd: ctx.cwd, ...shelf ? { shelf } : {} });
  const count = await draftsLeft(ctx);
  const statusText2 = shelf ? t("save.savedTo", { shelf }) : t("save.stashed", { count });
  return { close: true, clearDraft: true, status: { text: statusText2 } };
}

// src/session/session.ts
var ESC_FLUSH_MS = 25;
var PASTE_CHECK_MS = 100;
var PICKER_ROWS = 3;
var WELCOME_DELAY_MS = 600;
var WELCOME_MS = 6e3;
var isKey = (chunk, key) => key.sequences.some((seq) => chunk.equals(seq));
var Session = class {
  constructor(deps) {
    this.deps = deps;
    this.input = new StdinPipeline(new KeyInterceptor([deps.keys.save, deps.keys.list]));
    const label = deps.adapter.pasteLabel;
    this.tracker = label ? new PasteTracker(new PasteLabels(label), () => deps.screen.lines().join("\n")) : null;
  }
  deps;
  list = null;
  // The save picker, with the draft it is saving and that draft's full text (pastes expanded).
  picker = null;
  // Set while a panel is being opened, so a fast double press doesn't open two.
  opening = false;
  // What the list remembers between openings in this session.
  last = { scope: "repo", tab: { kind: "stash" }, sort: "newest" };
  skills = null;
  input;
  pastes = new PasteRecorder();
  tracker;
  pasteTimer = null;
  escTimer = null;
  welcomed = false;
  welcomeTimer = null;
  // Actions run one at a time, in order, so fast key presses never interleave their changes.
  queue = Promise.resolve();
  get panelOpen() {
    return this.list !== null || this.picker !== null || this.opening;
  }
  /** Waits for every queued action to finish. */
  idle() {
    return this.queue;
  }
  /** Output from the agent. */
  agentOutput(data) {
    void this.deps.screen.write(data).then(() => this.welcomeOnce());
    this.deps.display.agentOutput(data);
    this.checkPastesSoon();
  }
  // Once per run, when the agent's input box first shows: say prompt-shelf is on, its keys, and
  // how many drafts are waiting in this repo. Nothing is shown if a panel opened first.
  welcomeOnce() {
    if (this.welcomed || this.deps.adapter.inputTop(this.deps.screen.lines()) === null) return;
    this.welcomed = true;
    this.welcomeTimer = setTimeout(() => {
      this.serial(async () => {
        if (this.panelOpen) return;
        const { keys, ctx, display } = this.deps;
        const parked = scoped((await ctx.store.list()).filter(isStashDraft), "repo", ctx.cwd).length;
        const keysText = t("welcome.keys", { save: keys.save.label, list: keys.list.label });
        const text = parked ? `${keysText} \xB7 ${tn("welcome.parked", parked, { count: parked })}` : keysText;
        display.toast({ text, hint: true }, WELCOME_MS);
      });
    }, WELCOME_DELAY_MS);
  }
  /** Input from the user's terminal. */
  userInput(chunk) {
    const { keys, pty } = this.deps;
    if (this.picker) {
      const { ui, text: text2 } = this.picker;
      if (isKey(chunk, keys.save)) this.serial(async () => this.apply(await pickerEffect(this.deps.ctx, ui.confirm(), text2)));
      else if (isKey(chunk, keys.list)) this.closePanel();
      else this.forPanel(chunk, (k) => pickerEffect(this.deps.ctx, ui.handleKey(k), text2));
      return;
    }
    if (this.list) {
      const { ui, hadDraft } = this.list;
      if (isKey(chunk, keys.save) || isKey(chunk, keys.list)) this.closePanel();
      else this.forPanel(chunk, (k) => listEffect(this.deps.ctx, ui.handleKey(k), hadDraft));
      return;
    }
    if (this.opening) return;
    const { text, presses } = this.input.feed(chunk);
    if (text) pty.write(text);
    for (const pasted of this.pastes.feed(text)) this.tracker?.pasted(pasted);
    this.checkPastesSoon();
    for (const index of presses) this.serial(() => this.onHotkey(index === 1 ? "list" : "save"));
    if (this.escTimer) clearTimeout(this.escTimer);
    if (this.input.hasPending) this.escTimer = setTimeout(() => !this.panelOpen && this.flushInput(), ESC_FLUSH_MS);
  }
  dispose() {
    for (const timer of [this.escTimer, this.pasteTimer, this.welcomeTimer]) if (timer) clearTimeout(timer);
    this.deps.display.dispose();
  }
  forPanel(chunk, effectOf) {
    const keys = this.input.decodeOnly(chunk);
    if (keys) this.serial(async () => this.apply(await effectOf(keys)));
  }
  serial(fn) {
    this.queue = this.queue.then(fn).catch((err) => {
      debug("error", describeError(err), { stack: err instanceof Error ? err.stack : void 0 });
      this.deps.display.toast({ text: `error: ${describeError(err)}`, error: true });
    });
  }
  async onHotkey(which) {
    debug("keys", `${which} hotkey`, { panelOpen: this.panelOpen, record: Boolean(this.deps.record) });
    if (this.deps.record) return this.deps.display.toast({ text: `recorded ${await this.deps.record()}` });
    if (this.panelOpen) return;
    this.opening = true;
    if (this.escTimer) clearTimeout(this.escTimer);
    this.flushInput();
    try {
      await (which === "list" ? this.openList() : this.openPicker());
    } finally {
      this.opening = false;
    }
  }
  async openList() {
    const { adapter, ctx, keys, display } = this.deps;
    const draft = await this.readDraft();
    const data = await panelData(ctx);
    this.skills ??= adapter.skills(ctx.cwd);
    const ui = new ListPanel(data.prompts, {
      cwd: ctx.cwd,
      hotkeyLabel: keys.save.label,
      scope: this.last.scope,
      shelves: data.shelves,
      starredShelves: data.starred,
      skills: this.skills,
      agent: adapter.displayName,
      tab: this.last.tab,
      sort: this.last.sort
    });
    this.list = { ui, hadDraft: draft !== null };
    display.show(ui);
  }
  async openPicker() {
    const { adapter, ctx, display } = this.deps;
    const draft = await this.readDraft();
    if (!draft) return display.toast({ text: t("save.nothing") });
    const text = this.tracker ? this.tracker.expand(draft.text) : draft.text;
    if (text === null) debug("paste", "a collapsed paste could not be matched", { waiting: this.tracker?.waiting });
    if (text === null || adapter.unsafeDraft.test(text)) return display.toast({ text: t("save.collapsedPaste"), error: true });
    const data = await panelData(ctx);
    this.picker = { ui: new SavePicker(text, data.shelves, data.starred), draft, text };
    display.show(this.picker.ui, PICKER_ROWS);
  }
  closePanel() {
    if (this.list) this.last = { scope: this.list.ui.scope, tab: this.list.ui.tab, sort: this.list.ui.sort };
    this.list = null;
    this.picker = null;
    this.deps.display.hide();
  }
  /** Carries out an effect, in the order `Effect` documents. */
  async apply(effect) {
    debug("effect", Object.keys(effect).join(",") || "none", effect.status ? { status: effect.status.text } : void 0);
    const { adapter, ctx, pty, display } = this.deps;
    const hadDraft = this.list?.hadDraft ?? false;
    if (effect.clearDraft && this.picker) pty.write(adapter.clearDraft(this.picker.draft));
    if (effect.close) this.closePanel();
    if (effect.insert !== void 0) await injectPaste(pty, hadDraft ? "\n" + effect.insert : effect.insert);
    if (effect.refresh && this.list) {
      const data = await panelData(ctx);
      this.list.ui.update(data.prompts, data.shelves, data.starred);
    }
    if (effect.showShelf && this.list) this.list.ui.showShelf(effect.showShelf);
    if (effect.status) display.toast(effect.status);
    else display.redraw();
  }
  async readDraft() {
    const { adapter, screen } = this.deps;
    await screen.write("");
    const lines = screen.lines({ dropDim: adapter.dimPlaceholder });
    const draft = adapter.readDraft(lines, screen.cursor(), screen.cols);
    debug("draft", draft ? "read" : "none", { inputTop: adapter.inputTop(lines), cursor: screen.cursor(), chars: draft?.text.length, lines: draft?.text.split("\n").length });
    return draft;
  }
  flushInput() {
    const rest = this.input.flush();
    if (rest) this.deps.pty.write(rest);
  }
  checkPastesSoon() {
    const tracker = this.tracker;
    if (!tracker?.waiting || this.pasteTimer) return;
    this.pasteTimer = setTimeout(() => {
      this.pasteTimer = null;
      tracker.check();
      this.checkPastesSoon();
    }, PASTE_CHECK_MS);
  }
};

// src/session/run.ts
var SESSION_ENV = "PROMPT_SHELF_SESSION";
async function runApp(opts) {
  const { adapter } = opts;
  const env = { ...process.env, PATH: stripShimDir(process.env.PATH) };
  const real = findRealBinary(adapter.command, env);
  if (!real) throw new UserError(`${adapter.command} not found on PATH (install ${adapter.displayName} first)`);
  if (process.env.STASH_OFF) return passthrough(real, opts.args, env);
  const keys = sessionKeys(await loadConfig(), adapter);
  const command = isCmdScript(real) ? process.env.comspec ?? "cmd.exe" : real;
  const args = isCmdScript(real) ? ["/c", real, ...opts.args] : opts.args;
  const record = opts.record || Boolean(process.env.STASH_RECORD);
  const { stdin, stdout } = process;
  const cwd = process.cwd();
  const screen = new Screen(stdout.columns || 80, stdout.rows || 24);
  const display = new Display(stdout, screen, adapter);
  debug("session", "start", { agent: adapter.name, cols: display.cols, rows: display.rows, record });
  const pty = spawnAgent({ command, args, cols: display.cols, rows: display.rows, cwd, env: { ...env, [SESSION_ENV]: "1" } });
  const session = new Session({
    adapter,
    ctx: { store: new Store(promptsFile), shelves: new Shelves(shelvesFile), agent: adapter.name, cwd, skillPrompt: adapter.skillPrompt },
    pty,
    screen,
    display,
    keys,
    ...record ? { record: () => recordScreen(screen, stashDir, adapter.name) } : {}
  });
  const onError = (err) => {
    debug("error", describeError(err), { stack: err instanceof Error ? err.stack : void 0 });
    display.toast({ text: `error: ${describeError(err)}`, error: true });
  };
  const guarded = (fn) => (arg) => {
    try {
      fn(arg);
    } catch (err) {
      onError(err);
    }
  };
  pty.onData(guarded((data) => session.agentOutput(data)));
  stdin.setRawMode?.(true);
  stdin.resume();
  stdin.on("data", guarded((chunk) => session.userInput(chunk)));
  const onResize = guarded(() => {
    screen.resize(display.cols, display.rows);
    pty.resize(display.cols, display.rows);
    display.redraw();
  });
  stdout.on("resize", onResize);
  process.on("uncaughtException", onError);
  process.on("unhandledRejection", onError);
  return new Promise((resolve) => {
    pty.onExit((code) => {
      session.dispose();
      process.off("uncaughtException", onError);
      process.off("unhandledRejection", onError);
      stdout.off("resize", onResize);
      stdout.write(ansi.saneEpilogue);
      stdin.setRawMode?.(false);
      stdin.pause();
      resolve(code);
    });
  });
}

// src/cli/args.ts
var SHELF_ACTIONS = ["new", "rename", "rm", "star"];
var SHELF_USAGE = "usage: stash shelf new <name> | rename <old> <new> | star <name> | rm <name> [--force]";
function parseFlags(command, args, allowed) {
  const flags = { all: false, force: false, shelf: void 0 };
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith("--")) {
      positional.push(a);
      continue;
    }
    if (!allowed.includes(a)) throw new UserError(`stash ${command} doesn't take ${a}`, 2);
    if (a === "--all") flags.all = true;
    else if (a === "--force") flags.force = true;
    else {
      const name = args[++i];
      if (!name) throw new UserError("--shelf needs a shelf name", 2);
      flags.shelf = name;
    }
  }
  return { ...flags, positional };
}
var view = ({ all, shelf }) => ({ all, ...shelf ? { shelf } : {} });
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
  switch (first) {
    case "list":
      return { kind: "list", ...view(parseFlags(first, args, ["--all", "--shelf"])) };
    case "add": {
      const { positional, shelf } = parseFlags(first, args, ["--shelf"]);
      return { kind: "add", text: positional.join(" "), ...shelf ? { shelf } : {} };
    }
    case "rm": {
      const flags = parseFlags(first, args, ["--all", "--shelf"]);
      return { kind: "rm", ref: flags.positional[0] ?? "", ...view(flags) };
    }
    case "pop": {
      const { positional, all } = parseFlags(first, args, ["--all"]);
      return { kind: "pop", ref: positional[0], all };
    }
    case "shelves":
      return { kind: "shelves" };
    case "shelf": {
      const { positional, force } = parseFlags(first, args, ["--force"]);
      const [action, ...names] = positional;
      if (!SHELF_ACTIONS.includes(action)) throw new UserError(SHELF_USAGE, 2);
      return { kind: "shelf", action, names, force };
    }
    case "enable":
    case "disable":
    case "doctor":
    case "statusline":
      return { kind: first };
    case "hotkey":
      return args[0] === "list" ? { kind: "hotkey", list: true, spec: args[1] } : { kind: "hotkey", list: false, spec: args[0] };
    default:
      return { kind: "run", agent: first, args, record };
  }
}

// src/cli/help.ts
var helpText = (version2) => `prompt-shelf ${version2}

Usage:
  stash <agent> [agent args...]   run an agent with stash support (${adapterNames.join(", ")})
  stash --record <agent>          run, but the hotkey dumps the screen to ~/.prompt-shelf/ (for adapter tuning)
  stash list [--all]              print entries stashed in this repo (--all: every repo)
  stash add <text>                stash text from the command line
  stash pop [n] [--all]           print entry n of that listing (1 = newest) and remove it
  stash rm <n> [--all]            remove entry n of that listing

Shelves (named lists of prompts you reuse; using one keeps it):
  stash shelves                   list your shelves (starred first)
  stash shelf new <name>          create a shelf
  stash shelf star <name>         star or unstar a shelf; starred shelves come first
  stash shelf rename <old> <new>  rename a shelf
  stash shelf rm <name> [--force] delete a shelf (--force also deletes its prompts)
  stash add --shelf <name> <text> save a prompt on a shelf (created if needed)
  stash list --shelf <name>       print the prompts on a shelf
  stash rm <n> --shelf <name>     remove prompt n from a shelf

Setup:
  stash enable                    install shims so plain ${adapterNames.join(" / ")} run through stash
  stash disable                   remove the shims and the PATH line
  stash doctor                    show versions, paths, shims and real agent binaries
  stash statusline                print a status-line line (drafts parked here, or the keys); see README
  stash hotkey [key]              show both hotkeys, or set the stash hotkey (ctrl+<letter> or f1..f12), e.g. stash hotkey f2
  stash hotkey list [key]         show or set the list hotkey

Env:
  STASH_OFF=1 <agent>             run the real binary directly (no wrapper)
  STASH_RECORD=1 <agent>          same as stash --record <agent>
  PROMPT_SHELF_DIR=<dir>          keep prompts, shelves and settings in <dir>
  PROMPT_SHELF_DEBUG=1            write a debug log to ~/.prompt-shelf/debug.log (or =<file>)

Hotkeys:
  ${DEFAULT_CONFIG.hotkey}  save what is in the box: enter keeps it in the stash, \u2190\u2192 picks a shelf
  ${DEFAULT_CONFIG.listHotkey}  open the list (stash, skills, shelves); what you pick goes after what you typed
Config: ~/.prompt-shelf/config.json  ${JSON.stringify(DEFAULT_CONFIG).replace(/,/g, ", ").replace(/:/g, ": ").replace(/^\{/, "{ ").replace(/\}$/, " }")}
`;

// src/cli/prompt-commands.ts
import { basename as basename2 } from "path";
var REMOVED_PREVIEW = 60;
var describeRemoved = (p) => {
  const location = p.shelf ? t("cli.shelf.removedShelfFormat", { shelf: p.shelf }) : t("cli.shelf.removedAgentFormat", { agent: p.agent, path: basename2(p.cwd) });
  return t("cli.shelf.removed", { location, text: clip(flatten(p.text), REMOVED_PREVIEW) });
};
var formatPrompt = (p, i) => {
  const text = flatten(p.text);
  if (p.shelf === void 0) return `${i + 1}. [${p.agent} \xB7 ${p.cwd}] ${text}`;
  const used = p.usedCount ? `used ${p.usedCount}\xD7, last ${localTime(p.lastUsedAt)}` : "not used yet";
  return `${i + 1}. ${text}
   saved ${localTime(p.createdAt)} \xB7 ${used}`;
};
function viewPrompts(prompts, scope) {
  if (scope.shelf) return prompts.filter(onShelf(scope.shelf));
  return scoped(prompts.filter(isStashDraft), scope.all ? "all" : "repo", scope.cwd);
}
function listLines(prompts, scope) {
  const shown = viewPrompts(prompts, scope);
  const lines = shown.map(formatPrompt);
  if (!scope.shelf) {
    const hidden = prompts.filter(isStashDraft).length - shown.length;
    if (hidden > 0) lines.push(t("cli.shelf.moreInOtherRepos", { count: hidden }));
  }
  return lines;
}
function resolveRef(prompts, ref, scope) {
  const shown = viewPrompts(prompts, scope);
  const n = Number.parseInt(ref ?? "1", 10);
  if (!Number.isInteger(n) || n < 1 || n > shown.length) throw new UserError(t("cli.prompt.noPromptError", { ref: ref ?? "1", count: shown.length }));
  return shown[n - 1];
}

// src/cli/setup-commands.ts
import { existsSync as existsSync2 } from "fs";
import { join as join5 } from "path";
async function runHotkeyCommand(spec, filePath = configFile, list = false) {
  const config = await loadConfig(filePath);
  if (spec === void 0) {
    return list ? t("cli.setup.listHotkeyMsg", { hotkey: config.listHotkey }) : t("cli.setup.bothHotkeysMsg", { hotkey: config.hotkey, listHotkey: config.listHotkey });
  }
  const { label } = parseHotkey(spec);
  const owners = reservedBy(label);
  if (owners.length) throw new UserError(t("cli.setup.hotkeyReservedError", { label, owners: owners.join(", ") }));
  const other = list ? config.hotkey : config.listHotkey;
  const which = list ? "stash" : "list";
  if (label === other) throw new UserError(t("cli.setup.hotkeyConflictError", { label, which }));
  await saveConfig(list ? { listHotkey: label } : { hotkey: label }, filePath);
  const whichLabel = list ? t("cli.setup.hotkeySetList") : t("cli.setup.hotkeySetStash");
  return t("cli.setup.hotkeySetMsg", { which: whichLabel, label });
}
function doctorLines(version2) {
  const onPath = shimDirOnPath();
  const debugLog = debugLogFile();
  const lines = [
    t("cli.setup.doctorVersion", { version: version2, nodeVersion: process.version, platform: process.platform }),
    t("cli.setup.doctorData", { dir: stashDir }),
    debugLog ? t("cli.setup.doctorDebugOn", { file: debugLog }) : t("cli.setup.doctorDebugOff"),
    t("cli.setup.doctorShimDir", { dir: shimDir }),
    onPath ? t("cli.setup.doctorOnPath_yes") : t("cli.setup.doctorOnPath_no")
  ];
  for (const { command } of allAdapters()) {
    const shimmed = existsSync2(join5(shimDir, command)) || existsSync2(join5(shimDir, `${command}.cmd`));
    const status = shimmed ? t("cli.setup.doctorShimInstalled") : t("cli.setup.doctorShimMissing");
    const binary = findRealBinary(command) ?? t("cli.setup.doctorBinaryNotFound");
    lines.push(t("cli.setup.doctorShimStatus", { command, status, binary }));
  }
  if (!onPath) lines.push(t("cli.setup.doctorPathFix", { hint: pathHint() }));
  return lines;
}

// src/cli/shelf-commands.ts
async function shelfLines(shelves, store) {
  const prompts = await store.list();
  const starred = await shelves.starred();
  return withOrphans(await shelves.list(), prompts).map((name) => `${starred.includes(name) ? "\u2605 " : "  "}${name} (${prompts.filter(onShelf(name)).length})`);
}
async function runShelfCommand(cmd, shelves, store) {
  const [first, second] = cmd.names;
  const rename2 = cmd.action === "rename" ? " <new name>" : "";
  if (!first) throw new UserError(t("cli.shelf.usageError", { action: cmd.action, rename: rename2 }), 2);
  if (cmd.action === "new") return t("cli.shelf.readyMsg", { name: await shelves.create(first) });
  if (cmd.action === "star") {
    const current = await requireShelf(shelves, store, first);
    if (!current.saved) await shelves.create(current.name);
    const starred = await shelves.toggleStar(current.name);
    return starred ? t("cli.shelf.starredMsg", { name: current.name }) : t("cli.shelf.unstarredMsg", { name: current.name });
  }
  if (cmd.action === "rename") {
    if (!second) throw new UserError(t("cli.shelf.usageRenameError"), 2);
    const { from, to } = await renameShelf(shelves, store, first, second);
    return t("cli.shelf.renamedMsg", { old: from, new: to });
  }
  return deletedMessage(await deleteShelf(shelves, store, first, cmd.force));
}

// src/cli/statusline.ts
function statusCwd(stdin) {
  try {
    const data = JSON.parse(stdin);
    const dir = data.workspace?.current_dir ?? data.cwd;
    return typeof dir === "string" ? dir : void 0;
  } catch {
    return void 0;
  }
}
function statusText(opts) {
  if (!opts.inSession) return "";
  const parked = scoped(opts.prompts.filter(isStashDraft), "repo", opts.cwd).length;
  return parked ? tn("statusline.parked", parked, { count: parked, list: opts.list }) : t("statusline.idle", { save: opts.save, list: opts.list });
}

// src/cli/main.ts
var { version } = package_default;
var print = (lines) => {
  const text = Array.isArray(lines) ? lines.join("\n") : lines;
  if (text) process.stdout.write(text + "\n");
};
var readStdin = () => new Promise((resolve) => {
  let text = "";
  const done = () => {
    process.stdin.destroy();
    resolve(text);
  };
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => text += chunk);
  process.stdin.on("end", done);
  setTimeout(done, 500).unref();
});
var tell = (message) => process.stderr.write(message + "\n");
async function main(argv) {
  try {
    return await run(parseArgs(argv));
  } catch (err) {
    if (!(err instanceof UserError)) throw err;
    tell(`prompt-shelf: ${err.message}`);
    return err.exitCode;
  }
}
async function run(cmd) {
  const store = new Store(promptsFile);
  const shelves = new Shelves(shelvesFile);
  const cwd = process.cwd();
  const shelfNamed = async (name) => name ? (await requireShelf(shelves, store, name)).name : void 0;
  switch (cmd.kind) {
    case "help":
      process.stdout.write(helpText(version));
      return 0;
    case "version":
      print(version);
      return 0;
    case "list":
      print(listLines(await store.list(), { ...cmd, shelf: await shelfNamed(cmd.shelf), cwd }));
      return 0;
    case "add": {
      if (!cmd.text) throw new UserError("nothing to add", 2);
      const shelf = cmd.shelf ? await shelves.create(cmd.shelf) : void 0;
      await store.add({ text: cmd.text, agent: "cli", cwd, ...shelf ? { shelf } : {} });
      if (shelf) tell(`saved on shelf ${shelf}`);
      return 0;
    }
    case "pop": {
      const prompt = resolveRef(await store.list(), cmd.ref, { all: cmd.all, cwd });
      print(prompt.text);
      await store.remove(prompt.id);
      tell(describeRemoved(prompt));
      return 0;
    }
    case "rm": {
      const prompt = resolveRef(await store.list(), cmd.ref, { ...cmd, shelf: await shelfNamed(cmd.shelf), cwd });
      await store.remove(prompt.id);
      tell(describeRemoved(prompt));
      return 0;
    }
    case "shelves": {
      const lines = await shelfLines(shelves, store);
      print(lines.length ? lines : "no shelves yet \u2014 stash shelf new <name>");
      return 0;
    }
    case "shelf":
      tell(await runShelfCommand(cmd, shelves, store));
      return 0;
    case "enable":
      print(describeInstall(await installShims()));
      return 0;
    case "disable":
      print(describeRemove(await removeShims()));
      return 0;
    case "doctor":
      print(doctorLines(version));
      return 0;
    case "statusline": {
      const config = await loadConfig();
      const stdin = process.stdin.isTTY ? "" : await readStdin();
      const text = statusText({
        prompts: await store.list(),
        cwd: statusCwd(stdin) ?? cwd,
        inSession: Boolean(process.env[SESSION_ENV]),
        save: config.hotkey,
        list: config.listHotkey
      });
      if (text) print(text);
      return 0;
    }
    case "hotkey":
      print(await runHotkeyCommand(cmd.spec, configFile, cmd.list));
      return 0;
    case "run": {
      const adapter = getAdapter(cmd.agent);
      if (!adapter) throw new UserError(`unknown agent "${cmd.agent}". Supported: ${adapterNames.join(", ")}`, 2);
      return runApp({ adapter, args: cmd.args, record: cmd.record });
    }
  }
}
export {
  main
};
//# sourceMappingURL=cli.js.map