import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { constants as osConstants } from 'node:os';
import { join } from 'node:path';
import { loadConfig, shelvesFile, stashDir, stashFile } from './config.js';
import type { AgentAdapter } from './adapters/index.js';
import type { Draft } from './adapters/types.js';
import { overlayEffect, panelData, pickerEffect, type ActionContext, type Effect } from './actions.js';
import { parseHotkey, KeyInterceptor } from './core/keys.js';
import { Screen } from './core/screen.js';
import { spawnAgent } from './core/pty.js';
import { StdinPipeline } from './core/stdin.js';
import { Store } from './core/store.js';
import { Overlay, type SortOrder, type Status, type Tab } from './core/overlay.js';
import { Shelves } from './core/shelves.js';
import { SavePicker } from './core/savepicker.js';
import type { Scope } from './core/scope.js';
import type { Skill } from './core/skills.js';
import { panelPlacement, toastRow, type PanelPlacement } from './core/layout.js';
import { injectPaste } from './core/inject.js';
import { PasteLabels, PasteRecorder, PasteTracker } from './core/pastes.js';
import { ansi, theme } from './core/terminal.js';
import { fitLine } from './core/ui.js';
import { findRealBinary, stripShimDir } from './shims.js';

const TOAST_MS = 3000;
const ESC_FLUSH_MS = 25;
// How often the screen is checked for a paste's placeholder while pastes are waiting.
const PASTE_CHECK_MS = 100;
const TOAST_REDRAW_MS = 80;
// The save picker: the places row, the draft, and the key hints.
const PICKER_ROWS = 3;

const describeError = (err: unknown) => (err instanceof Error ? err.message : String(err));

const isCmdScript = (file: string) => /\.(cmd|bat)$/i.test(file);

function passthrough(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env, shell: isCmdScript(command) });
    const ignoreSigint = () => {};
    process.on('SIGINT', ignoreSigint);
    child.on('error', (err) => {
      process.off('SIGINT', ignoreSigint);
      reject(err);
    });
    child.on('exit', (code, signal) => {
      process.off('SIGINT', ignoreSigint);
      resolve(code ?? (signal ? 128 + (osConstants.signals[signal] ?? 0) : 0));
    });
  });
}

