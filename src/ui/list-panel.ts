import { basename } from 'node:path';
import { isStashDraft, nextSort, onShelf, sortSaved, type Prompt, type SortOrder } from '../domain/prompt.js';
import { scoped, type Scope } from '../domain/scope.js';
import type { Skill } from '../domain/skill.js';
import { ago } from '../domain/time.js';
import { t } from '../i18n/index.js';
import { ansi, theme } from '../terminal/ansi.js';
import { splitKeys } from '../terminal/keys.js';
import { clip, flatten, padCells, visibleWidth } from '../terminal/text.js';
import type { Panel, Status } from './types.js';
import { addNewHint, choiceRow, keyHints, panelFrame, shelfLabel, statusLine, styleStar, TextInput } from './widgets.js';

/** What a key press asks the session to do; the panel itself never touches the store. */
export type ListAction =
  | { type: 'none' }
  | { type: 'close' }
  /** Put a stash draft in the box and remove it from the stash. */
  | { type: 'pop'; prompt: Prompt }
  /** Put a prompt in the box and keep it (a shelf prompt, or `a` on a draft). */
  | { type: 'use'; prompt: Prompt }
  | { type: 'use-skill'; name: string }
  | { type: 'delete'; prompt: Prompt }
  | { type: 'save-to-shelf'; prompt: Prompt; shelf: string }
  | { type: 'create-shelf'; name: string; prompt?: Prompt }
  | { type: 'star-shelf'; shelf: string }
  | { type: 'move-shelf'; shelf: string; step: -1 | 1 };

export type Tab = { kind: 'stash' } | { kind: 'skills' } | { kind: 'shelf'; name: string };

/** A row in the list: a prompt (stash draft or saved prompt), or a skill on the Skills tab. */
export type Row = { kind: 'prompt'; prompt: Prompt } | { kind: 'skill'; skill: Skill };

const SORT_LABEL = (order: SortOrder): string => {
  const labels: Record<SortOrder, string> = {
    newest: t('list.sortLabel_newest'),
    'most-used': t('list.sortLabel_mostUsed'),
    recent: t('list.sortLabel_recent'),
  };
  return labels[order];
};

export interface ListPanelOptions {
  cwd: string;
  /** The save hotkey, named in the empty stash's hint. */
  hotkeyLabel: string;
  scope?: Scope;
  /** Shelves in display order (starred first). */
  shelves?: string[];
  starredShelves?: string[];
  /** Skills the running agent can use here, for the Skills tab. */
  skills?: Skill[];
  /** The agent's name as shown to the user. */
  agent?: string;
  tab?: Tab;
  sort?: SortOrder;
}

const sameTab = (a: Tab, b: Tab) => a.kind === b.kind && (a.kind !== 'shelf' || (b.kind === 'shelf' && a.name === b.name));
const rowText = (row: Row) => (row.kind === 'skill' ? `${row.skill.name} ${row.skill.description}` : row.prompt.text);
// Right-hand tag for a saved prompt: how often and how recently it was used.
const usageTag = (p: Prompt) => (p.usedCount ? `used ${p.usedCount}× · ${ago(p.lastUsedAt)}` : `saved ${ago(p.createdAt)}`);
const KEY_COLUMN = 11;

type Mode = 'list' | 'filter' | 'confirm-delete' | 'pick-shelf' | 'new-shelf' | 'help';

/** The list panel: tabs for the stash, skills and each shelf, and what the keys do in it. */
export class ListPanel implements Panel<ListAction> {
  private index = 0;
  private mode: Mode = 'list';
  private filterText = '';
  private tabIndex = 0;
  private prompts: Prompt[];
  private shelves: string[];
  private starredShelves: string[];
  private currentScope: Scope;
  private sortOrder: SortOrder;
  // Saving a prompt to a shelf: which prompt, which shelf is picked, and a new shelf's name.
  private saving: Prompt | undefined;
  private target = 0;
  private nameInput = new TextInput();
  private readonly skills: Skill[];
  private readonly agent: string;
  private readonly hotkeyLabel: string;
  private readonly cwd: string;

