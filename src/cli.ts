import { createRequire } from 'node:module';
import { adapterNames, getAdapter, reservedBy } from './adapters/index.js';
import { configFile, loadConfig, saveConfig, shelvesFile, stashFile } from './config.js';
import { parseHotkey } from './core/keys.js';
import { scoped, type Scope } from './core/scope.js';
import { Store, isStashDraft, onShelf, type Prompt } from './core/store.js';
import { Shelves, withOrphans } from './core/shelves.js';
import { localTime } from './core/time.js';
import { runApp } from './app.js';
import { describeInstall, describeRemove, findRealBinary, installShims, pathHint, removeShims, shimDir, shimDirOnPath } from './shims.js';
import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';

const { version } = createRequire(import.meta.url)('../package.json') as { version: string };

/** Which prompts a command works on: the stash (this repo, or --all), or one shelf. */
const SHELF_ACTIONS = ['new', 'rename', 'rm', 'star'] as const;
type ShelfAction = (typeof SHELF_ACTIONS)[number];
const SHELF_USAGE = 'usage: stash shelf new <name> | rename <old> <new> | star <name> | rm <name> [--force]';

export interface View {
  all: boolean;
  shelf?: string;
}

export type ParsedArgs =
  | { kind: 'run'; agent: string; args: string[]; record: boolean }
  | ({ kind: 'list' } & View)
  | { kind: 'add'; text: string; shelf?: string }
  | ({ kind: 'rm'; ref: string } & View)
  | { kind: 'pop'; ref: string | undefined; all: boolean }
  | { kind: 'shelves' }
  | { kind: 'shelf'; action: ShelfAction; names: string[]; force: boolean }
  | { kind: 'enable' }
  | { kind: 'disable' }
  | { kind: 'doctor' }
  | { kind: 'hotkey'; list: boolean; spec: string | undefined }
  | { kind: 'help' }
  | { kind: 'version' };

type Flag = '--all' | '--shelf' | '--force';

// Each command's own flags; anything else starting with `--` is an error rather than silently ignored.
function parseFlags(command: string, args: string[], allowed: Flag[]) {
  const flags = { all: false, force: false, shelf: undefined as string | undefined };
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (!a.startsWith('--')) {
      positional.push(a);
      continue;
    }
    if (!allowed.includes(a as Flag)) throw new Error(`stash ${command} doesn't take ${a}`);
    if (a === '--all') flags.all = true;
    else if (a === '--force') flags.force = true;
    else {
      const name = args[++i];
      if (!name) throw new Error('--shelf needs a shelf name');
      flags.shelf = name;
    }
  }
  return { ...flags, positional };
}

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
  const view = ({ all, shelf }: { all: boolean; shelf?: string }): View => ({ all, ...(shelf ? { shelf } : {}) });
  if (first === 'list') return { kind: 'list', ...view(parseFlags(first, args, ['--all', '--shelf'])) };
  if (first === 'add') {
    const { positional, shelf } = parseFlags(first, args, ['--shelf']);
    return { kind: 'add', text: positional.join(' '), ...(shelf ? { shelf } : {}) };
  }
  if (first === 'rm') {
    const flags = parseFlags(first, args, ['--all', '--shelf']);
    return { kind: 'rm', ref: flags.positional[0] ?? '', ...view(flags) };
  }
  if (first === 'pop') {
    const { positional, all } = parseFlags(first, args, ['--all']);
    return { kind: 'pop', ref: positional[0], all };
  }
  if (first === 'shelves') return { kind: 'shelves' };
  if (first === 'shelf') {
    const { positional, force } = parseFlags(first, args, ['--force']);
    const [action, ...names] = positional;
    if (!SHELF_ACTIONS.includes(action as ShelfAction)) throw new Error(SHELF_USAGE);
    return { kind: 'shelf', action: action as ShelfAction, names, force };
  }
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

