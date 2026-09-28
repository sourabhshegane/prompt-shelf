// src/adapters/claude.ts
import { homedir } from "os";
import { join as join3 } from "path";

// src/domain/scope.ts
import { existsSync } from "fs";
import { dirname, join, resolve } from "path";
function repoDirs(dir) {
  const dirs = [];
  for (let d = resolve(dir); ; d = dirname(d)) {
    dirs.push(d);
    if (existsSync(join(d, ".git")) || dirname(d) === d) return dirs;
  }
}
var roots = /* @__PURE__ */ new Map();
function repoRoot(dir) {
  const start = resolve(dir);
  let root = roots.get(start);
  if (root === void 0) {
    const dirs = repoDirs(start);
    const top = dirs[dirs.length - 1];
    root = existsSync(join(top, ".git")) ? top : start;
    roots.set(start, root);
  }
  return root;
}
var inRepo = (entry, cwd) => repoRoot(entry.cwd) === repoRoot(cwd);
function scoped(entries, scope, cwd) {
  return scope === "all" || cwd === void 0 ? entries : entries.filter((e) => inRepo(e, cwd));
}

// src/terminal/sequences.ts
var PASTE_START = "\x1B[200~";
var PASTE_END = "\x1B[201~";
var END_KEY = "\x1B[F";
var BACKSPACE = "\x7F";

// src/terminal/text.ts
var ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;
var ANSI_AT_START = /^\x1b\[[0-9;?]*[A-Za-z]/;
var ZERO_WIDTH = /^[\p{Mn}\p{Me}​-‏⁠︎️]$/u;
var WIDE = /^[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦\u{1f300}-\u{1f64f}\u{1f900}-\u{1f9ff}\u{20000}-\u{3fffd}]$/u;
var cellWidth = (ch) => ZERO_WIDTH.test(ch) ? 0 : WIDE.test(ch) || new RegExp("\\p{Extended_Pictographic}", "u").test(ch) ? 2 : 1;
var stripAnsi = (text) => text.replace(ANSI, "");
var visibleWidth = (text) => [...stripAnsi(text)].reduce((n, ch) => n + cellWidth(ch), 0);
var flatten = (text) => text.replace(/\r?\n/g, " \u23CE ").replace(/\t/g, " ").replace(/[\u0000-\u001f\u007f-\u009f]/g, "");
function clip(text, width) {
  if (visibleWidth(text) <= width) return text;
  let out = "";
  let used = 0;
  for (const ch of text) {
    const w = cellWidth(ch);
    if (used + w > width - 1) break;
    out += ch;
    used += w;
  }
  return width > 0 ? out + "\u2026" : "";
}
function truncateLine(line, width) {
  let out = "";
  let used = 0;
  for (let i = 0; i < line.length; ) {
    const seq = ANSI_AT_START.exec(line.slice(i));
    if (seq) {
      out += seq[0];
      i += seq[0].length;
      continue;
    }
    const ch = String.fromCodePoint(line.codePointAt(i));
    const w = cellWidth(ch);
    if (used + w <= width) {
      out += ch;
      used += w;
    }
    i += ch.length;
  }
  return out;
}
var fitLine = (line, width) => truncateLine(line, width) + " ".repeat(Math.max(0, width - visibleWidth(line)));
var padCells = (text, width) => text + " ".repeat(Math.max(0, width - visibleWidth(text)));

// src/adapters/input-box.ts
var DEFAULTS = { continuation: /^\s{2}(.*)$/, terminator: /^[─╭╰]/ };
var WRAP_SLACK = 3;
var wrapsInto = (previous, cols) => cols !== void 0 && visibleWidth(previous.trimEnd()) >= cols - WRAP_SLACK;
function findInputStart(lines, spec) {
  for (let y = lines.length - 1; y >= 0; y--) {
    if (spec.marker.test(lines[y] ?? "")) return y;
  }
  return null;
}
function readMarkedDraft(lines, cursor, spec, cols) {
  const start = findInputStart(lines, spec);
  if (start === null || cursor.y < start) return null;
  let text = spec.marker.exec(lines[start] ?? "")?.[1] ?? "";
  let end = start;
  for (let y = start + 1; y < lines.length; y++) {
    const line = lines[y] ?? "";
    if (spec.terminator.test(line) || line.trim() === "") break;
    const cont = spec.continuation.exec(line);
    if (!cont) break;
    text += (wrapsInto(lines[y - 1] ?? "", cols) ? " " : "\n") + (cont[1] ?? "");
    end = y;
  }
  if (cursor.y > end) return null;
  text = text.replace(/\s+$/, "");
  return text ? { text } : null;
}
function backspaceClear(draft) {
  return END_KEY + BACKSPACE.repeat([...draft.text].length);
}
function markedInputBox(spec) {
  const full = { ...DEFAULTS, ...spec };
  return {
    readDraft: (lines, cursor, cols) => readMarkedDraft(lines, cursor, full, cols),
    clearDraft: backspaceClear,
    inputTop: (lines) => findInputStart(lines, full),
    isBorder: (line) => full.terminator.test(line)
  };
}

// src/adapters/skill-files.ts
import { readFileSync, readdirSync, statSync } from "fs";
import { join as join2 } from "path";
function parseSkillFile(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!match) return {};
  const lines = match[1].split(/\r?\n/);
  const out = {};
  for (let i = 0; i < lines.length; i++) {
    const field = /^(name|description|user-invocable):\s*(.*)$/.exec(lines[i]);
    if (!field) continue;
    const parts = [field[2].trim()];
    const block = /^[|>]-?$/.test(parts[0]);
    if (block) parts.pop();
    while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) parts.push(lines[++i].trim());
    out[field[1]] = parts.join(" ").trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  return out;
}
function subfolders(dir) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names.filter((name) => {
    try {
      return statSync(join2(dir, name)).isDirectory();
    } catch {
      return false;
    }
  });
}
function skillsIn(dir, source, prefix = "", off = /* @__PURE__ */ new Set()) {
  const found = [];
  for (const folder of subfolders(dir)) {
    let text;
    try {
      text = readFileSync(join2(dir, folder, "SKILL.md"), "utf8");
    } catch {
      continue;
    }
    const meta = parseSkillFile(text);
    const name = prefix + (meta.name || folder);
    if (meta["user-invocable"] === "false" || off.has(name)) continue;
    const heading = /^#\s+(.+)$/m.exec(text)?.[1]?.trim() ?? "";
    found.push({ name, description: meta.description || heading, source });
  }
  return found;
}
function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return void 0;
  }
}
var firstByName = (skills) => {
  const seen = /* @__PURE__ */ new Set();
  return skills.filter((s) => !seen.has(s.name) && seen.add(s.name));
};

