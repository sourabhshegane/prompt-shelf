import type { AgentAdapter, Draft } from '../adapters/index.js';
import { isStashDraft, type SortOrder } from '../domain/prompt.js';
import { scoped, type Scope } from '../domain/scope.js';
import type { Skill } from '../domain/skill.js';
import { debug } from '../debug.js';
import { describeError } from '../errors.js';
import { t, tn } from '../i18n/index.js';
import { injectPaste } from '../terminal/inject.js';
import { KeyInterceptor, type Hotkey } from '../terminal/keys.js';
import { PasteLabels, PasteRecorder, PasteTracker } from '../terminal/pastes.js';
import type { AgentPty } from '../terminal/pty.js';
import type { Screen } from '../terminal/screen.js';
import { StdinPipeline } from '../terminal/stdin.js';
import { ListPanel, type Tab } from '../ui/list-panel.js';
import { SavePicker } from '../ui/save-picker.js';
import { listEffect, panelData, pickerEffect, type ActionContext, type Effect } from './actions.js';
import type { Display } from './display.js';
import type { SessionKeys } from './hotkeys.js';

// A lone ESC may be the start of an escape sequence; if nothing follows this soon, it was the Esc key.
const ESC_FLUSH_MS = 25;
// How often the screen is checked for a paste's placeholder while pastes are waiting.
const PASTE_CHECK_MS = 100;
// The save picker: the places row, the draft, and the key hints.
const PICKER_ROWS = 3;
// The start-up notice waits for the agent to settle after its input box appears, then stays this long.
const WELCOME_DELAY_MS = 600;
const WELCOME_MS = 6000;

export interface SessionDeps {
  adapter: AgentAdapter;
  ctx: ActionContext;
  pty: Pick<AgentPty, 'write'>;
  /** A mirror of what the agent has drawn. */
  screen: Screen;
  display: Display;
  keys: SessionKeys;
  /** `stash --record`: the hotkeys save the screen instead; returns the file written. */
  record?: () => Promise<string>;
}

const isKey = (chunk: Buffer, key: Hotkey) => key.sequences.some((seq) => chunk.equals(seq));

/**
 * One wrapped agent run: routes the user's keys to the agent or to the open panel, opens the list
 * and the save picker on the hotkeys, and carries out what the panels ask for.
 */