export async function runApp(opts: { adapter: AgentAdapter; args: string[]; record: boolean }): Promise<number> {
  const { adapter } = opts;
  const childEnv: NodeJS.ProcessEnv = { ...process.env, PATH: stripShimDir(process.env.PATH) };
  const real = findRealBinary(adapter.command, childEnv);
  if (!real) throw new Error(`${adapter.command} not found on PATH (install ${adapter.name} first)`);
  if (process.env.STASH_OFF) return passthrough(real, opts.args, childEnv);
  const command = isCmdScript(real) ? (process.env.comspec ?? 'cmd.exe') : real;
  const args = isCmdScript(real) ? ['/c', real, ...opts.args] : opts.args;
  const record = opts.record || Boolean(process.env.STASH_RECORD);
  const config = await loadConfig();
  for (const [spec, fix] of [
    [config.hotkey, 'stash hotkey <key>'],
    [config.listHotkey, 'stash hotkey list <key>'],
  ] as const) {
    if (adapter.reservedKeys.includes(spec.toLowerCase())) {
      process.stderr.write(`prompt-shelf: hotkey ${spec} is reserved by ${adapter.name}; pick another with \`${fix}\`\n`);
      return 2;
    }
  }
  const stashKey = parseHotkey(config.hotkey);
  const listKey = parseHotkey(config.listHotkey);
  if (listKey.label === stashKey.label) {
    process.stderr.write(`prompt-shelf: the stash and list hotkeys are both ${stashKey.label}; change one with \`stash hotkey list <key>\`\n`);
    return 2;
  }
  // Order matters: KeyInterceptor reports each press by its index in this list.
  const hotkeys = [stashKey, listKey];
  const LIST_KEY_INDEX = 1;
  const isKey = (chunk: Buffer, key: typeof stashKey) => key.sequences.some((seq) => chunk.equals(seq));
  const cwd = process.cwd();
  const ctx: ActionContext = {
    store: new Store(stashFile),
    shelves: new Shelves(shelvesFile),
    agent: adapter.name,
    cwd,
    skillPrompt: adapter.skillPrompt,
  };
  const stdout = process.stdout;
  const stdin = process.stdin;
  const cols = () => stdout.columns || 80;
  const rows = () => stdout.rows || 24;

  const screen = new Screen(cols(), rows());
  const input = new StdinPipeline(new KeyInterceptor(hotkeys));
  const pty = spawnAgent({ command, args, cols: cols(), rows: rows(), cwd, env: childEnv });

  // What the list panel remembers between openings in this session.
  let lastScope: Scope = 'repo';
  let lastTab: Tab = { kind: 'stash' };
  let lastSort: SortOrder = 'newest';
  let skills: Skill[] | null = null;

  let overlay: Overlay | null = null;
  // The save picker, with the draft it is saving and that draft's full text (pastes expanded).
  let picker: { ui: SavePicker; draft: Draft; text: string } | null = null;
  // Set while a panel is being opened, so a fast double press doesn't open two.
  let opening = false;
  const panelOpen = () => overlay !== null || picker !== null || opening;
  let panel: PanelPlacement | null = null;
  // The agent's box had text when the list opened; picked prompts go after it.
  let hadDraft = false;

  const pastes = new PasteRecorder();
  const tracker = adapter.pasteLabel ? new PasteTracker(new PasteLabels(adapter.pasteLabel), () => screen.lines().join('\n')) : null;
  let pasteTimer: NodeJS.Timeout | null = null;
  let toastTimer: NodeJS.Timeout | null = null;
  let toastBar: string | null = null;
  let toastRedraw: NodeJS.Timeout | null = null;
  let escTimer: NodeJS.Timeout | null = null;

  const repaintAgent = () => {
    stdout.write(ansi.clearScreen + ansi.home + screen.serialize() + ansi.showCursor);
  };

  const inputAnchor = () => {
    const lines = screen.lines();
    const inputTop = adapter.inputTop(lines);
    const hasBorderAbove = inputTop !== null && inputTop > 0 && adapter.isBorder(lines[inputTop - 1] ?? '');
    return { rows: rows(), inputTop, hasBorderAbove };
  };

  // Draws whichever panel is open, just above the agent's input box.
  const drawPanel = (status?: Status) => {
    const ui = overlay ?? picker?.ui;
    if (!ui) return;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = null;
    toastBar = null;
    const next = panelPlacement(inputAnchor(), overlay ? undefined : PICKER_ROWS);
    if (panel && (panel.top !== next.top || panel.height !== next.height)) repaintAgent();
    panel = next;
    const frame = ui.render(cols(), next.height, status).split('\r\n');
    stdout.write(ansi.hideCursor + frame.map((line, i) => ansi.moveTo(next.top + i, 0) + line).join(''));
  };

  const closePanel = () => {
    if (overlay) {
      lastScope = overlay.scope;
      lastTab = overlay.tab;
      lastSort = overlay.sort;
    }
    overlay = null;
    picker = null;
    panel = null;
    repaintAgent();
  };

  // The agent redraws after its input box grows or shrinks, which can paint over the toast,
  // so it is drawn again once the agent's output goes quiet.
  const drawToast = () => {
    if (!toastBar || panelOpen()) return;
    stdout.write('\x1b7' + ansi.moveTo(toastRow(inputAnchor()), 0) + toastBar + '\x1b8');
  };

  const toast = (status: Status) => {
    if (toastTimer) clearTimeout(toastTimer);
    if (overlay || picker) {
      drawPanel(status);
      toastTimer = setTimeout(() => drawPanel(), TOAST_MS);
      return;
    }
    toastBar = ansi.reverse + (status.error ? theme.error : '') + fitLine(` ${status.text} `, cols()) + ansi.reset;
    drawToast();
    toastTimer = setTimeout(() => {
      toastBar = null;
      repaintAgent();
    }, TOAST_MS);
  };

  // Actions run one at a time, in order, so fast key presses never interleave their changes.
  let queue: Promise<void> = Promise.resolve();
  const serial = (fn: () => void | Promise<void>) => {
    queue = queue.then(fn).catch((err: unknown) => toast({ text: `error: ${describeError(err)}`, error: true }));
  };

  const onProcessError = (err: unknown) => toast({ text: `error: ${describeError(err)}`, error: true });

  const readDraft = async () => {
    await screen.write('');
    return adapter.readDraft(screen.lines({ dropDim: adapter.dimPlaceholder }), screen.cursor(), screen.cols);
  };

  const placeText = async (text: string) => {
    await injectPaste(pty, hadDraft ? '\n' + text : text);
    hadDraft = false;
  };

  const applyEffect = async (effect: Effect) => {
    if (effect.clearDraft && picker) pty.write(adapter.clearDraft(picker.draft));
    if (effect.close) closePanel();
    if (effect.insert !== undefined) await placeText(effect.insert);
    if (effect.refresh && overlay) {
      const data = await panelData(ctx);
      overlay.update(data.prompts, data.shelves, data.starred);
    }
    if (effect.showShelf && overlay) overlay.showShelf(effect.showShelf);
    if (effect.status) toast(effect.status);
    else if (overlay || picker) drawPanel();
  };

  // Leftover keystrokes (e.g. half an escape sequence) belong to the agent, not the panel.
  const beforeOpening = () => {
    if (escTimer) clearTimeout(escTimer);
    const rest = input.flush();
    if (rest) pty.write(rest);
  };

  const openList = async () => {
    const draft = await readDraft();
    const data = await panelData(ctx);
    skills ??= adapter.skills(cwd);
    hadDraft = draft !== null;
    overlay = new Overlay(data.prompts, {
      cwd,
      hotkeyLabel: stashKey.label,
      scope: lastScope,
      shelves: data.shelves,
      starredShelves: data.starred,
      skills,
      agent: adapter.displayName,
      tab: lastTab,
      sort: lastSort,
    });
    drawPanel();
  };

  const openPicker = async () => {
    const draft = await readDraft();
    if (!draft) return toast({ text: 'nothing to stash' });
    const text = tracker ? tracker.expand(draft.text) : draft.text;
    if (text === null || adapter.unsafeDraft.test(text)) return toast({ text: 'draft contains a collapsed paste — expand it first', error: true });
    const data = await panelData(ctx);
    picker = { ui: new SavePicker(text, data.shelves, data.starred), draft, text };
    drawPanel();
  };

  const recordFrame = async () => {
    await screen.write('');
    const file = join(stashDir, `record-${adapter.name}-${Date.now()}.txt`);
    await writeFile(file, screen.lines().join('\n') + `\n--- cursor ${JSON.stringify(screen.cursor())}\n`);
    toast({ text: `recorded ${file}` });
  };

  const onHotkey = async (index: number) => {
    if (record) return recordFrame();
    if (panelOpen()) return;
    opening = true;
    beforeOpening();
    try {
      await (index === LIST_KEY_INDEX ? openList() : openPicker());
    } finally {
      opening = false;
    }
  };

  const checkPastesSoon = () => {
    if (!tracker?.waiting || pasteTimer) return;
    pasteTimer = setTimeout(() => {
      pasteTimer = null;
      tracker.check();
      checkPastesSoon();
    }, PASTE_CHECK_MS);
  };

  pty.onData((data) => {
    try {
      void screen.write(data);
      if (!panelOpen()) stdout.write(data);
      checkPastesSoon();
      if (toastBar && !panelOpen()) {
        if (toastRedraw) clearTimeout(toastRedraw);
        toastRedraw = setTimeout(drawToast, TOAST_REDRAW_MS);
      }
    } catch (err) {
      toast({ text: `error: ${describeError(err)}`, error: true });
    }
  });

  stdin.setRawMode?.(true);
  stdin.resume();
  stdin.on('data', (chunk: Buffer) => {
    if (picker) {
      // The stash key again saves to whatever is picked; the list key cancels.
      const ui = picker.ui;
      const text = picker.text;
      if (isKey(chunk, stashKey)) serial(async () => applyEffect(await pickerEffect(ctx, ui.confirm(), text)));
      else if (isKey(chunk, listKey)) closePanel();
      else {
        const keys = input.decodeOnly(chunk);
        if (keys) serial(async () => applyEffect(await pickerEffect(ctx, ui.handleKey(keys), text)));
      }
      return;
    }
    if (overlay) {
      const ui = overlay;
      if (hotkeys.some((key) => isKey(chunk, key))) closePanel();
      else {
        const keys = input.decodeOnly(chunk);
        if (keys) serial(async () => applyEffect(await overlayEffect(ctx, ui.handleKey(keys), hadDraft)));
      }
      return;
    }
    if (opening) return;
    const { text, presses } = input.feed(chunk);
    if (text) pty.write(text);
    for (const pasted of pastes.feed(text)) tracker?.pasted(pasted);
    checkPastesSoon();
    for (const index of presses) serial(() => onHotkey(index));
    if (escTimer) clearTimeout(escTimer);
    if (input.hasPending) {
      escTimer = setTimeout(() => {
        if (panelOpen()) return;
        const rest = input.flush();
        if (rest) pty.write(rest);
      }, ESC_FLUSH_MS);
    }
  });

  stdout.on('resize', () => {
    screen.resize(cols(), rows());
    pty.resize(cols(), rows());
    drawPanel();
  });

  process.on('uncaughtException', onProcessError);
  process.on('unhandledRejection', onProcessError);

  return new Promise<number>((resolve) => {
    pty.onExit((code) => {
      for (const timer of [escTimer, toastTimer, toastRedraw, pasteTimer]) if (timer) clearTimeout(timer);
      process.off('uncaughtException', onProcessError);
      process.off('unhandledRejection', onProcessError);
      if (overlay || picker) closePanel();
      stdout.write(ansi.saneEpilogue);
      stdin.setRawMode?.(false);
      stdin.pause();
      resolve(code);
    });
  });
}