  constructor(prompts: Prompt[], options: ListPanelOptions) {
    this.prompts = prompts;
    this.cwd = options.cwd;
    this.shelves = options.shelves ?? [];
    this.starredShelves = options.starredShelves ?? [];
    this.skills = options.skills ?? [];
    this.agent = options.agent ?? 'the agent';
    this.hotkeyLabel = options.hotkeyLabel;
    this.currentScope = options.scope ?? 'repo';
    this.sortOrder = options.sort ?? 'newest';
    const start = options.tab ? this.tabs().findIndex((t) => sameTab(t, options.tab!)) : 0;
    this.tabIndex = Math.max(0, start);
  }

  tabs(): Tab[] {
    return [{ kind: 'stash' }, { kind: 'skills' }, ...this.shelves.map((name) => ({ kind: 'shelf' as const, name }))];
  }

  get tab(): Tab {
    return this.tabs()[this.tabIndex] ?? { kind: 'stash' };
  }

  get scope(): Scope {
    return this.currentScope;
  }

  get sort(): SortOrder {
    return this.sortOrder;
  }

  /** New data after a change; the same tab stays open, or the stash if that shelf is gone. */
  update(prompts: Prompt[], shelves: string[] = this.shelves, starredShelves: string[] = this.starredShelves): void {
    const tab = this.tab;
    this.prompts = prompts;
    this.shelves = shelves;
    this.starredShelves = starredShelves;
    this.tabIndex = Math.max(0, this.tabs().findIndex((t) => sameTab(t, tab)));
    this.clampIndex();
  }

  /** Opens a shelf's tab, e.g. right after creating it. */
  showShelf(name: string): void {
    const i = this.tabs().findIndex((t) => t.kind === 'shelf' && t.name === name);
    if (i >= 0) this.goToTab(i);
  }

  private drafts(): Prompt[] {
    return this.prompts.filter(isStashDraft);
  }

  private tabRows(tab: Tab): Row[] {
    if (tab.kind === 'skills') return this.skills.map((skill) => ({ kind: 'skill', skill }));
    const prompts =
      tab.kind === 'shelf' ? sortSaved(this.prompts.filter(onShelf(tab.name)), this.sortOrder) : scoped(this.drafts(), this.currentScope, this.cwd);
    return prompts.map((prompt) => ({ kind: 'prompt', prompt }));
  }

  /** The rows shown on the current tab, after the search; for skills, name matches come first. */
  visible(): Row[] {
    const rows = this.tabRows(this.tab);
    const q = this.filterText.toLowerCase();
    if (!q) return rows;
    const matches = rows.filter((r) => rowText(r).toLowerCase().includes(q));
    const inName = (r: Row) => r.kind === 'skill' && r.skill.name.toLowerCase().includes(q);
    return [...matches.filter(inName), ...matches.filter((r) => !inName(r))];
  }

  /** Handles a chunk of input; fast typing or a burst of arrows can arrive as one chunk. */
  handleKey(chunk: string): ListAction {
    for (const key of splitKeys(chunk)) {
      const action = this.handleOne(key);
      if (action.type !== 'none') return action;
    }
    return { type: 'none' };
  }