// src/adapters/claude.ts
var claudeAdapter = {
  name: "claude",
  displayName: "Claude Code",
  command: "claude",
  reservedKeys: ["ctrl+s", "ctrl+g", "ctrl+t", "ctrl+o", "ctrl+r", "ctrl+l", "ctrl+j", "ctrl+v", "ctrl+x", "ctrl+b", "ctrl+e", "ctrl+c", "ctrl+d"],
  ...markedInputBox({ marker: /^\s*[>❯]\s?(.*)$/ }),
  dimPlaceholder: true,
  pasteLabel: { pattern: /\[Pasted text #(\d+)(?: \+(\d+) lines?)?\]/g, key: "number" },
  unsafeDraft: /\[Pasted text #\d+/,
  skills: (cwd) => claudeSkills(cwd),
  // `/name` runs a skill, but only at the start of a prompt; after typed text it is named in words.
  skillPrompt: (name, afterText) => afterText ? `use the /${name} skill ` : `/${name} `
};
var settingsFiles = (home, cwd) => [
  join3(home, ".claude", "settings.json"),
  ...repoDirs(cwd).flatMap((d) => [join3(d, ".claude", "settings.json"), join3(d, ".claude", "settings.local.json")])
];
function switchedOff(home, cwd) {
  const off = /* @__PURE__ */ new Set();
  for (const file of settingsFiles(home, cwd)) {
    const overrides = readJson(file)?.skillOverrides ?? {};
    for (const [name, value] of Object.entries(overrides)) if (value === "off") off.add(name);
  }
  return off;
}
function pluginSkills(home, off) {
  const settings = readJson(join3(home, ".claude", "settings.json"));
  const installed = readJson(join3(home, ".claude", "plugins", "installed_plugins.json"));
  return Object.entries(settings?.enabledPlugins ?? {}).filter(([, on]) => on).flatMap(([id]) => {
    const path = installed?.plugins?.[id]?.[0]?.installPath;
    return path ? skillsIn(join3(path, "skills"), "plugin", `${id.split("@")[0]}:`, off) : [];
  });
}
function claudeSkills(cwd, home = homedir()) {
  const off = switchedOff(home, cwd);
  const synced = join3(home, ".claude", "skills", "synced");
  return firstByName([
    ...repoDirs(cwd).flatMap((d) => skillsIn(join3(d, ".claude", "skills"), "project", "", off)),
    ...skillsIn(join3(home, ".claude", "skills"), "personal", "", off),
    ...subfolders(synced).flatMap((d) => skillsIn(join3(synced, d), "personal", "", off)),
    ...pluginSkills(home, off)
  ]);
}

// src/adapters/codex.ts
import { homedir as homedir2 } from "os";
import { join as join4 } from "path";
var codexAdapter = {
  name: "codex",
  displayName: "Codex",
  command: "codex",
  reservedKeys: ["ctrl+t", "ctrl+c", "ctrl+d", "ctrl+j", "ctrl+r", "ctrl+g"],
  ...markedInputBox({ marker: /^\s*›\s?(.*)$/ }),
  dimPlaceholder: true,
  pasteLabel: { pattern: /\[Pasted Content (\d+) chars\]/g, key: "chars" },
  unsafeDraft: /\[Pasted Content/i,
  skills: (cwd) => codexSkills(cwd),
  // `$name` mentions a skill anywhere in a prompt.
  skillPrompt: (name) => `$${name} `
};
var defaultRoots = () => ({
  home: homedir2(),
  codexHome: process.env.CODEX_HOME || join4(homedir2(), ".codex"),
  systemSkills: "/etc/codex/skills"
});
function codexSkills(cwd, roots2 = defaultRoots()) {
  return firstByName([
    ...repoDirs(cwd).flatMap((d) => skillsIn(join4(d, ".agents", "skills"), "project")),
    ...skillsIn(join4(roots2.home, ".agents", "skills"), "personal"),
    ...skillsIn(join4(roots2.codexHome, "skills"), "personal"),
    ...skillsIn(roots2.systemSkills, "personal"),
    ...skillsIn(join4(roots2.codexHome, "skills", ".system"), "built-in")
  ]);
}

// src/adapters/index.ts
var adapters = [claudeAdapter, codexAdapter];
var allAdapters = () => adapters;
var adapterNames = adapters.map((a) => a.name);
var getAdapter = (name) => adapters.find((a) => a.name === name);
var reservedBy = (hotkey) => adapters.filter((a) => a.reservedKeys.includes(hotkey.toLowerCase())).map((a) => a.name);

// src/system/shims.ts
import { accessSync as accessSync2, constants as constants2 } from "fs";
import { chmod, mkdir, readFile, rm, writeFile } from "fs/promises";
import { basename, dirname as dirname2, join as join6 } from "path";

// src/system/binaries.ts
import { accessSync, constants, statSync as statSync2 } from "fs";
import { homedir as homedir3 } from "os";
import { delimiter, join as join5, resolve as resolve2 } from "path";
var win32 = process.platform === "win32";
var homeFor = (env) => env.HOME ?? env.USERPROFILE ?? homedir3();
var shimDirFor = (env) => join5(homeFor(env), ".prompt-shelf", "bin");
var shimDir = shimDirFor(process.env);
var isShimDir = (entry, env) => resolve2(entry) === resolve2(shimDirFor(env));
var shimDirOnPath = (env = process.env) => (env.PATH ?? "").split(delimiter).some((entry) => entry && isShimDir(entry, env));
function stripShimDir(path, env = process.env) {
  return (path ?? "").split(delimiter).filter((entry) => !entry || !isShimDir(entry, env)).join(delimiter);
}
var isExecutableFile = (file) => {
  try {
    if (!statSync2(file).isFile()) return false;
    if (!win32) accessSync(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};
function findRealBinary(name, env = process.env) {
  const exts = win32 ? [...(env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";"), ""] : [""];
  for (const entry of stripShimDir(env.PATH, env).split(delimiter)) {
    for (const ext of exts) {
      const candidate = join5(entry, name + ext);
      if (isExecutableFile(candidate)) return candidate;
    }
  }
  return null;
}
var isCmdScript = (file) => /\.(cmd|bat)$/i.test(file);

// src/system/shims.ts
var MARKER = "# prompt-shelf";
var shimFileName = (name) => win32 ? `${name}.cmd` : name;
var posixShim = (name) => [
  "#!/bin/sh",
  `if command -v stash >/dev/null 2>&1; then exec stash ${name} "$@"; fi`,
  `PATH=$(printf %s "$PATH" | tr : '\\n' | grep -vxF "$HOME/.prompt-shelf/bin" | paste -sd: -) exec ${name} "$@"`,
  ""
].join("\n");
var cmdShim = (name) => `@echo off\r
where stash >nul 2>&1 && (stash ${name} %*) || (${name} %*)\r
`;
var shimContent = (name) => win32 ? cmdShim(name) : posixShim(name);
var rcLineFor = (shell) => shell === "fish" ? `fish_add_path --path --move ~/.prompt-shelf/bin ${MARKER}` : `export PATH="$HOME/.prompt-shelf/bin:$PATH"  ${MARKER}`;
function rcFilesFor(env) {
  if (win32) return null;
  const home = homeFor(env);
  const shell = basename(env.SHELL ?? "");
  if (shell === "zsh") return { shell, files: [join6(home, ".zshrc")] };
  if (shell === "fish") return { shell, files: [join6(home, ".config", "fish", "config.fish")] };
  if (shell === "bash") {
    const files = [join6(home, ".bashrc")];
    const profile = join6(home, ".bash_profile");
    if (process.platform === "darwin" && isReadable(profile)) files.push(profile);
    return { shell, files };
  }
  return null;
}
var isReadable = (file) => {
  try {
    accessSync2(file, constants2.R_OK);
    return true;
  } catch {
    return false;
  }
};
async function appendRcLine(file, line) {
  const current = await readFile(file, "utf8").catch(() => "");
  if (current.includes(MARKER)) return false;
  await mkdir(dirname2(file), { recursive: true });
  const prefix = current && !current.endsWith("\n") ? "\n" : "";
  await writeFile(file, current + prefix + line + "\n");
  return true;
}
var isMarkedLine = (line) => line.trimEnd().endsWith(MARKER);
async function removeRcLine(file) {
  const current = await readFile(file, "utf8").catch(() => "");
  const lines = current.split("\n");
  if (!lines.some(isMarkedLine)) return false;
  const trailingNewline = current.endsWith("\n");
  const kept = (trailingNewline ? lines.slice(0, -1) : lines).filter((line) => !isMarkedLine(line));
  await writeFile(file, kept.join("\n") + (trailingNewline && kept.length ? "\n" : ""));
  return true;
}
async function installShims(commands2, env = process.env) {
  const dir = shimDirFor(env);
  await mkdir(dir, { recursive: true });
  const shims = [];
  for (const name of commands2) {
    if (!findRealBinary(name, env)) continue;
    const file = join6(dir, shimFileName(name));
    await writeFile(file, shimContent(name));
    if (!win32) await chmod(file, 493);
    shims.push(file);
  }
  const rc = rcFilesFor(env);
  if (!rc) return { shims, rcFile: null, rcChanged: false };
  let rcChanged = false;
  for (const file of rc.files) rcChanged = await appendRcLine(file, rcLineFor(rc.shell)) || rcChanged;
  return { shims, rcFile: rc.files[0] ?? null, rcChanged };
}
async function removeShims(commands2, env = process.env) {
  const dir = shimDirFor(env);
  const removed = [];
  for (const name of commands2) {
    const file = join6(dir, shimFileName(name));
    if (!isReadable(file)) continue;
    await rm(file, { force: true });
    removed.push(file);
  }
  const rc = rcFilesFor(env);
  if (!rc) return { removed, rcFile: null, rcChanged: false };
  let rcChanged = false;
  for (const file of rc.files) rcChanged = await removeRcLine(file) || rcChanged;
  return { removed, rcFile: rc.files[0] ?? null, rcChanged };
}
var pathHint = (env = process.env) => win32 ? `add ${shimDirFor(env)} to the front of your PATH (System Properties \u2192 Environment Variables), then open a new terminal` : `add this line to your shell rc file, then open a new terminal:
  ${rcLineFor(basename(env.SHELL ?? ""))}`;
function describeInstall(result, commands2, env = process.env) {
  const lines = result.shims.map((shim) => `shim: ${shim}`);
  if (!result.shims.length) lines.push(`no supported agents (${commands2.join(", ")}) found on PATH; run \`stash enable\` after installing one`);
  if (result.rcFile) lines.push(result.rcChanged ? `PATH: added to ${result.rcFile} (open a new terminal)` : `PATH: already configured in ${result.rcFile}`);
  else lines.push(`PATH: ${pathHint(env)}`);
  return lines;
}
function describeRemove(result) {
  const lines = result.removed.map((shim) => `removed: ${shim}`);
  if (!result.removed.length) lines.push("no shims to remove");
  if (result.rcFile) lines.push(result.rcChanged ? `PATH: removed from ${result.rcFile}` : `PATH: nothing to remove in ${result.rcFile}`);
  return lines;
}

// src/shims-entry.ts
var commands = () => allAdapters().map((a) => a.command);
var installShims2 = (env) => installShims(commands(), env);
var removeShims2 = (env) => removeShims(commands(), env);
var describeInstall2 = (result, env) => describeInstall(result, commands(), env);

export {
  scoped,
  PASTE_START,
  PASTE_END,
  visibleWidth,
  flatten,
  clip,
  truncateLine,
  fitLine,
  padCells,
  allAdapters,
  adapterNames,
  getAdapter,
  reservedBy,
  shimDir,
  shimDirOnPath,
  stripShimDir,
  findRealBinary,
  isCmdScript,
  pathHint,
  describeRemove,
  installShims2 as installShims,
  removeShims2 as removeShims,
  describeInstall2 as describeInstall
};
//# sourceMappingURL=chunk-GH7BL566.js.map