const CTRL_Q = '\x11';
const RIGHT = '\x1b[C';
const LIST_OPEN = /switch list/;

// A quick tour of the list: the stash, the skills Claude can use here, and shelves of reusable
// prompts. Seed the data folder first (see README.md in this folder).
export default {
  command: '/opt/homebrew/bin/stash',
  args: ['claude', '--model', 'haiku'],
  cols: 100,
  rows: 26,
  steps: [
    { waitFor: /❯/, timeout: 20000 },
    { wait: 500 },
    { caption: ['Ctrl+Q opens your lists.', 'First, drafts you parked in this repo.'] },
    { wait: 300 },
    { key: CTRL_Q },
    { waitFor: LIST_OPEN, timeout: 5000 },
    { wait: 1800 },
    { caption: ['Skills: everything Claude can use here.', 'Enter names one in the box.'] },
    { key: RIGHT },
    { waitFor: /Skills — /, timeout: 3000 },
    { wait: 2200 },
    { caption: ['Shelves: prompts you reuse.', 'Make as many as you like.'] },
    { key: RIGHT },
    { waitFor: /Ideas — /, timeout: 3000 },
    { wait: 1200 },
    { key: RIGHT },
    { wait: 500 },
    { key: RIGHT },
    { waitFor: /Common — /, timeout: 3000 },
    { wait: 1500 },
    { caption: ['Enter puts it in the box.', 'It stays on the shelf for next time.'] },
    { key: '\r', expect: /Common — / },
    { waitFor: LIST_OPEN, gone: true, timeout: 5000 },
    { wait: 1800 },
    { caption: ['npm i -g prompt-shelf', 'Ctrl+F to stash, Ctrl+Q for your lists.'] },
    { wait: 600 },
  ],
};
