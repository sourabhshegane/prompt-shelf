// Drives a real agent session through a PTY and writes an asciicast (v2).
// Steps: { wait }, { type, speed }, { key }, { paste }, { caption }, { waitFor, timeout }.
// { waitFor } polls the screen until it matches (or, with `gone: true`, stops matching) and
// aborts after `timeout` ms, so the script follows what the agent really does.
// { caption } writes an asciicast marker; render.mjs shows it under the terminal.
// { key, expect } sends the key only if the screen matches `expect`, otherwise it aborts, so
// an Enter meant for the stash list can never reach the agent's input box.
import { spawn } from 'node-pty';
import xterm from '@xterm/headless';
import { writeFileSync } from 'node:fs';

const [, , scriptPath, outPath] = process.argv;
const { command, args, cols, rows, steps } = (await import(scriptPath)).default;

const mirror = new xterm.Terminal({ cols, rows, allowProposedApi: true, scrollback: 0 });

const events = [];
const start = process.hrtime.bigint();
const at = () => Number(process.hrtime.bigint() - start) / 1e9;
const emit = (data) => events.push([at(), 'o', data]);

// Don't leak the recording host's own Claude Code session into the demo.
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^CLAUDE_?CODE/.test(k)));
const pty = spawn(command, args, { name: 'xterm-256color', cols, rows, cwd: process.env.DEMO_CWD ?? process.cwd(), env });

pty.onData((d) => {
  mirror.write(d);
  emit(d);
});

const screenText = () => {
  const b = mirror.buffer.active;
  return Array.from({ length: rows }, (_, y) => b.getLine(y)?.translateToString(true) ?? '').join('\n');
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const typeText = async (text, perKey = 45) => {
  for (const ch of text) {
    pty.write(ch);
    await sleep(perKey);
  }
};

for (const step of steps) {
  if (step.wait) await sleep(step.wait);
  if (step.caption) events.push([at(), 'm', step.caption]);
  if (step.waitFor) {
    const deadline = Date.now() + (step.timeout ?? 30000);
    while (step.waitFor.test(screenText()) === Boolean(step.gone)) {
      if (Date.now() > deadline) {
        console.error(`aborted: timed out waiting for ${step.gone ? 'the end of ' : ''}${step.waitFor}`);
        pty.kill();
        process.exit(1);
      }
      await sleep(100);
    }
  }
  if (step.type) await typeText(step.type, step.speed);
  if (step.paste) pty.write('\x1b[200~' + step.paste.replace(/\n/g, '\r') + '\x1b[201~');
  if (step.key && step.expect && !step.expect.test(screenText())) {
    console.error(`aborted: screen did not match ${step.expect} before sending ${JSON.stringify(step.key)}`);
    pty.kill();
    process.exit(1);
  }
  if (step.key) pty.write(step.key);
}
await sleep(600);
pty.kill();

const header = { version: 2, width: cols, height: rows, timestamp: Math.floor(Date.now() / 1000), env: { TERM: 'xterm-256color', SHELL: '/bin/zsh' } };
writeFileSync(outPath, [JSON.stringify(header), ...events.map((e) => JSON.stringify(e))].join('\n') + '\n');
console.log(`wrote ${outPath} (${events.length} events, ${at().toFixed(1)}s)`);
