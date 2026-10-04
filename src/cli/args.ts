import { UserError } from '../errors.js';

export const SHELF_ACTIONS = ['new', 'rename', 'rm', 'star'] as const;
export type ShelfAction = (typeof SHELF_ACTIONS)[number];
const SHELF_USAGE = 'usage: stash shelf new <name> | rename <old> <new> | star <name> | rm <name> [--force]';

/** Which prompts a command works on: the stash (this repo, or --all), or one shelf. */
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
  | { kind: 'statusline' }
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
    if (!allowed.includes(a as Flag)) throw new UserError(`stash ${command} doesn't take ${a}`, 2);
    if (a === '--all') flags.all = true;
    else if (a === '--force') flags.force = true;
    else {
      const name = args[++i];
      if (!name) throw new UserError('--shelf needs a shelf name', 2);
      flags.shelf = name;
    }
  }
  return { ...flags, positional };
}

const view = ({ all, shelf }: { all: boolean; shelf?: string | undefined }): View => ({ all, ...(shelf ? { shelf } : {}) });

/** The command line as a command. Anything that isn't a command is an agent to run, with its own args. */
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
  switch (first) {
    case 'list':
      return { kind: 'list', ...view(parseFlags(first, args, ['--all', '--shelf'])) };
    case 'add': {
      const { positional, shelf } = parseFlags(first, args, ['--shelf']);
      return { kind: 'add', text: positional.join(' '), ...(shelf ? { shelf } : {}) };
    }
    case 'rm': {
      const flags = parseFlags(first, args, ['--all', '--shelf']);
      return { kind: 'rm', ref: flags.positional[0] ?? '', ...view(flags) };
    }
    case 'pop': {
      const { positional, all } = parseFlags(first, args, ['--all']);
      return { kind: 'pop', ref: positional[0], all };
    }
    case 'shelves':
      return { kind: 'shelves' };
    case 'shelf': {
      const { positional, force } = parseFlags(first, args, ['--force']);
      const [action, ...names] = positional;
      if (!SHELF_ACTIONS.includes(action as ShelfAction)) throw new UserError(SHELF_USAGE, 2);
      return { kind: 'shelf', action: action as ShelfAction, names, force };
    }
    case 'enable':
    case 'disable':
    case 'doctor':
    case 'statusline':
      return { kind: first };
    case 'hotkey':
      return args[0] === 'list' ? { kind: 'hotkey', list: true, spec: args[1] } : { kind: 'hotkey', list: false, spec: args[0] };
    default:
      return { kind: 'run', agent: first, args, record };
  }
}
