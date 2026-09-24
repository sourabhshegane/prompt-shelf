import { accessSync, constants, statSync } from 'node:fs';
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, delimiter, dirname, join, resolve } from 'node:path';
import { adapterNames } from './adapters/index.js';

const MARKER = '# prompt-shelf';
const win32 = process.platform === 'win32';

type Env = Record<string, string | undefined>;

const homeFor = (env: Env) => env.HOME ?? env.USERPROFILE ?? homedir();

export const shimDirFor = (env: Env): string => join(homeFor(env), '.prompt-shelf', 'bin');
export const shimDir = shimDirFor(process.env);

const isShimDir = (entry: string, env: Env) => resolve(entry) === resolve(shimDirFor(env));

export const shimDirOnPath = (env: Env = process.env): boolean => (env.PATH ?? '').split(delimiter).some((entry) => entry && isShimDir(entry, env));

export function stripShimDir(path: string | undefined, env: Env = process.env): string {
  return (path ?? '')
    .split(delimiter)
    .filter((entry) => !entry || !isShimDir(entry, env))
    .join(delimiter);
}

const isExecutableFile = (file: string) => {
  try {
    if (!statSync(file).isFile()) return false;
    if (!win32) accessSync(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

export function findRealBinary(name: string, env: Env = process.env): string | null {
  const exts = win32 ? [...(env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';'), ''] : [''];
  for (const entry of stripShimDir(env.PATH, env).split(delimiter)) {
    for (const ext of exts) {
      const candidate = join(entry, name + ext);
      if (isExecutableFile(candidate)) return candidate;
    }
  }
  return null;
}

const shimFileName = (name: string) => (win32 ? `${name}.cmd` : name);
const posixShim = (name: string) =>
  [
    '#!/bin/sh',
    `if command -v stash >/dev/null 2>&1; then exec stash ${name} "$@"; fi`,
    `PATH=$(printf %s "$PATH" | tr : '\\n' | grep -vxF "$HOME/.prompt-shelf/bin" | paste -sd: -) exec ${name} "$@"`,
    '',
  ].join('\n');

const cmdShim = (name: string) => `@echo off\r\nwhere stash >nul 2>&1 && (stash ${name} %*) || (${name} %*)\r\n`;

const shimContent = (name: string) => (win32 ? cmdShim(name) : posixShim(name));

export const rcLineFor = (shell: string): string =>
  shell === 'fish' ? `fish_add_path --path --move ~/.prompt-shelf/bin ${MARKER}` : `export PATH="$HOME/.prompt-shelf/bin:$PATH"  ${MARKER}`;

function rcFilesFor(env: Env): { shell: string; files: string[] } | null {
  if (win32) return null;
  const home = homeFor(env);
  const shell = basename(env.SHELL ?? '');
  if (shell === 'zsh') return { shell, files: [join(home, '.zshrc')] };
  if (shell === 'fish') return { shell, files: [join(home, '.config', 'fish', 'config.fish')] };
  if (shell === 'bash') {
    const files = [join(home, '.bashrc')];
    const profile = join(home, '.bash_profile');
    if (process.platform === 'darwin' && isReadable(profile)) files.push(profile);
    return { shell, files };
  }
  return null;
}

const isReadable = (file: string) => {
  try {
    accessSync(file, constants.R_OK);
    return true;
  } catch {
    return false;
  }
};

async function appendRcLine(file: string, line: string): Promise<boolean> {
  const current = await readFile(file, 'utf8').catch(() => '');
  if (current.includes(MARKER)) return false;
  await mkdir(dirname(file), { recursive: true });
  const prefix = current && !current.endsWith('\n') ? '\n' : '';
  await writeFile(file, current + prefix + line + '\n');
  return true;
}

const isMarkedLine = (line: string) => line.trimEnd().endsWith(MARKER);

async function removeRcLine(file: string): Promise<boolean> {
  const current = await readFile(file, 'utf8').catch(() => '');
  const lines = current.split('\n');
  if (!lines.some(isMarkedLine)) return false;
  const trailingNewline = current.endsWith('\n');
  const kept = (trailingNewline ? lines.slice(0, -1) : lines).filter((line) => !isMarkedLine(line));
  await writeFile(file, kept.join('\n') + (trailingNewline && kept.length ? '\n' : ''));
  return true;
}

export interface InstallResult {
  shims: string[];
  rcFile: string | null;
  rcChanged: boolean;
}

export interface RemoveResult {
  removed: string[];
  rcFile: string | null;
  rcChanged: boolean;
}

export async function installShims(env: Env = process.env): Promise<InstallResult> {
  const dir = shimDirFor(env);
  await mkdir(dir, { recursive: true });
  const shims: string[] = [];
  for (const name of adapterNames) {
    if (!findRealBinary(name, env)) continue;
    const file = join(dir, shimFileName(name));
    await writeFile(file, shimContent(name));
    if (!win32) await chmod(file, 0o755);
    shims.push(file);
  }
  const rc = rcFilesFor(env);
  if (!rc) return { shims, rcFile: null, rcChanged: false };
  let rcChanged = false;
  for (const file of rc.files) rcChanged = (await appendRcLine(file, rcLineFor(rc.shell))) || rcChanged;
  return { shims, rcFile: rc.files[0] ?? null, rcChanged };
}

export async function removeShims(env: Env = process.env): Promise<RemoveResult> {
  const dir = shimDirFor(env);
  const removed: string[] = [];
  for (const name of adapterNames) {
    const file = join(dir, shimFileName(name));
    if (!isReadable(file)) continue;
    await rm(file, { force: true });
    removed.push(file);
  }
  const rc = rcFilesFor(env);
  if (!rc) return { removed, rcFile: null, rcChanged: false };
  let rcChanged = false;
  for (const file of rc.files) rcChanged = (await removeRcLine(file)) || rcChanged;
  return { removed, rcFile: rc.files[0] ?? null, rcChanged };
}

export const pathHint = (env: Env = process.env): string =>
  win32
    ? `add ${shimDirFor(env)} to the front of your PATH (System Properties → Environment Variables), then open a new terminal`
    : `add this line to your shell rc file, then open a new terminal:\n  ${rcLineFor(basename(env.SHELL ?? ''))}`;

export function describeInstall(result: InstallResult, env: Env = process.env): string[] {
  const lines = result.shims.map((shim) => `shim: ${shim}`);
  if (!result.shims.length) lines.push(`no supported agents (${adapterNames.join(', ')}) found on PATH; run \`stash enable\` after installing one`);
  if (result.rcFile) lines.push(result.rcChanged ? `PATH: added to ${result.rcFile} (open a new terminal)` : `PATH: already configured in ${result.rcFile}`);
  else lines.push(`PATH: ${pathHint(env)}`);
  return lines;
}

export function describeRemove(result: RemoveResult): string[] {
  const lines = result.removed.map((shim) => `removed: ${shim}`);
  if (!result.removed.length) lines.push('no shims to remove');
  if (result.rcFile) lines.push(result.rcChanged ? `PATH: removed from ${result.rcFile}` : `PATH: nothing to remove in ${result.rcFile}`);
  return lines;
}
