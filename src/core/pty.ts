import { accessSync, chmodSync, constants, existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import * as nodePty from 'node-pty';

// node-pty ships its macOS spawn helper without the executable bit, and newer npm versions
// may skip the postinstall script that used to fix it. Fix it here, before the first spawn.
let helperChecked = false;
export function ensureSpawnHelperExecutable(): void {
  if (helperChecked || process.platform === 'win32') return;
  helperChecked = true;
  try {
    const prebuilds = join(dirname(createRequire(import.meta.url).resolve('node-pty/package.json')), 'prebuilds');
    if (!existsSync(prebuilds)) return;
    for (const entry of readdirSync(prebuilds)) {
      const helper = join(prebuilds, entry, 'spawn-helper');
      if (!existsSync(helper)) continue;
      try {
        accessSync(helper, constants.X_OK);
      } catch {
        chmodSync(helper, 0o755);
      }
    }
  } catch {}
}

export interface AgentPty {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  onData(cb: (data: string) => void): void;
  onExit(cb: (code: number) => void): void;
  kill(): void;
}

export function spawnAgent(opts: {
  command: string;
  args: string[];
  cols: number;
  rows: number;
  cwd: string;
  env: NodeJS.ProcessEnv;
}): AgentPty {
  ensureSpawnHelperExecutable();
  const child = nodePty.spawn(opts.command, opts.args, {
    name: process.env.TERM ?? 'xterm-256color',
    cols: opts.cols,
    rows: opts.rows,
    cwd: opts.cwd,
    env: opts.env as Record<string, string>,
  });
  return {
    write: (data) => child.write(data),
    resize: (cols, rows) => child.resize(cols, rows),
    onData: (cb) => void child.onData(cb),
    onExit: (cb) => void child.onExit(({ exitCode, signal }) => cb(signal ? 128 + signal : exitCode)),
    kill: () => child.kill(),
  };
}
