import { createRequire } from 'node:module';
import { adapterNames, getAdapter, reservedBy } from './adapters/index.js';
import { configFile, loadConfig, saveConfig, stashFile } from './config.js';
import { parseHotkey } from './core/keys.js';
import { scoped, type Scope } from './core/scope.js';
import { Store, type StashEntry } from './core/store.js';
import { runApp } from './app.js';
import { describeInstall, describeRemove, findRealBinary, installShims, pathHint, removeShims, shimDir, shimDirOnPath } from './shims.js';
import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';

const { version } = createRequire(import.meta.url)('../package.json') as { version: string };

export type ParsedArgs =
  | { kind: 'run'; agent: string; args: string[]; record: boolean }
  | { kind: 'list'; all: boolean }
  | { kind: 'add'; text: string }
  | { kind: 'rm'; ref: string; all: boolean }
  | { kind: 'pop'; ref: string | undefined; all: boolean }
  | { kind: 'enable' }
  | { kind: 'disable' }
  | { kind: 'doctor' }
  | { kind: 'hotkey'; list: boolean; spec: string | undefined }
  | { kind: 'help' }
  | { kind: 'version' };

export function parseArgs(argv: string[]): ParsedArgs {
  let record = false;
  const rest = [...argv];
  if (rest[0] === '--record') {
    record = true;
    rest.shift();
  }
  const [first, ...args] = rest;
  if (!first || first === '--help' || first === '-h') return { kind: 'help' };
  if (first === '--version' || first === '-v') return { kind: 'version' };
  const all = args.includes('--all');
  const positional = args.filter((a) => a !== '--all');
  if (first === 'list') return { kind: 'list', all };
  if (first === 'add') return { kind: 'add', text: args.join(' ') };
  if (first === 'rm') return { kind: 'rm', ref: positional[0] ?? '', all };
  if (first === 'pop') return { kind: 'pop', ref: positional[0], all };
  if (first === 'enable' || first === 'disable' || first === 'doctor') return { kind: first };
  if (first === 'hotkey') return args[0] === 'list' ? { kind: 'hotkey', list: true, spec: args[1] } : { kind: 'hotkey', list: false, spec: args[0] };
  return { kind: 'run', agent: first, args, record };
}

