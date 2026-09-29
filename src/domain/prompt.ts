// What a saved prompt is, and the rules for which list it belongs to and how a shelf is ordered.

/** A saved prompt: a stash draft (no shelf) or a prompt kept on a shelf. */
export interface Prompt {
  id: string;
  text: string;
  agent: string;
  cwd: string;
  createdAt: string;
  /** The shelf ID this prompt is saved on; absent for stash drafts. */
  shelfId?: string;
  /** The shelf name (deprecated, kept for v1 backward compat; shelfId takes precedence). */
  shelf?: string;
  /** How many times the prompt was put in the box while keeping it (shelf prompts, `a` on a draft). */
  usedCount?: number;
  lastUsedAt?: string;
}

export const isStashDraft = (p: Prompt): boolean => !p.shelfId && !p.shelf;
export const onShelfId = (id: string) => (p: Prompt): boolean => p.shelfId === id;
export const onShelf = (nameOrId: string) => (p: Prompt): boolean => {
  // Try shelfId first (new format), fall back to shelf name (v1 format)
  if (p.shelfId === nameOrId) return true;
  return p.shelf?.toLowerCase() === nameOrId.toLowerCase();
};

/** How a shelf is ordered. The stash is always newest first. */
export type SortOrder = 'newest' | 'most-used' | 'recent';
export const SORT_ORDERS: readonly SortOrder[] = ['newest', 'most-used', 'recent'];
export const nextSort = (order: SortOrder): SortOrder => SORT_ORDERS[(SORT_ORDERS.indexOf(order) + 1) % SORT_ORDERS.length]!;

/** `prompts` (newest first) in the given order. */
export function sortSaved(prompts: Prompt[], order: SortOrder): Prompt[] {
  if (order === 'most-used') return [...prompts].sort((a, b) => (b.usedCount ?? 0) - (a.usedCount ?? 0));
  if (order === 'recent') return [...prompts].sort((a, b) => (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? ''));
  return prompts;
}
