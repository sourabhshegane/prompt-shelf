import type { PasteLabel } from '../core/pastes.js';
import type { Cursor } from '../core/screen.js';

export interface Draft {
  text: string;
}

export interface AgentAdapter {
  name: string;
  command: string;
  readDraft(lines: string[], cursor: Cursor, cols?: number): Draft | null;
  /** The empty input box shows a faint placeholder that must not be read as a draft. */
  dimPlaceholder?: boolean;
  unsafeDraft: RegExp;
  /** Placeholder the agent shows for a collapsed paste; lets a stash keep the real text. */
  pasteLabel?: PasteLabel;
  clearDraft(draft: Draft): string;
  inputTop(lines: string[]): number | null;
  isBorder(line: string): boolean;
  reservedKeys: string[];
}

const END_KEY = '\x1b[F';
const BACKSPACE = '\x7f';

export function backspaceClear(draft: Draft): string {
  return END_KEY + BACKSPACE.repeat([...draft.text].length);
}

export interface MarkerSpec {
  marker: RegExp;
  continuation: RegExp;
  terminator: RegExp;
}

export function findInputStart(lines: string[], spec: MarkerSpec): number | null {
  for (let y = lines.length - 1; y >= 0; y--) {
    if (spec.marker.test(lines[y] ?? '')) return y;
  }
  return null;
}

const WRAP_SLACK = 3;

const visibleWidth = (line: string) => [...line.trimEnd()].length;

const wrapsInto = (previous: string, cols: number | undefined) => cols !== undefined && visibleWidth(previous) >= cols - WRAP_SLACK;

export function readMarkedDraft(lines: string[], cursor: Cursor, spec: MarkerSpec, cols?: number): Draft | null {
  const start = findInputStart(lines, spec);
  if (start === null || cursor.y < start) return null;
  let text = spec.marker.exec(lines[start] ?? '')?.[1] ?? '';
  let end = start;
  for (let y = start + 1; y < lines.length; y++) {
    const line = lines[y] ?? '';
    if (spec.terminator.test(line) || line.trim() === '') break;
    const cont = spec.continuation.exec(line);
    if (!cont) break;
    text += (wrapsInto(lines[y - 1] ?? '', cols) ? ' ' : '\n') + (cont[1] ?? '');
    end = y;
  }
  if (cursor.y > end) return null;
  text = text.replace(/\s+$/, '');
  return text ? { text } : null;
}