  private handleOne(key: string): ListAction {
    if (this.mode === 'filter') return this.handleFilterKey(key);
    if (this.mode === 'pick-shelf') return this.handlePickKey(key);
    if (this.mode === 'new-shelf') return this.handleNameKey(key);
    if (this.mode === 'help') {
      this.mode = 'list';
      return { type: 'none' };
    }
    const row = this.visible()[this.index];
    const prompt = row?.kind === 'prompt' ? row.prompt : undefined;
    if (this.mode === 'confirm-delete') {
      this.mode = 'list';
      return key === 'y' && prompt ? { type: 'delete', prompt } : { type: 'none' };
    }
    const tab = this.tab;
    switch (key) {
      case '\x1b[A':
      case 'k':
        this.index = Math.max(0, this.index - 1);
        return { type: 'none' };
      case '\x1b[B':
      case 'j':
        this.index = Math.min(Math.max(0, this.visible().length - 1), this.index + 1);
        return { type: 'none' };
      case '\x1b[C':
        this.goToTab((this.tabIndex + 1) % this.tabs().length);
        return { type: 'none' };
      case '\x1b[D':
        this.goToTab((this.tabIndex - 1 + this.tabs().length) % this.tabs().length);
        return { type: 'none' };
      case '\r':
        // A draft is used up; a saved prompt stays on its shelf; a skill is named in the box.
        if (row?.kind === 'skill') return { type: 'use-skill', name: row.skill.name };
        if (!prompt) return { type: 'none' };
        return isStashDraft(prompt) ? { type: 'pop', prompt } : { type: 'use', prompt };
      case 'a':
        return prompt ? { type: 'use', prompt } : { type: 'none' };
      case 's':
        if (prompt) this.startSaving(prompt);
        return { type: 'none' };
      case 'd':
        if (prompt) this.mode = 'confirm-delete';
        return { type: 'none' };
      case 'n':
        this.saving = undefined;
        this.nameInput = new TextInput();
        this.mode = 'new-shelf';
        return { type: 'none' };
      case '*':
        return tab.kind === 'shelf' ? { type: 'star-shelf', shelf: tab.name } : { type: 'none' };
      case '<':
      case '>':
        return tab.kind === 'shelf' ? { type: 'move-shelf', shelf: tab.name, step: key === '<' ? -1 : 1 } : { type: 'none' };
      case 'o':
        if (tab.kind === 'shelf') {
          this.sortOrder = nextSort(this.sortOrder);
          this.index = 0;
        }
        return { type: 'none' };
      case '\t':
        if (tab.kind === 'stash') {
          this.currentScope = this.currentScope === 'repo' ? 'all' : 'repo';
          this.clampIndex();
        }
        return { type: 'none' };
      case '/':
        this.mode = 'filter';
        return { type: 'none' };
      case '?':
        this.mode = 'help';
        return { type: 'none' };
      case '\x1b':
      case '\x03':
      case 'q':
        return { type: 'close' };
      default:
        return { type: 'none' };
    }
  }

  /** Exactly `rows` lines of at most `cols` cells; the key hints (or `status`) always get the last line. */
  render(cols: number, rows: number, status?: Status): string {
    const list = this.visible();
    const body: string[] = [];
    const bodyRows = Math.max(0, rows - 3);
    const empty = this.emptyMessage();
    if (this.mode === 'help') body.push(...this.helpLines());
    else if (empty) body.push(`  ${ansi.dim}${empty}${ansi.reset}`);
    else if (list.length === 0) body.push(`  ${ansi.dim}no matches for /${this.filterText}${ansi.reset}`);
    else {
      const top = Math.max(0, Math.min(this.index - Math.floor(bodyRows / 2), list.length - bodyRows));
      list.slice(top, top + bodyRows).forEach((row, i) => body.push(this.rowLine(row, top + i === this.index, cols)));
    }
    const footer = status ? statusLine(status) : this.footer(cols);
    return panelFrame([this.tabBar(cols), this.infoLine(cols, list.length), ...body.slice(0, bodyRows)], footer, cols, rows);
  }

  private rowLine(row: Row, selected: boolean, cols: number): string {
    const marker = selected ? `${theme.accent}▸${ansi.reset}` : ' ';
    const box = (text: string) => (selected ? `${ansi.reverse}${ansi.bold} ${text} ${ansi.reset}` : ` ${text} `);
    if (row.kind === 'skill') {
      // Name in a fixed column, then the description and where the skill comes from, dimmed.
      const nameWidth = Math.min(28, Math.max(12, Math.floor(cols / 4)));
      const about = clip(flatten(`${row.skill.description} · ${row.skill.source}`), Math.max(0, cols - nameWidth - 5));
      return `${marker}${box(padCells(clip(row.skill.name, nameWidth), nameWidth))} ${ansi.dim}${about}${ansi.reset}`;
    }
    const p = row.prompt;
    const tag = clip(p.shelf === undefined ? `${p.agent} · ${basename(p.cwd)} · ${ago(p.createdAt)}` : usageTag(p), Math.floor(cols / 3));
    const text = clip(flatten(p.text), Math.max(0, cols - 5 - visibleWidth(tag)));
    return `${marker}${box(text)}${tag ? ` ${ansi.dim}${tag}${ansi.reset}` : ''}`;
  }

