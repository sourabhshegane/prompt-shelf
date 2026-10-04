import pkg from '../../package.json' with { type: 'json' };
import { adapterNames, getAdapter } from '../adapters/index.js';
import { UserError } from '../errors.js';
import { runApp, SESSION_ENV } from '../session/run.js';
import { loadConfig } from '../storage/config.js';
import { configFile, promptsFile, shelvesFile } from '../storage/paths.js';
import { Store } from '../storage/prompt-store.js';
import { Shelves } from '../storage/shelf-store.js';
import { describeInstall, installShims, removeShims } from '../shims-entry.js';
import { describeRemove } from '../system/shims.js';
import { parseArgs, type ParsedArgs } from './args.js';
import { helpText } from './help.js';
import { describeRemoved, listLines, resolveRef } from './prompt-commands.js';
import { doctorLines, runHotkeyCommand } from './setup-commands.js';
import { requireShelf } from '../storage/shelf-ops.js';
import { runShelfCommand, shelfLines } from './shelf-commands.js';
import { statusCwd, statusText } from './statusline.js';

const { version } = pkg;

const print = (lines: string | string[]) => {
  const text = Array.isArray(lines) ? lines.join('\n') : lines;
  if (text) process.stdout.write(text + '\n');
};
/** All of stdin, or what arrived within half a second (Claude Code pipes a small JSON object). */
const readStdin = () =>
  new Promise<string>((resolve) => {
    let text = '';
    const done = () => {
      process.stdin.destroy();
      resolve(text);
    };
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: string) => (text += chunk));
    process.stdin.on('end', done);
    setTimeout(done, 500).unref();
  });
/** Messages go to stderr, so stdout carries only data (e.g. `stash pop | pbcopy`). */
const tell = (message: string) => process.stderr.write(message + '\n');

/** Runs the command line and returns the exit code. A UserError is shown as is; anything else is a bug and is thrown. */
export async function main(argv: string[]): Promise<number> {
  try {
    return await run(parseArgs(argv));
  } catch (err) {
    if (!(err instanceof UserError)) throw err;
    tell(`prompt-shelf: ${err.message}`);
    return err.exitCode;
  }
}

async function run(cmd: ParsedArgs): Promise<number> {
  const store = new Store(promptsFile);
  const shelves = new Shelves(shelvesFile);
  const cwd = process.cwd();
  const shelfNamed = async (name: string | undefined) => (name ? (await requireShelf(shelves, store, name)).name : undefined);
  switch (cmd.kind) {
    case 'help':
      process.stdout.write(helpText(version));
      return 0;
    case 'version':
      print(version);
      return 0;
    case 'list':
      print(listLines(await store.list(), { ...cmd, shelf: await shelfNamed(cmd.shelf), cwd }));
      return 0;
    case 'add': {
      if (!cmd.text) throw new UserError('nothing to add', 2);
      const shelf = cmd.shelf ? await shelves.create(cmd.shelf) : undefined;
      await store.add({ text: cmd.text, agent: 'cli', cwd, ...(shelf ? { shelf } : {}) });
      if (shelf) tell(`saved on shelf ${shelf}`);
      return 0;
    }
    case 'pop': {
      const prompt = resolveRef(await store.list(), cmd.ref, { all: cmd.all, cwd });
      print(prompt.text);
      await store.remove(prompt.id);
      tell(describeRemoved(prompt));
      return 0;
    }
    case 'rm': {
      const prompt = resolveRef(await store.list(), cmd.ref, { ...cmd, shelf: await shelfNamed(cmd.shelf), cwd });
      await store.remove(prompt.id);
      tell(describeRemoved(prompt));
      return 0;
    }
    case 'shelves': {
      const lines = await shelfLines(shelves, store);
      print(lines.length ? lines : 'no shelves yet — stash shelf new <name>');
      return 0;
    }
    case 'shelf':
      tell(await runShelfCommand(cmd, shelves, store));
      return 0;
    case 'enable':
      print(describeInstall(await installShims()));
      return 0;
    case 'disable':
      print(describeRemove(await removeShims()));
      return 0;
    case 'doctor':
      print(doctorLines(version));
      return 0;
    case 'statusline': {
      const config = await loadConfig();
      const stdin = process.stdin.isTTY ? '' : await readStdin();
      const text = statusText({
        prompts: await store.list(),
        cwd: statusCwd(stdin) ?? cwd,
        inSession: Boolean(process.env[SESSION_ENV]),
        save: config.hotkey,
        list: config.listHotkey,
      });
      if (text) print(text);
      return 0;
    }
    case 'hotkey':
      print(await runHotkeyCommand(cmd.spec, configFile, cmd.list));
      return 0;
    case 'run': {
      const adapter = getAdapter(cmd.agent);
      if (!adapter) throw new UserError(`unknown agent "${cmd.agent}". Supported: ${adapterNames.join(', ')}`, 2);
      return runApp({ adapter, args: cmd.args, record: cmd.record });
    }
  }
}