Shelves (named lists of prompts you reuse; using one keeps it):
  stash shelves                   list your shelves (starred first)
  stash shelf new <name>          create a shelf
  stash shelf star <name>         star or unstar a shelf; starred shelves come first
  stash shelf rename <old> <new>  rename a shelf
  stash shelf rm <name> [--force] delete a shelf (--force also deletes its prompts)
  stash add --shelf <name> <text> save a prompt on a shelf (created if needed)
  stash list --shelf <name>       print the prompts on a shelf
  stash rm <n> --shelf <name>     remove prompt n from a shelf
  stash enable                    install shims so plain ${adapterNames.join(' / ')} run through stash
  stash disable                   remove the shims and the PATH line
  stash doctor                    show shim dir, shims, and real agent binaries
  stash hotkey [key]              show both hotkeys, or set the stash hotkey (ctrl+<letter> or f1..f12), e.g. stash hotkey f2
  stash hotkey list [key]         show or set the list hotkey

Env:
  STASH_OFF=1 <agent>             run the real binary directly (no wrapper)
  STASH_RECORD=1 <agent>          same as stash --record <agent>

Hotkeys:
  ctrl+f  save what is in the box: enter keeps it in the stash, ←→ picks a shelf
  ctrl+q  open the list (stash, skills, shelves); what you pick goes after what you typed
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

export interface ListScope extends Partial<View> {
  all: boolean;
  cwd: string;
}

const scopeOf = ({ all }: ListScope): Scope => (all ? 'all' : 'repo');

const REMOVED_PREVIEW = 60;

const preview = (e: Prompt) => {
  const flat = e.text.replace(/\r?\n/g, ' ⏎ ');
  return [...flat].length > REMOVED_PREVIEW ? [...flat].slice(0, REMOVED_PREVIEW).join('') + '…' : flat;
};

export const describeRemoved = (e: Prompt): string =>
  `removed: [${e.shelf ? `shelf ${e.shelf}` : `${e.agent} · ${basename(e.cwd)}`}] ${preview(e)}`;

const formatEntry = (e: Prompt, i: number) => {
  const text = e.text.replace(/\r?\n/g, ' ⏎ ');
  if (e.shelf === undefined) return `${i + 1}. [${e.agent} · ${e.cwd}] ${text}`;
  const used = e.usedCount ? `used ${e.usedCount}×, last ${localTime(e.lastUsedAt)}` : 'not used yet';
  return `${i + 1}. ${text}\n   saved ${localTime(e.createdAt)} · ${used}`;
};

/** The entries a listing shows, newest first: one shelf, or the stash for this repo / all repos. */
export function viewEntries(entries: Prompt[], scope: ListScope): Prompt[] {
  if (scope.shelf) return entries.filter(onShelf(scope.shelf));
  return scoped(entries.filter(isStashDraft), scopeOf(scope), scope.cwd);
}

export function listLines(entries: Prompt[], scope: ListScope): string[] {
  const shown = viewEntries(entries, scope);
  const lines = shown.map(formatEntry);
  if (!scope.shelf) {
    const hidden = entries.filter(isStashDraft).length - shown.length;
    if (hidden > 0) lines.push(`${hidden} more in other repos — stash list --all`);
  }
  return lines;
}

export function resolveRef(entries: Prompt[], ref: string | undefined, scope: ListScope): Prompt {
  const shown = viewEntries(entries, scope);
  const n = Number.parseInt(ref ?? '1', 10);
  if (!Number.isInteger(n) || n < 1 || n > shown.length) throw new Error(`no entry ${ref ?? '1'} (have ${shown.length})`);
  return shown[n - 1]!;
}

// A shelf by name, case-insensitively: one in the shelf file, or one that prompts still point at.
async function requireShelf(shelves: Shelves, store: Store, name: string): Promise<{ name: string; saved: boolean }> {
  const saved = await shelves.find(name);
  if (saved) return { name: saved, saved: true };
  const orphan = withOrphans([], await store.list()).find((n) => n.toLowerCase() === name.trim().toLowerCase());
  if (orphan) return { name: orphan, saved: false };
  throw new Error(`no shelf named "${name}" — stash shelves lists them`);
}

