const CTRL_F = '\x06';
const CTRL_Q = '\x11';
const PICKER_OPEN = /Save to:/;
const LIST_OPEN = /switch list/;
// Claude's working line, e.g. "✽ Cooking… (3s · esc to interrupt)".
const WORKING = /^\s*\S [A-Z][a-z]+…/m;
const TASK = 'read src/upload.js and explain the retry logic step by step';

// The problem and the fix, nothing else: a half-written prompt, Claude needing steering now,
// Ctrl+F to park the draft, steer, Ctrl+Q to bring the draft back.
export default {
  command: '/opt/homebrew/bin/stash',
  args: ['claude', '--model', 'haiku'],
  cols: 100,
  rows: 26,
  steps: [
    { waitFor: /❯/, timeout: 20000 },
    { wait: 500 },
    { caption: 'Claude is working on a task.' },
    { type: TASK, speed: 18 },
    { key: '\r', expect: /retry logic step by step/ },
    { waitFor: WORKING, timeout: 20000 },
    { caption: ['You are halfway through your next prompt...', '...and Claude needs steering right now.'] },
    { type: 'now add a unit test for the retry path with a fake fetch', speed: 22 },
    { wait: 300 },
    { caption: ['Ctrl+F parks the draft.', 'The box is free.'] },
    { wait: 500 },
    { key: CTRL_F },
    { waitFor: PICKER_OPEN, timeout: 5000 },
    { wait: 500 },
    { key: '\r', expect: PICKER_OPEN },
    { waitFor: PICKER_OPEN, gone: true, timeout: 5000 },
    { wait: 500 },
    { caption: 'Steer Claude.' },
    { type: 'keep it short, 3 bullets max', speed: 22 },
    { key: '\r', expect: /3 bullets max/ },
    { wait: 1500 },
    { waitFor: WORKING, gone: true, timeout: 90000 },
    { wait: 800 },
    { caption: ['Ctrl+Q brings your draft back.', 'Nothing retyped, nothing lost.'] },
    { wait: 500 },
    { key: CTRL_Q },
    { waitFor: LIST_OPEN, timeout: 5000 },
    { wait: 900 },
    { key: '\r', expect: LIST_OPEN },
    { waitFor: LIST_OPEN, gone: true, timeout: 5000 },
    { wait: 1500 },
    { caption: ['npm i -g prompt-shelf', 'Works in Claude Code and Codex.'] },
    { wait: 600 },
  ],
};
