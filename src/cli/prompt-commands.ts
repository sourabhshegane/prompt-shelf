import { basename } from 'node:path';
import { isStashDraft, onShelf, type Prompt } from '../domain/prompt.js';
import { scoped } from '../domain/scope.js';
import { localTime } from '../domain/time.js';
import { t } from '../i18n/index.js';
import { UserError } from '../errors.js';
import { clip, flatten } from '../terminal/text.js';
import type { View } from './args.js';

// `stash list | add | pop | rm`: the prompts a listing shows, and how they are printed.

export interface ListScope extends Partial<View> {
  all: boolean;
  cwd: string;
}

const REMOVED_PREVIEW = 60;

/** The line printed after a prompt is removed, so the user sees what went. */
export const describeRemoved = (p: Prompt): string => {
  const location = p.shelf
    ? t('cli.shelf.removedShelfFormat', { shelf: p.shelf })
    : t('cli.shelf.removedAgentFormat', { agent: p.agent, path: basename(p.cwd) });
  return t('cli.shelf.removed', { location, text: clip(flatten(p.text), REMOVED_PREVIEW) });
};

const formatPrompt = (p: Prompt, i: number) => {
  const text = flatten(p.text);
  if (p.shelf === undefined) return `${i + 1}. [${p.agent} · ${p.cwd}] ${text}`;
  const used = p.usedCount ? `used ${p.usedCount}×, last ${localTime(p.lastUsedAt)}` : 'not used yet';
  return `${i + 1}. ${text}\n   saved ${localTime(p.createdAt)} · ${used}`;
};

/** The prompts a listing shows, newest first: one shelf, or the stash for this repo / all repos. */
export function viewPrompts(prompts: Prompt[], scope: ListScope): Prompt[] {
  if (scope.shelf) return prompts.filter(onShelf(scope.shelf));
  return scoped(prompts.filter(isStashDraft), scope.all ? 'all' : 'repo', scope.cwd);
}

export function listLines(prompts: Prompt[], scope: ListScope): string[] {
  const shown = viewPrompts(prompts, scope);
  const lines = shown.map(formatPrompt);
  if (!scope.shelf) {
    const hidden = prompts.filter(isStashDraft).length - shown.length;
    if (hidden > 0) lines.push(t('cli.shelf.moreInOtherRepos', { count: hidden }));
  }
  return lines;
}

/** Prompt number `ref` (1 = newest, the default) of a listing. */
export function resolveRef(prompts: Prompt[], ref: string | undefined, scope: ListScope): Prompt {
  const shown = viewPrompts(prompts, scope);
  const n = Number.parseInt(ref ?? '1', 10);
  if (!Number.isInteger(n) || n < 1 || n > shown.length) throw new UserError(t('cli.prompt.noPromptError', { ref: ref ?? '1', count: shown.length }));
  return shown[n - 1]!;
}