export async function runShelfCommand(
  cmd: { action: ShelfAction; names: string[]; force: boolean },
  shelves: Shelves,
  store: Store,
): Promise<number> {
  const [first, second] = cmd.names;
  if (!first) throw new Error(`usage: stash shelf ${cmd.action} <name>${cmd.action === 'rename' ? ' <new name>' : ''}`);
  if (cmd.action === 'new') {
    process.stderr.write(`shelf ${await shelves.create(first)} is ready\n`);
    return 0;
  }
  const current = await requireShelf(shelves, store, first);
  if (cmd.action === 'star') {
    if (!current.saved) await shelves.create(current.name);
    process.stderr.write(`${(await shelves.toggleStar(current.name)) ? 'starred' : 'unstarred'} ${current.name}\n`);
    return 0;
  }
  if (cmd.action === 'rename') {
    if (!second) throw new Error('usage: stash shelf rename <old> <new>');
    const renamed = current.saved ? await shelves.rename(current.name, second) : await shelves.create(second);
    await store.reshelve(current.name, renamed);
    process.stderr.write(`renamed ${current.name} to ${renamed}\n`);
    return 0;
  }
  const count = (await store.list()).filter(onShelf(current.name)).length;
  if (count && !cmd.force) throw new Error(`shelf ${current.name} has ${count} prompt${count === 1 ? '' : 's'}; add --force to delete them too`);
  await store.reshelve(current.name, null);
  if (current.saved) await shelves.remove(current.name);
  process.stderr.write(`deleted shelf ${current.name}${count ? ` and its ${count} prompt${count === 1 ? '' : 's'}` : ''}\n`);
  return 0;
}

export async function main(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv);
  const store = new Store(stashFile);
  const shelves = new Shelves(shelvesFile);
  switch (parsed.kind) {
    case 'help':
      process.stdout.write(help);
      return 0;
    case 'version':
      process.stdout.write(version + '\n');
      return 0;
    case 'list': {
      const shelf = parsed.shelf ? (await requireShelf(shelves, store, parsed.shelf)).name : undefined;
      const lines = listLines(await store.list(), { ...parsed, shelf, cwd: process.cwd() });
      if (lines.length) process.stdout.write(lines.join('\n') + '\n');
      return 0;
    }
    case 'add': {
      if (!parsed.text) throw new Error('nothing to add');
      const shelf = parsed.shelf ? await shelves.create(parsed.shelf) : undefined;
      await store.add({ text: parsed.text, agent: 'cli', cwd: process.cwd(), ...(shelf ? { shelf } : {}) });
      if (shelf) process.stderr.write(`saved on shelf ${shelf}\n`);
      return 0;
    }
    case 'pop': {
      const entry = resolveRef(await store.list(), parsed.ref, { all: parsed.all, cwd: process.cwd() });
      process.stdout.write(entry.text + '\n');
      await store.remove(entry.id);
      process.stderr.write(describeRemoved(entry) + '\n');
      return 0;
    }
    case 'rm': {
      const shelf = parsed.shelf ? (await requireShelf(shelves, store, parsed.shelf)).name : undefined;
      const entry = resolveRef(await store.list(), parsed.ref, { ...parsed, shelf, cwd: process.cwd() });
      await store.remove(entry.id);
      process.stderr.write(describeRemoved(entry) + '\n');
      return 0;
    }
    case 'shelves': {
      const entries = await store.list();
      const starred = await shelves.starred();
      const lines = withOrphans(await shelves.list(), entries).map((name) => `${starred.includes(name) ? '★ ' : '  '}${name} (${entries.filter(onShelf(name)).length})`);
      process.stdout.write(lines.length ? lines.join('\n') + '\n' : 'no shelves yet — stash shelf new <name>\n');
      return 0;
    }
    case 'shelf':
      return runShelfCommand(parsed, shelves, store);
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
