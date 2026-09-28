import { spawn } from 'node:child_process';
import { constants as osConstants } from 'node:os';
import { isCmdScript } from './binaries.js';

/** Runs `command` attached to this terminal, without prompt-shelf in between (STASH_OFF=1). */
export function passthrough(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env, shell: isCmdScript(command) });
    // Ctrl+C belongs to the agent; prompt-shelf just waits for it to exit.
    const ignoreSigint = () => {};
    process.on('SIGINT', ignoreSigint);
    child.on('error', (err) => {
      process.off('SIGINT', ignoreSigint);
      reject(err);
    });
    child.on('exit', (code, signal) => {
      process.off('SIGINT', ignoreSigint);
      resolve(code ?? (signal ? 128 + (osConstants.signals[signal] ?? 0) : 0));
    });
  });
}
