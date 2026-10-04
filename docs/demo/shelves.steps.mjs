const CTRL_F = '\x06';
const CTRL_Q = '\x11';
const RIGHT = '\x1b[C';
const PICKER_OPEN = /Save to:/;
const LIST_OPEN = /switch list/;
const PROMPT = 'review my staged changes for bugs, missing tests and unclear names';

// Run with PROMPT_SHELF_DIR pointing at a fresh folder, so the shelves are the defaults
// (Ideas, To explore, Common) and Common is the third choice in the picker.
export default {
  command: '/opt/homebrew/bin/stash',
  args: ['claude', '--model', 'haiku'],
  cols: 100,
  rows: 26,
  steps: [
    { waitFor: /❯/, timeout: 20000 },
    { wait: 800 },
    { caption: ['A prompt you type again and again?', 'Keep it on a shelf.'] },
    { type: PROMPT, speed: 28 },
    { wait: 600 },
    { caption: ['Ctrl+F, pick a shelf with ←→, Enter.', 'It is saved, and the box is clear again.'] },
    { wait: 800 },
    { key: CTRL_F },
    { waitFor: PICKER_OPEN, timeout: 5000 },
    { wait: 700 },
    { key: RIGHT },
    { wait: 500 },
    { key: RIGHT },
    { wait: 500 },
    { key: RIGHT },
    { wait: 900 },
    { key: '\r', expect: /Common/ },
    { waitFor: PICKER_OPEN, gone: true, timeout: 5000 },
    { wait: 1800 },
    { caption: ['Any day, any repo: Ctrl+Q, open the shelf,', 'Enter puts it in the box. It stays on the shelf.'] },
    { wait: 800 },
    { key: CTRL_Q },
    { waitFor: LIST_OPEN, timeout: 5000 },
    { wait: 900 },
    { key: '\x1b[D' },
    { wait: 700 },
    { waitFor: /Common — saved prompts/, timeout: 3000 },
    { wait: 1200 },
    { key: '\r', expect: /Common — saved prompts/ },
    { waitFor: LIST_OPEN, gone: true, timeout: 5000 },
    { wait: 2200 },
    { caption: ['npm i -g prompt-shelf', 'Your best prompts, one keypress away.'] },
    { wait: 800 },
  ],
};
