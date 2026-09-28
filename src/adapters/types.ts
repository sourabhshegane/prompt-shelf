import type { Skill } from '../domain/skill.js';
import type { Cursor } from '../terminal/screen.js';
import type { PasteLabel } from '../terminal/pastes.js';

export interface Draft {
  text: string;
}

/**
 * Everything prompt-shelf knows about one agent CLI. Supporting a new agent means writing one of
 * these (see CONTRIBUTING.md, "Adding an agent"); nothing outside src/adapters/ changes.
 */
export interface AgentAdapter {
  /** Id used on the command line (`stash <name>`) and stored with each prompt. */
  name: string;
  /** How the agent is named in the UI. */
  displayName: string;
  /** The agent's executable; also the name of its shim. */
  command: string;
  /** Keys the agent uses itself, which can't be prompt-shelf hotkeys. Lowercase, e.g. `ctrl+t`. */
  reservedKeys: string[];

  /** The draft in the agent's input box, or null when the cursor isn't in the box. */
  readDraft(lines: string[], cursor: Cursor, cols?: number): Draft | null;
  /** Keys that erase `draft` from the box. */
  clearDraft(draft: Draft): string;
  /** The screen row where the input box starts, or null when it isn't on screen. */
  inputTop(lines: string[]): number | null;
  /** Whether `line` is the box's border (panels go above it). */
  isBorder(line: string): boolean;
  /** The empty box shows a faint placeholder (e.g. `Try "refactor <filepath>"`) that must not be read as a draft. */
  dimPlaceholder?: boolean;

  /** How the agent shows a collapsed paste, so a stash keeps the real text. */
  pasteLabel?: PasteLabel;
  /** Matches any sign of a collapsed paste, even a partly drawn one; such a draft is never saved as is. */
  unsafeDraft: RegExp;

  /** Skills the agent can use in `cwd`, for the Skills tab. */
  skills(cwd: string): Skill[];
  /** What picking a skill puts in the box, in the agent's own syntax; `afterText` when the box already has text. */
  skillPrompt(name: string, afterText: boolean): string;
}
