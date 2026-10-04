const CTRL_F = '\x06';
const CTRL_Q = '\x11';
const ENTER = '\r';
const ESC = '\x1b';
const RIGHT = '\x1b[C';
const LEFT = '\x1b[D';
const PICKER_OPEN = /Save to:/;
const LIST_OPEN = /switch list/;

// One story, start to end: halfway through a prompt you need to ask something else, Ctrl+F parks
// the draft, you ask, Ctrl+Q brings the draft back; then a glance at skills and a shelf.
// Every result gets a `hold`, so a viewer sees what each key did before the next one.
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
    { type: 'make upload.js retry with exponential backoff and', speed: 30 },
    { hold: 1200 },

    { caption: ['2  ...you need to ask something else.', 'Ctrl+F parks the draft.'] },
    { hold: 1500 },
    { key: CTRL_F, label: 'Ctrl+F' },
    { waitFor: PICKER_OPEN, timeout: 5000 },
    { hold: 1500 },
    { key: ENTER, label: 'Enter', expect: PICKER_OPEN },
    { waitFor: PICKER_OPEN, gone: true, timeout: 5000 },
    { wait: 300 },
    { hold: 2500 },

    { caption: '3  Ask it.' },
    { type: 'how many times does upload.js retry? one line', speed: 28 },
    { hold: 600 },
    { key: ENTER, label: 'Enter', expect: /one line/ },
    { fastForward: true },
    { waitFor: /· done \d/, timeout: 90000 },
    { fastForward: false },
    { hold: 2000 },

    { caption: ['4  Ctrl+Q brings the draft back.', 'Enter puts it in the box.'] },
    { hold: 1500 },
    { key: CTRL_Q, label: 'Ctrl+Q' },
    { waitFor: LIST_OPEN, timeout: 5000 },
    { wait: 300 },
    { hold: 2500 },
    { key: ENTER, label: 'Enter', expect: LIST_OPEN },
    { waitFor: LIST_OPEN, gone: true, timeout: 5000 },
    { wait: 300 },
    { hold: 2500 },

    { caption: ['5  Same list: your skills,', 'and prompts you save to reuse.'] },
    { hold: 1200 },
    { key: CTRL_Q, label: 'Ctrl+Q' },
    { waitFor: LIST_OPEN, timeout: 5000 },
    { hold: 1000 },
    { key: RIGHT, label: '→' },
    { waitFor: /Skills — /, timeout: 3000 },
    { wait: 300 },
    { hold: 2500 },
    { key: LEFT, label: '←' },
    { wait: 300 },
    { key: LEFT, label: '←' },
    { waitFor: /Common — /, timeout: 3000 },
    { wait: 300 },
    { hold: 2500 },
    { key: ESC, label: 'Esc', expect: LIST_OPEN },
    { waitFor: LIST_OPEN, gone: true, timeout: 5000 },
    { wait: 300 },

    { caption: ['npm i -g prompt-shelf', 'For Claude Code and Codex.'] },
    { hold: 1500 },
  ],
};