  private footer(cols: number): string {
    switch (this.mode) {
      case 'confirm-delete':
        return ` ${ansi.bold}${theme.error}${t('list.deletePrompt')}${ansi.reset}  ${keyHints([['y', t('list.deleteYes')], ['n', t('list.deleteNo')]])}`;
      case 'help':
        return keyHints([['any key', 'back']]);
      case 'filter':
        return ` ${ansi.bold}/ ${this.filterText}▏${ansi.reset}${ansi.dim}   ${t('list.filterDone')}${ansi.reset}`;
      case 'new-shelf':
        return this.nameInput.render('new shelf name:', t('list.newShelfHint'));
      case 'pick-shelf': {
        const hint = `   ${t('list.pickShelfHint')}`;
        const label = ` ${t('list.saveToShelf')}`;
        const row = choiceRow(this.saveTargets(), this.target, Math.max(10, cols - label.length - hint.length));
        return `${ansi.bold}${label}${ansi.reset}${row}${ansi.dim}${hint}${ansi.reset}`;
      }
    }
    if (this.tab.kind === 'skills') return keyHints([['enter', t('list.key.useSkill', { agent: this.agent })], ['/', t('list.key.search')], ['?', t('list.key.moreKeys')], ['esc', t('list.key.closeList')]]);
    const save: [string, string] = this.tab.kind === 'shelf' ? ['s', t('list.key.movePrompt')] : ['s', t('list.key.saveDraft')];
    return keyHints([['enter', t('list.key.usePrompt')], save, ['/', t('list.key.filter')], ['?', t('list.key.moreKeys')], ['esc', t('list.key.esc')]]);
  }

  private helpLines(): string[] {
    const tab = this.tab;
    const shelf = tab.kind === 'shelf';
    const both: [string, string][] = [
      [t('list.key.switchTab'), t('list.key.switchList')],
      [t('list.key.navUp'), t('list.key.moveUp')],
    ];
    let rows: [string, string][];
    if (tab.kind === 'skills') {
      rows = [...both, ['enter', t('list.key.useSkill', { agent: this.agent })], ['/', t('list.key.search')], ['esc', t('list.key.closeList')]];
    } else {
      const starAction = shelf && this.starredShelves.includes(tab.name) ? 'unstar' : 'star';
      const star = t('list.key.starShelf', { action: starAction });
      const scopeChange = this.currentScope === 'repo' ? t('list.key.scopeToAll') : t('list.key.scopeToRepo');
      rows = [
        ...both,
        ['enter', shelf ? t('list.key.usePromptKeep') : t('list.key.putDraft')],
        ...(shelf ? [] : ([['a', t('list.key.keepDraft')]] as [string, string][])),
        ['s', shelf ? t('list.key.movePrompt') : t('list.key.saveDraft')],
        ['n', t('list.key.newShelf')],
        ...(shelf
          ? ([
              ['o', t('list.key.sortNext', { next: SORT_LABEL(nextSort(this.sortOrder)) })],
              ['*', star],
              ['<  >', t('list.key.moveShelfLR')],
            ] as [string, string][])
          : ([['tab', t('list.key.scopeToggle', { change: scopeChange })]] as [string, string][])),
        ['d', t('list.key.delete')],
        ['/', t('list.key.filter')],
        ['esc', t('list.key.esc')],
      ];
    }
    // Two columns, so every key fits in the panel's height.
    const half = Math.ceil(rows.length / 2);
    const cell = ([k, what]: [string, string]) => `${ansi.bold}${theme.accent}${padCells(k, KEY_COLUMN)}${ansi.reset}${what}`;
    const leftWidth = Math.max(...rows.slice(0, half).map(([, what]) => KEY_COLUMN + visibleWidth(what))) + 4;
    return rows.slice(0, half).map((left, i) => {
      const right = rows[half + i];
      return `   ${cell(left)}${right ? ' '.repeat(leftWidth - KEY_COLUMN - visibleWidth(left[1])) + cell(right) : ''}`;
    });
  }

  private emptyMessage(): string | null {
    const tab = this.tab;
    if (this.tabRows(tab).length) return null;
    if (tab.kind === 'skills') return t('list.noSkillsFor', { agent: this.agent });
    if (tab.kind === 'shelf') return t('list.emptyShelf', { name: tab.name });
    const drafts = this.drafts().length;
    return drafts ? t('list.emptyStashTab', { count: drafts }) : t('list.emptyStash', { hotkey: this.hotkeyLabel });
  }

