import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { constants as osConstants } from 'node:os';
import { join } from 'node:path';
import { loadConfig, stashDir, stashFile } from './config.js';
import type { AgentAdapter } from './adapters/index.js';
import type { Draft } from './adapters/types.js';
import { parseHotkey, KeyInterceptor } from './core/keys.js';
import { Screen } from './core/screen.js';
import { spawnAgent } from './core/pty.js';
import { StdinPipeline } from './core/stdin.js';
import { Store } from './core/store.js';
import { Overlay, fitVisible } from './core/overlay.js';
import type { Scope } from './core/scope.js';
import { panelPlacement, toastRow, type PanelPlacement } from './core/layout.js';
import { injectPaste } from './core/inject.js';
import { PasteLabels, PasteRecorder } from './core/pastes.js';
import { ansi } from './core/terminal.js';
import { findRealBinary, stripShimDir } from './shims.js';

const TOAST_MS = 3000;
const ESC_FLUSH_MS = 25;
// A paste still waiting for its placeholder to show up on screen is dropped after this long
// (short pastes never get one).
const PASTE_PENDING_MS = 5000;
const PASTE_LEARN_MS = 100;
const TOAST_REDRAW_MS = 80;

let lastScope: Scope = 'repo';

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
  for (const [spec, command] of [
    [config.hotkey, 'stash hotkey <key>'],
    [config.listHotkey, 'stash hotkey list <key>'],
  ] as const) {
    if (adapter.reservedKeys.includes(spec.toLowerCase())) {
      process.stderr.write(`prompt-shelf: hotkey ${spec} is reserved by ${adapter.name}; pick another with \`${command}\`\n`);
      return 2;
    }
  }
  const hotkey = parseHotkey(config.hotkey);
  const listHotkey = parseHotkey(config.listHotkey);
  if (listHotkey.label === hotkey.label) {
    process.stderr.write(`prompt-shelf: the stash and list hotkeys are both ${hotkey.label}; change one with \`stash hotkey list <key>\`\n`);
    return 2;
  }
  const hotkeys = [hotkey, listHotkey];
  const isHotkey = (chunk: Buffer) => hotkeys.some((h) => h.sequences.some((seq) => chunk.equals(seq)));
  const store = new Store(stashFile);
  const stdout = process.stdout;
  const stdin = process.stdin;
  const cols = () => stdout.columns || 80;
  const rows = () => stdout.rows || 24;

  const screen = new Screen(cols(), rows());
  const input = new StdinPipeline(new KeyInterceptor(hotkeys));
  const pty = spawnAgent({ command, args, cols: cols(), rows: rows(), cwd: process.cwd(), env: childEnv });

  let overlay: Overlay | null = null;
  let panel: PanelPlacement | null = null;
  let openDraft: Draft | null = null;
  const pastes = new PasteRecorder();
  const pasteLabels = adapter.pasteLabel ? new PasteLabels(adapter.pasteLabel) : null;
  let pendingPastes: { text: string; at: number }[] = [];
  let learnTimer: NodeJS.Timeout | null = null;

  // Watches the screen after a paste until the agent's placeholder for it appears.
  const learnPastes = () => {
    if (!pasteLabels || !pendingPastes.length) return;
    const now = Date.now();
    pendingPastes = pendingPastes.filter((p) => now - p.at < PASTE_PENDING_MS);
    if (pasteLabels.learn(screen.lines().join('\n'), pendingPastes.map((p) => p.text))) pendingPastes = [];
  };
  const scheduleLearn = () => {
    if (learnTimer) clearTimeout(learnTimer);
    learnTimer = setTimeout(learnPastes, PASTE_LEARN_MS);
  };
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

  const drawOverlay = (status?: string) => {
    if (!overlay) return;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = null;
    toastBar = null;
    const next = panelPlacement({ ...inputAnchor(), entryCount: overlay.visible().length });
    if (panel && (panel.top !== next.top || panel.height !== next.height)) repaintAgent();
    panel = next;
    const frame = overlay.render(cols(), next.height, status).split('\r\n');
    stdout.write(ansi.hideCursor + frame.map((line, i) => ansi.moveTo(next.top + i, 0) + line).join(''));
  };

  // The agent redraws after its input box grows or shrinks, which can paint over the toast,
  // so it is drawn again once the agent's output goes quiet.
  const drawToast = () => {
    if (!toastBar || overlay) return;
    stdout.write('\x1b7' + ansi.moveTo(toastRow(inputAnchor()), 0) + toastBar + '\x1b8');
  };

  const toast = (message: string) => {
    if (toastTimer) clearTimeout(toastTimer);
    if (overlay) {
      drawOverlay(message);
      toastTimer = setTimeout(() => drawOverlay(), TOAST_MS);
      return;
    }
    toastBar = ansi.reverse + fitVisible(` ${message} `, cols()) + ansi.reset;
    drawToast();
    toastTimer = setTimeout(() => {
      toastBar = null;
      repaintAgent();
    }, TOAST_MS);
  };

  const guard = (fn: () => void | Promise<void>) => {
    Promise.resolve()
      .then(fn)
      .catch((err: unknown) => toast(`error: ${describeError(err)}`));
  };

  const onProcessError = (err: unknown) => toast(`error: ${describeError(err)}`);

  const recordFrame = async () => {
    await screen.write('');
    const file = join(stashDir, `record-${adapter.name}-${Date.now()}.txt`);
    await writeFile(file, screen.lines().join('\n') + `\n--- cursor ${JSON.stringify(screen.cursor())}\n`);
    toast(`recorded ${file}`);
  };

  const openOverlay = async (draft: Draft | null) => {
    openDraft = draft;
    overlay = new Overlay(await store.list(), { hotkeyLabel: hotkey.label, cwd: process.cwd(), scope: lastScope });
    drawOverlay();
  };

  const readDraft = async () => {
    await screen.write('');
    return adapter.readDraft(screen.lines({ dropDim: adapter.dimPlaceholder }), screen.cursor(), screen.cols);
  };

  const stash = async () => {
    const draft = await readDraft();
    if (!draft) return toast('nothing to stash');
    learnPastes();
    const text = pasteLabels ? pasteLabels.expand(draft.text) : draft.text;
    if (text === null || adapter.unsafeDraft.test(text)) return toast('draft contains a collapsed paste — expand it first');
    await store.add({ text, agent: adapter.name, cwd: process.cwd() });
    pty.write(adapter.clearDraft(draft));
    toast(`stashed (${(await store.list()).length})`);
  };

  const placeEntry = async (text: string) => {
    const draft = openDraft;
    openDraft = null;
    await injectPaste(pty, draft ? '\n' + text : text);
    return draft !== null;
  };

  const placedToast = async (type: 'pop' | 'apply', appended: boolean) => {
    if (type === 'pop') return `${appended ? 'appended' : 'popped'} · ${(await store.list()).length} left`;
    return appended ? 'appended (kept)' : 'applied (kept in stash)';
  };

  const closeOverlay = () => {
    if (overlay) lastScope = overlay.scope;
    overlay = null;
    panel = null;
    repaintAgent();
  };

  const LIST_KEY = 1;

  const onHotkey = async (index: number) => {
    if (record) return recordFrame();
    if (index === LIST_KEY) return openOverlay(await readDraft());
    await stash();
  };

  const onOverlayKey = async (key: string) => {
    if (!overlay) return;
    const action = overlay.handleKey(key);
    switch (action.type) {
      case 'close':
        closeOverlay();
        break;
      case 'pop':
      case 'apply': {
        closeOverlay();
        const appended = await placeEntry(action.entry.text);
        if (action.type === 'pop') await store.remove(action.entry.id);
        toast(await placedToast(action.type, appended));
        break;
      }
      case 'delete':
        await store.remove(action.entry.id);
        overlay.update(await store.list());
        drawOverlay();
        break;
      default:
        drawOverlay();
    }
  };

  pty.onData((data) => {
    try {
      void screen.write(data);
      if (!overlay) stdout.write(data);
      if (pendingPastes.length) scheduleLearn();
      if (toastBar && !overlay) {
        if (toastRedraw) clearTimeout(toastRedraw);
        toastRedraw = setTimeout(drawToast, TOAST_REDRAW_MS);
      }
    } catch (err) {
      toast(`error: ${describeError(err)}`);
    }
  });

  stdin.setRawMode?.(true);
  stdin.resume();
  stdin.on('data', (chunk: Buffer) => {
    guard(() => {
      if (overlay) {
        if (isHotkey(chunk)) {
          closeOverlay();
          return;
        }
        const key = input.decodeOnly(chunk);
        if (key) guard(() => onOverlayKey(key));
        return;
      }
      const { text, presses } = input.feed(chunk);
      if (text) pty.write(text);
      for (const pasted of pastes.feed(text)) {
        if (!pasteLabels) continue;
        pasteLabels.remember(pasted);
        pendingPastes.push({ text: pasted, at: Date.now() });
        scheduleLearn();
      }
      for (const index of presses) guard(() => onHotkey(index));
      if (escTimer) clearTimeout(escTimer);
      if (input.hasPending) {
        escTimer = setTimeout(() => {
          if (overlay) return;
          const rest = input.flush();
          if (rest) pty.write(rest);
        }, ESC_FLUSH_MS);
      }
    });
  });

  stdout.on('resize', () => {
    guard(() => {
      screen.resize(cols(), rows());
      pty.resize(cols(), rows());
      if (overlay) drawOverlay();
    });
  });

  process.on('uncaughtException', onProcessError);
  process.on('unhandledRejection', onProcessError);

  return new Promise<number>((resolve) => {
    pty.onExit((code) => {
      if (escTimer) clearTimeout(escTimer);
      if (toastTimer) clearTimeout(toastTimer);
      if (toastRedraw) clearTimeout(toastRedraw);
      if (learnTimer) clearTimeout(learnTimer);
      process.off('uncaughtException', onProcessError);
      process.off('unhandledRejection', onProcessError);
      if (overlay) closeOverlay();
      stdout.write(ansi.saneEpilogue);
      stdin.setRawMode?.(false);
      stdin.pause();
      resolve(code);
    });
  });
}
