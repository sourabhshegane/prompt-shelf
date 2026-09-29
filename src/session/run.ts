import type { AgentAdapter } from '../adapters/index.js';
import { debug } from '../debug.js';
import { describeError, UserError } from '../errors.js';
import { loadConfig } from '../storage/config.js';
import { promptsFile, shelvesFile, stashDir } from '../storage/paths.js';
import { Store } from '../storage/prompt-store.js';
import { Shelves } from '../storage/shelf-store.js';
import { findRealBinary, isCmdScript, stripShimDir } from '../system/binaries.js';
import { passthrough } from '../system/passthrough.js';
import { ansi } from '../terminal/ansi.js';
import { spawnAgent } from '../terminal/pty.js';
import { Screen } from '../terminal/screen.js';
import { Display } from './display.js';
import { sessionKeys } from './hotkeys.js';
import { recordScreen } from './record.js';
import { Session } from './session.js';

/** `stash <agent>`: runs the agent in a pseudo-terminal with prompt-shelf in between. */
export async function runApp(opts: { adapter: AgentAdapter; args: string[]; record: boolean }): Promise<number> {
  const { adapter } = opts;
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: stripShimDir(process.env.PATH) };
  const real = findRealBinary(adapter.command, env);
  if (!real) throw new UserError(`${adapter.command} not found on PATH (install ${adapter.displayName} first)`);
  if (process.env.STASH_OFF) return passthrough(real, opts.args, env);
  const keys = sessionKeys(await loadConfig(), adapter);
  const command = isCmdScript(real) ? (process.env.comspec ?? 'cmd.exe') : real;
  const args = isCmdScript(real) ? ['/c', real, ...opts.args] : opts.args;
  const record = opts.record || Boolean(process.env.STASH_RECORD);

  const { stdin, stdout } = process;
  const cwd = process.cwd();
  const screen = new Screen(stdout.columns || 80, stdout.rows || 24);
  const display = new Display(stdout, screen, adapter);
  debug('session', 'start', { agent: adapter.name, cols: display.cols, rows: display.rows, record });
  const pty = spawnAgent({ command, args, cols: display.cols, rows: display.rows, cwd, env });
  const session = new Session({
    adapter,
    ctx: { store: new Store(promptsFile), shelves: new Shelves(shelvesFile), agent: adapter.name, cwd, skillPrompt: adapter.skillPrompt },
    pty,
    screen,
    display,
    keys,
    ...(record ? { record: () => recordScreen(screen, stashDir, adapter.name) } : {}),
  });

  // A bug must never take the agent down with it: show it and keep going.
  const onError = (err: unknown) => {
    debug('error', describeError(err), { stack: err instanceof Error ? err.stack : undefined });
    display.toast({ text: `error: ${describeError(err)}`, error: true });
  };
  const guarded =
    <T>(fn: (arg: T) => void) =>
    (arg: T) => {
      try {
        fn(arg);
      } catch (err) {
        onError(err);
      }
    };

  pty.onData(guarded((data: string) => session.agentOutput(data)));
  stdin.setRawMode?.(true);
  stdin.resume();
  stdin.on('data', guarded((chunk: Buffer) => session.userInput(chunk)));
  const onResize = guarded(() => {
    screen.resize(display.cols, display.rows);
    pty.resize(display.cols, display.rows);
    display.redraw();
  });
  stdout.on('resize', onResize);
  process.on('uncaughtException', onError);
  process.on('unhandledRejection', onError);

  return new Promise<number>((resolve) => {
    pty.onExit((code) => {
      session.dispose();
      process.off('uncaughtException', onError);
      process.off('unhandledRejection', onError);
      stdout.off('resize', onResize);
      stdout.write(ansi.saneEpilogue);
      stdin.setRawMode?.(false);
      stdin.pause();
      resolve(code);
    });
  });
}