const help = `prompt-shelf ${version}

Usage:
  stash <agent> [agent args...]   run an agent with stash support (${adapterNames.join(', ')})
  stash --record <agent>          run, but the hotkey dumps the screen to ~/.prompt-shelf/ (for adapter tuning)
  stash list [--all]              print entries stashed in this repo (--all: every repo)
  stash add <text>                stash text from the command line
  stash pop [n] [--all]           print entry n of that listing (1 = newest) and remove it
  stash rm <n> [--all]            remove entry n of that listing
  stash enable                    install shims so plain ${adapterNames.join(' / ')} run through stash
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

export async function runHotkeyCommand(spec: string | undefined, filePath = configFile, list = false): Promise<{ code: number; message: string }> {
  const config = await loadConfig(filePath);
  if (spec === undefined) {
    if (list) return { code: 0, message: `list hotkey: ${config.listHotkey}` };
    return { code: 0, message: `hotkey: ${config.hotkey}\nlist hotkey: ${config.listHotkey}` };
  }
  let label: string;
  try {
    label = parseHotkey(spec).label;
  } catch (err) {
    return { code: 1, message: err instanceof Error ? err.message : String(err) };
  }
  const owners = reservedBy(label);
  if (owners.length) return { code: 1, message: `${label} is reserved by ${owners.join(', ')}; pick another` };
  const other = list ? config.hotkey : config.listHotkey;
  if (label === other) return { code: 1, message: `${label} is already the ${list ? 'stash' : 'list'} hotkey; pick another` };
  await saveConfig(list ? { listHotkey: label } : { hotkey: label }, filePath);
  return { code: 0, message: `${list ? 'list hotkey' : 'hotkey'} set to ${label} — takes effect in new sessions` };
}

export interface ListScope {
  all: boolean;
  cwd: string;
}

const scopeOf = ({ all }: ListScope): Scope => (all ? 'all' : 'repo');

const REMOVED_PREVIEW = 60;

export const describeRemoved = (e: StashEntry): string => {
  const flat = e.text.replace(/\r?\n/g, ' ⏎ ');
  const preview = [...flat].length > REMOVED_PREVIEW ? [...flat].slice(0, REMOVED_PREVIEW).join('') + '…' : flat;
  return `removed: [${e.agent} · ${basename(e.cwd)}] ${preview}`;
};

const formatEntry = (e: StashEntry, i: number) => `${i + 1}. [${e.agent} · ${e.cwd}] ${e.text.replace(/\r?\n/g, ' ⏎ ')}`;

export function listLines(entries: StashEntry[], scope: ListScope): string[] {
  const shown = scoped(entries, scopeOf(scope), scope.cwd);
  const lines = shown.map(formatEntry);
  const hidden = entries.length - shown.length;
  if (hidden > 0) lines.push(`${hidden} more in other repos — stash list --all`);
  return lines;
}

export function resolveRef(entries: StashEntry[], ref: string | undefined, scope: ListScope): StashEntry {
  const shown = scoped(entries, scopeOf(scope), scope.cwd);
  const n = Number.parseInt(ref ?? '1', 10);
  if (!Number.isInteger(n) || n < 1 || n > shown.length) throw new Error(`no entry ${ref ?? '1'} (have ${shown.length})`);
  return shown[n - 1]!;
}

export async function main(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv);
  const store = new Store(stashFile);
  switch (parsed.kind) {
    case 'help':
      process.stdout.write(help);
      return 0;
    case 'version':
      process.stdout.write(version + '\n');
      return 0;
    case 'list': {
      const lines = listLines(await store.list(), { all: parsed.all, cwd: process.cwd() });
      if (lines.length) process.stdout.write(lines.join('\n') + '\n');
      return 0;
    }
    case 'add':
      if (!parsed.text) throw new Error('nothing to add');
      await store.add({ text: parsed.text, agent: 'cli', cwd: process.cwd() });
      return 0;
    case 'pop': {
      const entry = resolveRef(await store.list(), parsed.ref, { all: parsed.all, cwd: process.cwd() });
      process.stdout.write(entry.text + '\n');
      await store.remove(entry.id);
      process.stderr.write(describeRemoved(entry) + '\n');
      return 0;
    }
    case 'rm': {
      const entry = resolveRef(await store.list(), parsed.ref, { all: parsed.all, cwd: process.cwd() });
      await store.remove(entry.id);
      process.stderr.write(describeRemoved(entry) + '\n');
      return 0;
    }
    case 'enable': {
      const lines = describeInstall(await installShims());
      process.stdout.write(lines.join('\n') + '\n');
      return 0;
    }
    case 'disable': {
      const lines = describeRemove(await removeShims());
      process.stdout.write(lines.join('\n') + '\n');
      return 0;
    }
    case 'doctor': {
      const onPath = shimDirOnPath();
      const lines = [`shim dir: ${shimDir}`, `on PATH: ${onPath ? 'yes' : 'no'}`];
      for (const name of adapterNames) {
        const shimmed = existsSync(join(shimDir, name)) || existsSync(join(shimDir, `${name}.cmd`));
        lines.push(`${name}: shim ${shimmed ? 'installed' : 'missing'}, real binary ${findRealBinary(name) ?? 'not found'}`);
      }
      if (!onPath) lines.push(`fix: ${pathHint()}`);
      process.stdout.write(lines.join('\n') + '\n');
      return 0;
    }
    case 'hotkey': {
      const { code, message } = await runHotkeyCommand(parsed.spec, configFile, parsed.list);
      (code ? process.stderr : process.stdout).write(message + '\n');
      return code;
    }
    case 'run': {
      const adapter = getAdapter(parsed.agent);
      if (!adapter) throw new Error(`unknown agent "${parsed.agent}". Supported: ${adapterNames.join(', ')}`);
      return runApp({ adapter, args: parsed.args, record: parsed.record });
    }
  }
}
