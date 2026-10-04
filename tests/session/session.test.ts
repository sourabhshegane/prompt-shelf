import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { claudeAdapter } from '../../src/adapters/claude.js';
import { Display } from '../../src/session/display.js';
import { Session } from '../../src/session/session.js';
import { Shelves } from '../../src/storage/shelf-store.js';
import { Store } from '../../src/storage/prompt-store.js';
import { parseHotkey } from '../../src/terminal/keys.js';
import { Screen } from '../../src/terminal/screen.js';
import { BACKSPACE, END_KEY, PASTE_END, PASTE_START } from '../../src/terminal/sequences.js';
import { stripAnsi } from '../../src/terminal/text.js';

// The whole session with only the processes faked: a real screen mirror, real stores in a temp
// folder, the real Claude adapter, and the hotkeys' actual bytes.

const CTRL_F = Buffer.from([0x06]);
const CTRL_Q = Buffer.from([0x11]);
const ENTER = Buffer.from('\r');
const rule = '─'.repeat(60);
// Claude's input box, with the cursor at the end of `draft`.
const claudeBox = (draft: string) => `\x1b[2J\x1b[H welcome\r\n\r\n${rule}\r\n❯ ${draft}\r\n${rule}\x1b[4;${3 + draft.length}H`;

let dir: string;
let store: Store;
let session: Session;
let typed: string;
let shown: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'session-'));
  store = new Store(join(dir, 'stash.jsonl'));
  typed = '';
  shown = '';
  const screen = new Screen(80, 24);
  const adapter = { ...claudeAdapter, skills: () => [] };
  session = new Session({
    adapter,
    ctx: { store, shelves: new Shelves(join(dir, 'shelves.json')), agent: 'claude', cwd: dir, skillPrompt: adapter.skillPrompt },
    pty: { write: (data) => (typed += data) },
    screen,
    display: new Display({ write: (data) => (shown += data), columns: 80, rows: 24 }, screen, adapter),
    keys: { save: parseHotkey('ctrl+f'), list: parseHotkey('ctrl+q') },
  });
});

afterEach(() => session.dispose());

const press = async (key: Buffer) => {
  session.userInput(key);
  await session.idle();
};

describe('Session', () => {
  it('passes typing straight to the agent', async () => {
    await press(Buffer.from('hello'));
    expect(typed).toBe('hello');
  });

  it('saves the draft on the save key and Enter, then erases it from the box', async () => {
    session.agentOutput(claudeBox('fix the build'));
    await press(CTRL_F);
    expect(stripAnsi(shown)).toContain('Save to:');
    await press(ENTER);
    expect((await store.list()).map((p) => p.text)).toEqual(['fix the build']);
    expect(typed).toBe(END_KEY + BACKSPACE.repeat('fix the build'.length));
    expect(stripAnsi(shown)).toContain('stashed (1)');
  });

  it('brings a draft back on the list key and Enter, as a paste, and removes it from the stash', async () => {
    await store.add({ text: 'later\nplease', agent: 'claude', cwd: dir });
    session.agentOutput(claudeBox(''));
    await press(CTRL_Q);
    expect(stripAnsi(shown)).toContain('later ⏎ please');
    await press(ENTER);
    expect(typed).toBe(`${PASTE_START}later\rplease${PASTE_END}`);
    expect(await store.list()).toEqual([]);
  });

  it('puts a picked prompt on a new line after text already in the box', async () => {
    await store.add({ text: 'second part', agent: 'claude', cwd: dir });
    session.agentOutput(claudeBox('first part'));
    await press(CTRL_Q);
    await press(ENTER);
    expect(typed).toBe(`${PASTE_START}\rsecond part${PASTE_END}`);
  });

  it('says so when there is nothing to save, and opens nothing', async () => {
    session.agentOutput(claudeBox(''));
    await press(CTRL_F);
    expect(stripAnsi(shown)).toContain('nothing to stash');
    await press(Buffer.from('x'));
    expect(typed).toBe('x');
  });

  it('closes the list on either hotkey and gives keys back to the agent', async () => {
    session.agentOutput(claudeBox(''));
    await press(CTRL_Q);
    await press(Buffer.from('j'));
    expect(typed).toBe('');
    await press(CTRL_F);
    await press(Buffer.from('j'));
    expect(typed).toBe('j');
  });
});

describe('Session start-up notice', () => {
  const afterWelcome = async () => {
    await new Promise((r) => setTimeout(r, 700));
    await session.idle();
  };

  it('says prompt-shelf is on, with its keys and the drafts parked in this repo', async () => {
    await store.add({ text: 'a draft', agent: 'claude', cwd: dir });
    session.agentOutput(claudeBox(''));
    await afterWelcome();
    expect(stripAnsi(shown)).toContain('prompt-shelf on · ctrl+f park · ctrl+q list · 1 draft parked here');
  });

  it('shows once, and not at all before the input box is drawn', async () => {
    session.agentOutput('\x1b[2J\x1b[H loading');
    await afterWelcome();
    expect(stripAnsi(shown)).not.toContain('prompt-shelf on');
    session.agentOutput(claudeBox(''));
    session.agentOutput(claudeBox(''));
    await afterWelcome();
    expect(stripAnsi(shown).split('prompt-shelf on').length - 1).toBe(1);
  });

  it('stays quiet when a panel is already open', async () => {
    session.agentOutput(claudeBox(''));
    await press(CTRL_Q);
    await afterWelcome();
    expect(stripAnsi(shown)).not.toContain('prompt-shelf on');
  });
});
