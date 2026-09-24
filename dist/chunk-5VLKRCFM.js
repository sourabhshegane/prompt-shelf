// src/shims.ts
import { accessSync, constants, statSync } from "fs";
import { chmod, mkdir, readFile, rm, writeFile } from "fs/promises";
import { homedir } from "os";
import { basename, delimiter, dirname, join, resolve } from "path";

// src/adapters/types.ts
var END_KEY = "\x1B[F";
var BACKSPACE = "\x7F";
function backspaceClear(draft) {
  return END_KEY + BACKSPACE.repeat([...draft.text].length);
}
function findInputStart(lines, spec3) {
  for (let y = lines.length - 1; y >= 0; y--) {
    if (spec3.marker.test(lines[y] ?? "")) return y;
  }
  return null;
}
var WRAP_SLACK = 3;
var visibleWidth = (line) => [...line.trimEnd()].length;
var wrapsInto = (previous, cols) => cols !== void 0 && visibleWidth(previous) >= cols - WRAP_SLACK;
function readMarkedDraft(lines, cursor, spec3, cols) {
  const start = findInputStart(lines, spec3);
  if (start === null || cursor.y < start) return null;
  let text = spec3.marker.exec(lines[start] ?? "")?.[1] ?? "";
  let end = start;
  for (let y = start + 1; y < lines.length; y++) {
    const line = lines[y] ?? "";
    if (spec3.terminator.test(line) || line.trim() === "") break;
    const cont = spec3.continuation.exec(line);
    if (!cont) break;
    text += (wrapsInto(lines[y - 1] ?? "", cols) ? " " : "\n") + (cont[1] ?? "");
    end = y;
  }
  if (cursor.y > end) return null;
  text = text.replace(/\s+$/, "");
  return text ? { text } : null;
}

// src/adapters/claude.ts
var spec = {
  marker: /^\s*[>❯]\s?(.*)$/,
  continuation: /^\s{2}(.*)$/,
  terminator: /^[─╭╰]/
};
var claudeAdapter = {
  name: "claude",
  command: "claude",
  reservedKeys: ["ctrl+s", "ctrl+g", "ctrl+t", "ctrl+o", "ctrl+r", "ctrl+l", "ctrl+j", "ctrl+v", "ctrl+x", "ctrl+b", "ctrl+e", "ctrl+c", "ctrl+d"],
  readDraft: (lines, cursor, cols) => readMarkedDraft(lines, cursor, spec, cols),
  unsafeDraft: /\[Pasted text #\d+/,
  pasteLabel: { pattern: /\[Pasted text #(\d+)(?: \+\d+ lines?)?\]/g, key: "number" },
  clearDraft: backspaceClear,
  inputTop: (lines) => findInputStart(lines, spec),
  isBorder: (line) => spec.terminator.test(line)
};

// src/adapters/codex.ts
var spec2 = {
  marker: /^\s*›\s?(.*)$/,
  continuation: /^\s{2}(.*)$/,
  terminator: /^[─╭╰]/
};
var codexAdapter = {
  name: "codex",
  command: "codex",
  reservedKeys: ["ctrl+t", "ctrl+c", "ctrl+d", "ctrl+j", "ctrl+r", "ctrl+g"],
  readDraft: (lines, cursor, cols) => readMarkedDraft(lines, cursor, spec2, cols),
  dimPlaceholder: true,
  unsafeDraft: /\[Pasted Content/i,
  pasteLabel: { pattern: /\[Pasted Content (\d+) chars\]/g, key: "chars" },
  clearDraft: backspaceClear,
  inputTop: (lines) => findInputStart(lines, spec2),
  isBorder: (line) => spec2.terminator.test(line)
};

// src/adapters/index.ts
var registry = /* @__PURE__ */ new Map([
  [claudeAdapter.name, claudeAdapter],
  [codexAdapter.name, codexAdapter]
]);
var adapterNames = [...registry.keys()];
var getAdapter = (name) => registry.get(name);
var reservedBy = (hotkey) => [...registry.values()].filter((a) => a.reservedKeys.includes(hotkey.toLowerCase())).map((a) => a.name);

// src/shims.ts
var MARKER = "# prompt-shelf";
var win32 = process.platform === "win32";
var homeFor = (env) => env.HOME ?? env.USERPROFILE ?? homedir();
var shimDirFor = (env) => join(homeFor(env), ".prompt-shelf", "bin");
var shimDir = shimDirFor(process.env);
var isShimDir = (entry, env) => resolve(entry) === resolve(shimDirFor(env));
var shimDirOnPath = (env = process.env) => (env.PATH ?? "").split(delimiter).some((entry) => entry && isShimDir(entry, env));
function stripShimDir(path, env = process.env) {
  return (path ?? "").split(delimiter).filter((entry) => !entry || !isShimDir(entry, env)).join(delimiter);
}
var isExecutableFile = (file) => {
  try {
    if (!statSync(file).isFile()) return false;
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
      const candidate = join(entry, name + ext);
      if (isExecutableFile(candidate)) return candidate;
    }
  }
  return null;
}
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
  if (shell === "zsh") return { shell, files: [join(home, ".zshrc")] };
  if (shell === "fish") return { shell, files: [join(home, ".config", "fish", "config.fish")] };
  if (shell === "bash") {
    const files = [join(home, ".bashrc")];
    const profile = join(home, ".bash_profile");
    if (process.platform === "darwin" && isReadable(profile)) files.push(profile);
    return { shell, files };
  }
  return null;
}
var isReadable = (file) => {
  try {
    accessSync(file, constants.R_OK);
    return true;
  } catch {
    return false;
  }
};
async function appendRcLine(file, line) {
  const current = await readFile(file, "utf8").catch(() => "");
  if (current.includes(MARKER)) return false;
  await mkdir(dirname(file), { recursive: true });
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
async function installShims(env = process.env) {
  const dir = shimDirFor(env);
  await mkdir(dir, { recursive: true });
  const shims = [];
  for (const name of adapterNames) {
    if (!findRealBinary(name, env)) continue;
    const file = join(dir, shimFileName(name));
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
async function removeShims(env = process.env) {
  const dir = shimDirFor(env);
  const removed = [];
  for (const name of adapterNames) {
    const file = join(dir, shimFileName(name));
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
function describeInstall(result, env = process.env) {
  const lines = result.shims.map((shim) => `shim: ${shim}`);
  if (!result.shims.length) lines.push(`no supported agents (${adapterNames.join(", ")}) found on PATH; run \`stash enable\` after installing one`);
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

export {
  adapterNames,
  getAdapter,
  reservedBy,
  shimDirFor,
  shimDir,
  shimDirOnPath,
  stripShimDir,
  findRealBinary,
  rcLineFor,
  installShims,
  removeShims,
  pathHint,
  describeInstall,
  describeRemove
};
//# sourceMappingURL=chunk-5VLKRCFM.js.map