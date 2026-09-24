const CTRL_F = '\x06';
const CTRL_Q = '\x11';
const LIST_OPEN = /stash · /;
const WORKING = /esc to interrupt/i;
const TASK = 'read src/upload.js and explain the retry logic step by step';

export default {
  command: '/opt/homebrew/bin/stash',
  args: ['claude', '--model', 'haiku'],
  cols: 100,
  rows: 26,
  steps: [
    { waitFor: /❯/, timeout: 20000 },
    { wait: 800 },
    { caption: 'Give Claude a task.' },
    { type: TASK, speed: 30 },
    { wait: 400 },
    { key: '\r', expect: /retry logic step by step/ },
    { waitFor: WORKING, timeout: 20000 },
    { caption: ["While Claude works, you start typing your next prompt...", ''] },
    { wait: 600 },
    { type: 'now add a unit test for the retry path with a fake fetch', speed: 34 },
    { wait: 500 },
    { caption: ['You see where it is going and want to steer it now.', 'Ctrl+F parks your draft. The box is free.'] },
    { wait: 1200 },
    { key: CTRL_F },
    { wait: 1200 },
    { caption: ['Ask or steer, and send it.', 'Your draft stays safe on the shelf.'] },
    { type: 'keep it short, 3 bullets max', speed: 34 },
    { wait: 500 },
    { key: '\r', expect: /3 bullets max/ },
    { waitFor: WORKING, gone: true, timeout: 90000 },
    { wait: 1500 },
    { caption: ['Ctrl+Q brings the draft back when you are ready.', 'Pick it and press Enter.'] },
    { wait: 1200 },
    { key: CTRL_Q },
    { wait: 1500 },
    { key: '\r', expect: LIST_OPEN },
    { wait: 2000 },
    { caption: ['npm i -g prompt-shelf', 'Ctrl+F to park a prompt, Ctrl+Q to bring it back.'] },
    { wait: 800 },
  ],
};