export class Session {
  private list: { ui: ListPanel; hadDraft: boolean } | null = null;
  // The save picker, with the draft it is saving and that draft's full text (pastes expanded).
  private picker: { ui: SavePicker; draft: Draft; text: string } | null = null;
  // Set while a panel is being opened, so a fast double press doesn't open two.
  private opening = false;
  // What the list remembers between openings in this session.
  private last: { scope: Scope; tab: Tab; sort: SortOrder } = { scope: 'repo', tab: { kind: 'stash' }, sort: 'newest' };
  private skills: Skill[] | null = null;
  private readonly input: StdinPipeline;
  private readonly pastes = new PasteRecorder();
  private readonly tracker: PasteTracker | null;
  private pasteTimer: NodeJS.Timeout | null = null;
  private escTimer: NodeJS.Timeout | null = null;
  private welcomed = false;
  private welcomeTimer: NodeJS.Timeout | null = null;
  // Actions run one at a time, in order, so fast key presses never interleave their changes.
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly deps: SessionDeps) {
    // Order matters: the interceptor reports each press by its index in this list.
    this.input = new StdinPipeline(new KeyInterceptor([deps.keys.save, deps.keys.list]));
    const label = deps.adapter.pasteLabel;
    this.tracker = label ? new PasteTracker(new PasteLabels(label), () => deps.screen.lines().join('\n')) : null;
  }

  private get panelOpen(): boolean {
    return this.list !== null || this.picker !== null || this.opening;
  }

  /** Waits for every queued action to finish. */
  idle(): Promise<void> {
    return this.queue;
  }

  /** Output from the agent. */
  agentOutput(data: string): void {
    void this.deps.screen.write(data).then(() => this.welcomeOnce());
    this.deps.display.agentOutput(data);
    this.checkPastesSoon();
  }

  // Once per run, when the agent's input box first shows: say prompt-shelf is on, its keys, and
  // how many drafts are waiting in this repo. Nothing is shown if a panel opened first.
  private welcomeOnce(): void {
    if (this.welcomed || this.deps.adapter.inputTop(this.deps.screen.lines()) === null) return;
    this.welcomed = true;
    this.welcomeTimer = setTimeout(() => {
      this.serial(async () => {
        if (this.panelOpen) return;
        const { keys, ctx, display } = this.deps;
        const parked = scoped((await ctx.store.list()).filter(isStashDraft), 'repo', ctx.cwd).length;
        const keysText = t('welcome.keys', { save: keys.save.label, list: keys.list.label });
        const text = parked ? `${keysText} · ${tn('welcome.parked', parked, { count: parked })}` : keysText;
        display.toast({ text, hint: true }, WELCOME_MS);
      });
    }, WELCOME_DELAY_MS);
  }

  /** Input from the user's terminal. */
  userInput(chunk: Buffer): void {
    const { keys, pty } = this.deps;
    if (this.picker) {
      // The save key again saves to whatever is picked; the list key cancels.
      const { ui, text } = this.picker;
      if (isKey(chunk, keys.save)) this.serial(async () => this.apply(await pickerEffect(this.deps.ctx, ui.confirm(), text)));
      else if (isKey(chunk, keys.list)) this.closePanel();
      else this.forPanel(chunk, (k) => pickerEffect(this.deps.ctx, ui.handleKey(k), text));
      return;
    }
    if (this.list) {
      const { ui, hadDraft } = this.list;
      if (isKey(chunk, keys.save) || isKey(chunk, keys.list)) this.closePanel();
      else this.forPanel(chunk, (k) => listEffect(this.deps.ctx, ui.handleKey(k), hadDraft));
      return;
    }
    if (this.opening) return;
    const { text, presses } = this.input.feed(chunk);
    if (text) pty.write(text);
    for (const pasted of this.pastes.feed(text)) this.tracker?.pasted(pasted);
    this.checkPastesSoon();
    for (const index of presses) this.serial(() => this.onHotkey(index === 1 ? 'list' : 'save'));
    if (this.escTimer) clearTimeout(this.escTimer);
    if (this.input.hasPending) this.escTimer = setTimeout(() => !this.panelOpen && this.flushInput(), ESC_FLUSH_MS);
  }

  dispose(): void {
    for (const timer of [this.escTimer, this.pasteTimer, this.welcomeTimer]) if (timer) clearTimeout(timer);
    this.deps.display.dispose();
  }

  private forPanel(chunk: Buffer, effectOf: (keys: string) => Promise<Effect>): void {
    const keys = this.input.decodeOnly(chunk);
    if (keys) this.serial(async () => this.apply(await effectOf(keys)));
  }

  private serial(fn: () => void | Promise<void>): void {
    this.queue = this.queue.then(fn).catch((err: unknown) => {
      debug('error', describeError(err), { stack: err instanceof Error ? err.stack : undefined });
      this.deps.display.toast({ text: `error: ${describeError(err)}`, error: true });
    });
  }

  private async onHotkey(which: 'save' | 'list'): Promise<void> {
    debug('keys', `${which} hotkey`, { panelOpen: this.panelOpen, record: Boolean(this.deps.record) });
    if (this.deps.record) return this.deps.display.toast({ text: `recorded ${await this.deps.record()}` });
    if (this.panelOpen) return;
    this.opening = true;
    // Leftover keystrokes (e.g. half an escape sequence) belong to the agent, not the panel.
    if (this.escTimer) clearTimeout(this.escTimer);
    this.flushInput();
    try {
      await (which === 'list' ? this.openList() : this.openPicker());
    } finally {
      this.opening = false;
    }
  }

  private async openList(): Promise<void> {
    const { adapter, ctx, keys, display } = this.deps;
    const draft = await this.readDraft();
    const data = await panelData(ctx);
    this.skills ??= adapter.skills(ctx.cwd);
    const ui = new ListPanel(data.prompts, {
      cwd: ctx.cwd,
      hotkeyLabel: keys.save.label,
      scope: this.last.scope,
      shelves: data.shelves,
      starredShelves: data.starred,
      skills: this.skills,
      agent: adapter.displayName,
      tab: this.last.tab,
      sort: this.last.sort,
    });
    this.list = { ui, hadDraft: draft !== null };
    display.show(ui);
  }

  private async openPicker(): Promise<void> {
    const { adapter, ctx, display } = this.deps;
    const draft = await this.readDraft();
    if (!draft) return display.toast({ text: t('save.nothing') });
    const text = this.tracker ? this.tracker.expand(draft.text) : draft.text;
    if (text === null) debug('paste', 'a collapsed paste could not be matched', { waiting: this.tracker?.waiting });
    if (text === null || adapter.unsafeDraft.test(text)) return display.toast({ text: t('save.collapsedPaste'), error: true });
    const data = await panelData(ctx);
    this.picker = { ui: new SavePicker(text, data.shelves, data.starred), draft, text };
    display.show(this.picker.ui, PICKER_ROWS);
  }

  private closePanel(): void {
    if (this.list) this.last = { scope: this.list.ui.scope, tab: this.list.ui.tab, sort: this.list.ui.sort };
    this.list = null;
    this.picker = null;
    this.deps.display.hide();
  }

  /** Carries out an effect, in the order `Effect` documents. */
  private async apply(effect: Effect): Promise<void> {
    debug('effect', Object.keys(effect).join(',') || 'none', effect.status ? { status: effect.status.text } : undefined);
    const { adapter, ctx, pty, display } = this.deps;
    const hadDraft = this.list?.hadDraft ?? false;
    if (effect.clearDraft && this.picker) pty.write(adapter.clearDraft(this.picker.draft));
    if (effect.close) this.closePanel();
    // A picked prompt goes on a new line after what was already in the box.
    if (effect.insert !== undefined) await injectPaste(pty, hadDraft ? '\n' + effect.insert : effect.insert);
    if (effect.refresh && this.list) {
      const data = await panelData(ctx);
      this.list.ui.update(data.prompts, data.shelves, data.starred);
    }
    if (effect.showShelf && this.list) this.list.ui.showShelf(effect.showShelf);
    if (effect.status) display.toast(effect.status);
    else display.redraw();
  }

  private async readDraft(): Promise<Draft | null> {
    const { adapter, screen } = this.deps;
    await screen.write('');
    const lines = screen.lines({ dropDim: adapter.dimPlaceholder });
    const draft = adapter.readDraft(lines, screen.cursor(), screen.cols);
    // Sizes and positions only, never the text.
    debug('draft', draft ? 'read' : 'none', { inputTop: adapter.inputTop(lines), cursor: screen.cursor(), chars: draft?.text.length, lines: draft?.text.split('\n').length });
    return draft;
  }

  private flushInput(): void {
    const rest = this.input.flush();
    if (rest) this.deps.pty.write(rest);
  }

  private checkPastesSoon(): void {
    const tracker = this.tracker;
    if (!tracker?.waiting || this.pasteTimer) return;
    this.pasteTimer = setTimeout(() => {
      this.pasteTimer = null;
      tracker.check();
      this.checkPastesSoon();
    }, PASTE_CHECK_MS);
  }
}
