import { BACKSPACE, END_KEY } from '../terminal/sequences.js';
import type { Cursor } from '../terminal/screen.js';
import { visibleWidth } from '../terminal/text.js';
import type { AgentAdapter, Draft } from './types.js';

// Reading an input box that starts with a marker (`❯`, `›`, …) and continues on indented lines,
// which is how Claude Code and Codex draw theirs. An agent with another kind of box writes its own.

export interface MarkerSpec {
  /** The box's first line; group 1 is the text after the marker. */
  marker: RegExp;
  /** A following line of the same draft; group 1 is its text. */
  continuation: RegExp;
  /** A line that ends the box, e.g. its bottom border. */
  terminator: RegExp;
}

/** Two-space continuation lines and a box-drawing border, as both current agents draw. */
const DEFAULTS = { continuation: /^\s{2}(.*)$/, terminator: /^[─╭╰]/ };

// A line this close to the full width was probably wrapped by the terminal, not broken by the user.
const WRAP_SLACK = 3;
const wrapsInto = (previous: string, cols: number | undefined) => cols !== undefined && visibleWidth(previous.trimEnd()) >= cols - WRAP_SLACK;

export function findInputStart(lines: string[], spec: Pick<MarkerSpec, 'marker'>): number | null {
  for (let y = lines.length - 1; y >= 0; y--) {
    if (spec.marker.test(lines[y] ?? '')) return y;
  }
  return null;
}

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

/** Erases a draft by going to its end and pressing Backspace once per character (newlines too). */
export function backspaceClear(draft: Draft): string {
  return END_KEY + BACKSPACE.repeat([...draft.text].length);
}

/** The screen-reading part of an adapter, for a box drawn as described above. */
export function markedInputBox(
  spec: Pick<MarkerSpec, 'marker'> & Partial<MarkerSpec>,
): Pick<AgentAdapter, 'readDraft' | 'clearDraft' | 'inputTop' | 'isBorder'> {
  const full: MarkerSpec = { ...DEFAULTS, ...spec };
  return {
    readDraft: (lines, cursor, cols) => readMarkedDraft(lines, cursor, full, cols),
    clearDraft: backspaceClear,
    inputTop: (lines) => findInputStart(lines, full),
    isBorder: (line) => full.terminator.test(line),
  };
}