  private tabName(tab: Tab): string {
    if (tab.kind === 'stash') return 'Stash';
    if (tab.kind === 'skills') return 'Skills';
    return shelfLabel(tab.name, this.starredShelves);
  }

  // The lists as tabs, then "+ new (n)", with "←→ switch list" on the right when there's room.
  private tabBar(cols: number): string {
    const addNew = addNewHint();
    const hint = t('list.switchLists');
    const labels = this.tabs().map((t) => `${this.tabName(t)} ${this.tabRows(t).length}`);
    const style = (l: string) => styleStar(l).replace(/ (\d+)$/, ` ${ansi.dim}$1${ansi.reset}`);
    const row = choiceRow(labels, this.tabIndex, cols - visibleWidth(addNew) - hint.length - 2, style) + addNew;
    const gap = cols - visibleWidth(row) - hint.length - 1;
    return gap > 0 ? `${row}${' '.repeat(gap)}${ansi.dim}${hint}${ansi.reset}` : row;
  }

  // What the current list is and how using a prompt from it behaves, plus the position.
  private infoLine(cols: number, shown: number): string {
    const tab = this.tab;
    let about: string;
    if (tab.kind === 'skills') about = t('list.skillsTip', { agent: this.agent });
    else if (tab.kind === 'shelf') about = t('list.savedPromptsTip', { sort: SORT_LABEL(this.sortOrder) });
    else {
      const drafts = this.drafts().length;
      const where = this.currentScope === 'all'
        ? t('list.draftsCross', { count: drafts })
        : t('list.draftsThisRepo', { shown: this.tabRows(tab).length, total: drafts });
      about = t('list.draftsTip', { where });
    }
    if (this.filterText) about += ` · ${t('list.filterIndicator', { query: this.filterText })}`;
    const title = tab.kind === 'shelf' ? tab.name : this.tabName(tab);
    const position = shown && this.mode !== 'help' ? `${this.index + 1}/${shown}` : '';
    const gap = Math.max(1, cols - 4 - visibleWidth(title) - visibleWidth(about) - position.length);
    return ` ${ansi.bold}${title}${ansi.reset} ${ansi.dim}— ${about}${' '.repeat(gap)}${position}${ansi.reset}`;
  }

  // Shelves a prompt can be saved to: all of them except the one it is already on.
  private saveTargets(): string[] {
    return this.shelves.filter((n) => n !== this.saving?.shelf);
  }

  private startSaving(prompt: Prompt): void {
    this.saving = prompt;
    this.target = 0;
    this.nameInput = new TextInput();
    this.mode = this.saveTargets().length ? 'pick-shelf' : 'new-shelf';
  }

  private handlePickKey(key: string): ListAction {
    const targets = this.saveTargets();
    if (key === '\x1b[C' || key === '\x1b[D') {
      this.target = (this.target + (key === '\x1b[C' ? 1 : -1) + targets.length) % targets.length;
      return { type: 'none' };
    }
    if (key === 'n') {
      this.mode = 'new-shelf';
      return { type: 'none' };
    }
    const prompt = this.saving;
    this.mode = 'list';
    this.saving = undefined;
    const shelf = targets[this.target];
    return key === '\r' && prompt && shelf ? { type: 'save-to-shelf', prompt, shelf } : { type: 'none' };
  }

  private handleNameKey(key: string): ListAction {
    const state = this.nameInput.handle(key);
    if (state === 'editing') return { type: 'none' };
    const prompt = this.saving;
    this.mode = 'list';
    this.saving = undefined;
    const name = this.nameInput.value.trim();
    if (state === 'cancel' || !name) return { type: 'none' };
    return { type: 'create-shelf', name, ...(prompt ? { prompt } : {}) };
  }

  private handleFilterKey(key: string): ListAction {
    if (key === '\r') this.mode = 'list';
    else if (key === '\x1b') {
      this.mode = 'list';
      this.filterText = '';
    } else if (key === '\x7f') this.filterText = [...this.filterText].slice(0, -1).join('');
    else if ([...key].length === 1 && key >= ' ') this.filterText += key;
    this.index = 0;
    return { type: 'none' };
  }

  private goToTab(i: number): void {
    this.tabIndex = i;
    this.index = 0;
    this.filterText = '';
  }

  private clampIndex(): void {
    this.index = Math.max(0, Math.min(this.index, this.visible().length - 1));
  }
}
