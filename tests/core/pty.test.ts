import { describe, it, expect } from 'vitest';
import { spawnAgent } from '../../src/core/pty.js';

const unix = process.platform !== 'win32';

describe.skipIf(!unix)('spawnAgent', () => {
  it('forwards input to the child and output back, and reports exit', async () => {
    const pty = spawnAgent({ command: 'cat', args: [], cols: 40, rows: 10, cwd: process.cwd(), env: process.env });
    let out = '';
    pty.onData((d) => (out += d));
    const exit = new Promise<number>((r) => pty.onExit(r));
    pty.write('ping\r');
    await new Promise((r) => setTimeout(r, 200));
    expect(out).toContain('ping');
    pty.write('\x04');
    expect(await exit).toBe(0);
  });

  it('propagates resize to the child', async () => {
    const pty = spawnAgent({ command: 'sh', args: ['-c', 'sleep 0.3; stty size'], cols: 40, rows: 10, cwd: process.cwd(), env: process.env });
    let out = '';
    pty.onData((d) => (out += d));
    pty.resize(100, 30);
    await new Promise<number>((r) => pty.onExit(r));
    expect(out).toContain('30 100');
  });

  it('reports 128+N when the child dies from a signal', async () => {
    const pty = spawnAgent({ command: 'sh', args: ['-c', 'kill -TERM $$'], cols: 40, rows: 10, cwd: process.cwd(), env: process.env });
    expect(await new Promise<number>((r) => pty.onExit(r))).toBe(143);
  });
});
