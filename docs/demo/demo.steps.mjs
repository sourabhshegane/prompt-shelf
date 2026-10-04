const CTRL_F = '\x06';
const CTRL_Q = '\x11';
const PICKER_OPEN = /Save to:/;
const LIST_OPEN = /switch list/;
const RIGHT = '\x1b[C';
const LEFT = '\x1b[D';

// One story, start to end: halfway through a prompt you need to ask something else, Ctrl+F parks
// the draft, you ask, Ctrl+Q brings the draft back; then a glance at skills and a shelf.
// Seed the data folder with a few prompts on the Common shelf first (see README.md here).
export default {
  command: '/opt/homebrew/bin/stash',
  // The status line is off: Claude only refreshes it on new messages, so it would lag behind.
  args: ['claude', '--model', 'haiku', '--settings', '{"statusLine":{"type":"command","command":"true"}}'],
  cols: 92,
  rows: 24,
  steps: [
    { caption: ['prompt-shelf', 'Park a prompt. Bring it back later.'] },
    { waitFor: /❯/, timeout: 20000 },
    { waitFor: /prompt-shelf on/, timeout: 8000 },
    { waitFor: /prompt-shelf on/, gone: true, timeout: 12000 },
    { caption: '1  Halfway through a prompt...' },
    { type: 'make upload.js retry with exponential backoff and', speed: 20 },
    { wait: 400 },
    { caption: ['2  ...you need to ask something else.', 'Ctrl+F parks the draft.'] },
    { wait: 600 },
    { key: CTRL_F },
    { waitFor: PICKER_OPEN, timeout: 5000 },
    { wait: 400 },
    { key: '\r', expect: PICKER_OPEN },
    { waitFor: PICKER_OPEN, gone: true, timeout: 5000 },
    { wait: 900 },
    { caption: '3  Ask it.' },
    { type: 'how many times does upload.js retry? one line', speed: 22 },
    { key: '\r', expect: /one line/ },
    { fastForward: true },
    { waitFor: /· done \d/, timeout: 90000 },
    { fastForward: false },
    { wait: 1200 },
    { caption: ['4  Ctrl+Q brings the draft back.', 'Enter puts it in the box.'] },
    { wait: 500 },
    { key: CTRL_Q },
    { waitFor: LIST_OPEN, timeout: 5000 },
    { wait: 1500 },
    { key: '\r', expect: LIST_OPEN },
    { waitFor: LIST_OPEN, gone: true, timeout: 5000 },
    { wait: 1200 },
    { caption: ['5  Same list: your skills,', 'and prompts you save to reuse.'] },
    { key: CTRL_Q },
    { waitFor: LIST_OPEN, timeout: 5000 },
    { wait: 500 },
    { key: RIGHT },
    { waitFor: /Skills — /, timeout: 3000 },
    { wait: 1600 },
    { key: LEFT },
    { wait: 300 },
    { key: LEFT },
    { waitFor: /Common — /, timeout: 3000 },
    { wait: 1800 },
    { key: '\x1b', expect: LIST_OPEN },
    { waitFor: LIST_OPEN, gone: true, timeout: 5000 },
    { wait: 400 },
    { caption: ['npm i -g prompt-shelf', 'For Claude Code and Codex.'] },
    { wait: 600 },
  ],
};
