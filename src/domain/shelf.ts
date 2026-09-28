import { UserError } from '../errors.js';
import type { Prompt } from './prompt.js';

// Rules for shelf names. Shelves are matched by name, ignoring case.

/** Names the list panel uses for its own tabs, so no shelf can take them. */
export const RESERVED_SHELF_NAMES = ['stash', 'skills'];
export const MAX_SHELF_NAME = 30;
/** What a new user starts with, until they create, rename, star, move or delete a shelf. */
export const DEFAULT_SHELVES = ['Ideas', 'To explore', 'Common'];

/** The spelling stored in `shelves` of `name`, matched case-insensitively. */
export const findShelf = (shelves: string[], name: string): string | undefined =>
  shelves.find((n) => n.toLowerCase() === name.trim().toLowerCase());

/** `name` tidied (trimmed, single spaces); throws when it can't be a shelf name. */
export function validName(name: string): string {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (!clean) throw new UserError('a shelf needs a name');
  if ([...clean].length > MAX_SHELF_NAME) throw new UserError(`shelf names can be at most ${MAX_SHELF_NAME} characters`);
  if (RESERVED_SHELF_NAMES.includes(clean.toLowerCase())) throw new UserError(`"${clean}" is reserved; pick another name`);
  return clean;
}

/**
 * Shelf names to show: the saved ones, plus any shelf that prompts still point at but the shelf file
 * doesn't list (e.g. after a rename was interrupted), so those prompts never become invisible.
 */
export function withOrphans(shelves: string[], prompts: Prompt[]): string[] {
  const all = [...shelves];
  for (const p of prompts) if (p.shelf && !findShelf(all, p.shelf)) all.push(p.shelf);
  return all;
}
