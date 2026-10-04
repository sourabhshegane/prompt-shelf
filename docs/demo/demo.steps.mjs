const CTRL_F = '\x06';
const CTRL_Q = '\x11';
const PICKER_OPEN = /Save to:/;
const LIST_OPEN = /switch list/;

// One story, start to end: halfway through a prompt you need to ask something else, Ctrl+F parks
// the draft, you ask, Ctrl+Q brings the draft back.
export default {
  command: '/opt/homebrew/bin/stash',
  // The status line is off: Claude only refreshes it on new messages, so it would lag behind.
  args: ['claude', '--model', 'haiku', '--settings', '{"statusLine":{"type":"command","command":"true"}}'],
  cols: 92,
  rows: 20,
  steps: [
    { caption: ['prompt-shelf', 'Park a half-written prompt, bring it back later.'] },
    { waitFor: /❯/, timeout: 20000 },
    { waitFor: /prompt-shelf on/, timeout: 8000 },
    { waitFor: /prompt-shelf on/, gone: true, timeout: 12000 },
    { caption: '1  You are halfway through a long prompt...' },
    { type: 'refactor src/upload.js so retries back off exponentially, keep the API the same, and', speed: 16 },
    { wait: 400 },
    { caption: ['2  ...but need to ask Claude something else first.', 'Ctrl+F parks the draft. The box is clear.'] },
    { wait: 600 },
    { key: CTRL_F },
    { waitFor: PICKER_OPEN, timeout: 5000 },
    { wait: 400 },
    { key: '\r', expect: PICKER_OPEN },
    { waitFor: PICKER_OPEN, gone: true, timeout: 5000 },
    { wait: 900 },
    { caption: '3  Ask it.' },
    { type: 'how many times does upload.js retry? one line', speed: 20 },
    { key: '\r', expect: /one line/ },
    { fastForward: true },
    { waitFor: /\d+ (times|retries|attempts)/, timeout: 60000 },
    { fastForward: false },
    { wait: 1200 },
    { caption: ['4  Ctrl+Q brings the draft back.', 'Enter puts it in the box, right where you left off.'] },
    { wait: 500 },
    { key: CTRL_Q },
    { waitFor: LIST_OPEN, timeout: 5000 },
    { wait: 900 },
    { key: '\r', expect: LIST_OPEN },
    { waitFor: LIST_OPEN, gone: true, timeout: 5000 },
    { wait: 1200 },
    { caption: ['npm i -g prompt-shelf', 'Works in Claude Code and Codex.'] },
    { wait: 600 },
  ],
};
