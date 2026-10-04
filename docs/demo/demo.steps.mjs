const CTRL_F = '\x06';
const CTRL_Q = '\x11';
const ENTER = '\r';
const ESC = '\x1b';
const LEFT = '\x1b[D';
const PICKER_OPEN = /Save to:/;
const LIST_OPEN = /switch list/;

// The whole idea in under 20 seconds, in a small terminal so the input box is the picture: a
// half-written prompt, Ctrl+F parks it and the box is free, Ctrl+Q brings it back; then a list
// of saved prompts. Nothing is sent to the model.
// 16 rows puts the list (11 rows) right on top of the input box. Seed a few older drafts and
// saved prompts first (docs/demo/seed.sh) so the list is full, not a few lines and a gap.
export default {
  command: '/opt/homebrew/bin/stash',
  // The status line is off: Claude only refreshes it on new messages, so it would lag behind.
  args: ['claude', '--model', 'haiku', '--settings', '{"statusLine":{"type":"command","command":"true"}}'],
  cols: 80,
  rows: 16,
  steps: [
    { waitFor: /❯/, timeout: 20000 },
    { waitFor: /prompt-shelf on/, timeout: 8000 },
    { waitFor: /prompt-shelf on/, gone: true, timeout: 12000 },
    { trimStart: true },

    { caption: ['Halfway through a prompt...', '...and Claude needs something else first?'] },
    { type: 'add retries with backoff to upload.js, and', speed: 28 },
    { hold: 500 },

    { caption: ['Ctrl+F parks it.', 'The box is clear again.'] },
    { key: CTRL_F, label: 'Ctrl+F' },
    { waitFor: PICKER_OPEN, timeout: 5000 },
    { hold: 700 },
    { key: ENTER, label: 'Enter', expect: PICKER_OPEN },
    { waitFor: PICKER_OPEN, gone: true, timeout: 5000 },
    { wait: 300 },
    { hold: 1600 },

    { caption: ['Ctrl+Q brings it back.', 'Pick it, press Enter.'] },
    { key: CTRL_Q, label: 'Ctrl+Q' },
    { waitFor: LIST_OPEN, timeout: 5000 },
    { wait: 300 },
    { hold: 1500 },
    { key: ENTER, label: 'Enter', expect: LIST_OPEN },
    { waitFor: LIST_OPEN, gone: true, timeout: 5000 },
    { wait: 300 },
    { hold: 1500 },

    { caption: ['Prompts you reuse?', 'Keep them in lists, one Enter away.'] },
    { key: CTRL_Q, label: 'Ctrl+Q' },
    { waitFor: LIST_OPEN, timeout: 5000 },
    { hold: 600 },
    { key: LEFT, label: '←' },
    { waitFor: /Common — /, timeout: 3000 },
    { wait: 300 },
    { hold: 2600 },
    { key: ESC, label: 'Esc', expect: LIST_OPEN },
    { waitFor: LIST_OPEN, gone: true, timeout: 5000 },
    { caption: ['npm i -g prompt-shelf', 'For Claude Code and Codex.'] },
  ],
};
