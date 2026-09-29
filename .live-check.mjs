import pty from 'node-pty';
import { readFileSync, existsSync } from 'node:fs';
const dir = process.env.PROMPT_SHELF_DIR;
const p = pty.spawn('node', ['bin/stash.js', 'claude'], { cols: 110, rows: 32, cwd: process.cwd(), env: process.env });
let out = ''; p.onData((d) => (out += d));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const step = async (keys, ms = 1200) => { p.write(keys); await wait(ms); };
await wait(9000);
await step('first live draft');
await step('\x06');               // ctrl+f -> picker
const picker = out.slice(-3000).includes('Save to');
await step('\r', 1500);            // stash it
const stored = existsSync(dir + '/stash.jsonl') ? readFileSync(dir + '/stash.jsonl', 'utf8') : '';
await step('\x11', 1500);          // ctrl+q -> list
const list = out.slice(-6000);
await step('\x1b[C');              // → skills tab
const skills = out.slice(-6000);
await step('\x1b[D');
await step('\r', 1500);            // pop back into box
const after = existsSync(dir + '/stash.jsonl') ? readFileSync(dir + '/stash.jsonl', 'utf8') : '';
console.log(JSON.stringify({ picker, stored: stored.includes('first live draft'), listShown: /Stash|stash/.test(list) && list.includes('first live draft'), skillsTab: /skill/i.test(skills), poppedGone: !after.includes('first live draft') }));
p.write('\x03'); await wait(300); p.write('\x03'); await wait(800); p.kill(); process.exit(0);
