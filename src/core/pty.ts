import * as nodePty from 'node-pty';

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
