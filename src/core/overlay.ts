import { basename } from 'node:path';
import type { StashEntry } from './store.js';
import { scoped, type Scope } from './scope.js';
import { ansi } from './terminal.js';

export type OverlayAction =
  | { type: 'none' }
  | { type: 'close' }
  | { type: 'pop'; entry: StashEntry }
  | { type: 'apply'; entry: StashEntry }
  | { type: 'delete'; entry: StashEntry };

type Mode = 'list' | 'filter' | 'confirm-delete';

export interface OverlayOptions {
  hotkeyLabel?: string;
  cwd?: string;
  scope?: Scope;
}

const flatten = (text: string) => text.replace(/\r?\n/g, ' ⏎ ');
const clip = (text: string, room: number) => (text.length > room ? text.slice(0, Math.max(0, room - 1)) + '…' : text);

const CSI_U = /^\x1b\[(\d+)(?:;(\d+))?u$/;
const ANSI_SEQ = /^\x1b\[[0-9;]*[A-Za-z]/;

function truncateVisible(line: string, width: number): string {
  let result = '';
  let visibleLen = 0;
  let i = 0;
  while (i < line.length) {
    const m = ANSI_SEQ.exec(line.slice(i));
    if (m) {
      result += m[0];
      i += m[0].length;
      continue;
    }
    if (visibleLen < width) {
      result += line[i];
      visibleLen++;
    }
    i++;
  }
  return result;
}

export function fitVisible(line: string, width: number): string {
  const visibleLen = [...line.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')].length;
  return truncateVisible(line, width) + ' '.repeat(Math.max(0, width - visibleLen));
}

export function normalizeKey(key: string): string {
  const m = CSI_U.exec(key);
  if (!m) return key;
  const code = Number(m[1]);
  const mods = Number(m[2] ?? '1');
  if (mods !== 1) return key;
  if (code === 27) return '\x1b';
  if (code === 13) return '\r';
  if (code === 127) return '\x7f';
  return String.fromCodePoint(code);
}

export class Overlay {
  private index = 0;
  private mode: Mode = 'list';
  private filterText = '';
  private entries: StashEntry[];
  private currentScope: Scope;
  private readonly hotkeyLabel: string;
  private readonly cwd: string | undefined;

  constructor(entries: StashEntry[], options: OverlayOptions = {}) {
    this.entries = entries;
    this.hotkeyLabel = options.hotkeyLabel ?? 'ctrl+f';
    this.cwd = options.cwd;
    this.currentScope = this.cwd === undefined ? 'all' : (options.scope ?? 'repo');
  }

  get filter(): string {
    return this.filterText;
  }

  get scope(): Scope {
    return this.currentScope;
  }

  update(entries: StashEntry[]): void {
    this.entries = entries;
    this.clampIndex();
  }

  inScope(): StashEntry[] {
    return scoped(this.entries, this.currentScope, this.cwd);
  }

  visible(): StashEntry[] {
    const q = this.filterText.toLowerCase();
    const list = this.inScope();
    return q ? list.filter((e) => e.text.toLowerCase().includes(q)) : list;
  }

  handleKey(rawKey: string): OverlayAction {
    if (!rawKey.startsWith('\x1b') && rawKey.length > 1) {
      for (const ch of rawKey) {
        const action = this.handleOne(ch);
        if (action.type !== 'none') return action;
      }
      return { type: 'none' };
    }
    return this.handleOne(rawKey);
  }

  private handleOne(rawKey: string): OverlayAction {
    const key = normalizeKey(rawKey);
    if (this.mode === 'filter') return this.handleFilterKey(key);
    if (this.mode === 'confirm-delete') {
      this.mode = 'list';
      const current = this.current();
      return key === 'y' && current ? { type: 'delete', entry: current } : { type: 'none' };
    }
    const current = this.current();
    switch (key) {
      case '\x1b[A':
      case 'k':
        this.index = Math.max(0, this.index - 1);
        return { type: 'none' };
      case '\x1b[B':
      case 'j':
        this.index = Math.min(Math.max(0, this.visible().length - 1), this.index + 1);
        return { type: 'none' };
      case '\r':
        return current ? { type: 'pop', entry: current } : { type: 'none' };
      case 'a':
        return current ? { type: 'apply', entry: current } : { type: 'none' };
      case 'd':
        if (current) this.mode = 'confirm-delete';
        return { type: 'none' };
      case '/':
        this.mode = 'filter';
        return { type: 'none' };
      case '\t':
        this.toggleScope();
        return { type: 'none' };
      case '\x1b':
      case '\x03':
      case 'q':
        return { type: 'close' };
      default:
        return { type: 'none' };
    }
  }

  render(cols: number, rows: number, status?: string): string {
    const lines: string[] = [];
    const list = this.visible();
    const position = list.length ? `  ${this.index + 1}/${list.length}` : '';
    const header = ` stash · ${this.scopeLabel()}${position}${this.filterText ? `  /${this.filterText}` : ''}`;
    lines.push(`${ansi.reverse}${ansi.bold}${fitVisible(header, cols)}${ansi.reset}`);
    const bodyRows = Math.max(0, rows - 2);
    if (this.entries.length === 0) {
      lines.push(`${ansi.dim}nothing stashed — type in the agent's box and press ${this.hotkeyLabel}${ansi.reset}`);
    } else if (this.inScope().length === 0) {
      lines.push(`${ansi.dim}nothing stashed here — tab to see all (${this.entries.length})${ansi.reset}`);
    } else if (list.length === 0) {
      lines.push(`${ansi.dim}no matches for /${this.filterText} · esc to clear${ansi.reset}`);
    } else {
      const top = Math.max(0, Math.min(this.index - Math.floor(bodyRows / 2), list.length - bodyRows));
      for (const entry of list.slice(top, top + bodyRows)) {
        const selected = entry === list[this.index];
        const prefixWidth = 2;
        const gapWidth = 2;
        const maxTag = Math.max(0, Math.floor(cols / 3));
        const rawTag = `${entry.agent} · ${basename(entry.cwd)}`;
        const tagText = rawTag.length > maxTag ? rawTag.slice(0, Math.max(0, maxTag - 1)) + '…' : rawTag;
        const tag = `${ansi.dim}${tagText}${ansi.reset}`;
        const room = Math.max(0, cols - prefixWidth - gapWidth - tagText.length);
        const body = clip(flatten(entry.text), room);
        lines.push(`${selected ? ansi.reverse + '▸ ' : '  '}${body}${selected ? ansi.reset : ''}  ${tag}`);
      }
    }
    while (lines.length < rows - 1) lines.push('');
    lines.push(status ? `${ansi.bold}${status}${ansi.reset}` : this.footer());
    return lines
      .slice(0, rows)
      .map((l) => ansi.clearLine + truncateVisible(l, cols))
      .join('\r\n');
  }

  private footer(): string {
    if (this.mode === 'confirm-delete') return `${ansi.bold}delete this entry? y/n${ansi.reset}`;
    if (this.mode === 'filter') return `${ansi.dim}type to filter · enter/esc done${ansi.reset}`;
    const tab = this.cwd === undefined ? '' : ` · tab ${this.currentScope === 'repo' ? 'all' : 'this repo'}`;
    return `${ansi.dim}enter pop · a apply · d delete · / filter${tab} · esc close${ansi.reset}`;
  }

  private scopeLabel(): string {
    if (this.currentScope === 'all') return `all (${this.entries.length})`;
    return `this repo (${this.inScope().length} of ${this.entries.length})`;
  }

  private toggleScope(): void {
    if (this.cwd === undefined) return;
    this.currentScope = this.currentScope === 'repo' ? 'all' : 'repo';
    this.clampIndex();
  }

  private clampIndex(): void {
    this.index = Math.max(0, Math.min(this.index, this.visible().length - 1));
  }

  private current(): StashEntry | undefined {
    return this.visible()[this.index];
  }

  private handleFilterKey(key: string): OverlayAction {
    if (key === '\r') {
      this.mode = 'list';
    } else if (key === '\x1b') {
      this.mode = 'list';
      this.filterText = '';
    } else if (key === '\x7f') {
      this.filterText = this.filterText.slice(0, -1);
    } else if (key.length === 1 && key >= ' ') {
      this.filterText += key;
    }
    this.index = 0;
    return { type: 'none' };
  }
}
