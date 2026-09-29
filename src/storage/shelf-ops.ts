import { onShelf } from '../domain/prompt.js';
import { findShelf, withOrphans } from '../domain/shelf.js';
import { UserError } from '../errors.js';
import { t, tn } from '../i18n/index.js';
import type { Store } from './prompt-store.js';
import type { Shelves } from './shelf-store.js';

// Shelf changes that touch both files: the shelf list and the prompts that point at a shelf by name.

const plural = (n: number) => tn('cli.shelf.pluralPrompts', n, { count: n });

/** A shelf by name, case-insensitively: one in the shelf file, or one that prompts still point at. */
export async function requireShelf(shelves: Shelves, store: Store, name: string): Promise<{ name: string; saved: boolean }> {
  const saved = await shelves.find(name);
  if (saved) return { name: saved, saved: true };
  const orphan = findShelf(withOrphans([], await store.list()), name);
  if (orphan) return { name: orphan, saved: false };
  throw new UserError(t('cli.shelf.notFoundError', { name }));
}

/** Renames a shelf and moves its prompts along; returns the old and new names. */
export async function renameShelf(shelves: Shelves, store: Store, name: string, to: string): Promise<{ from: string; to: string }> {
  const current = await requireShelf(shelves, store, name);
  const renamed = current.saved ? await shelves.rename(current.name, to) : await shelves.create(to);
  await store.reshelve(current.name, renamed);
  return { from: current.name, to: renamed };
}

/** Deletes a shelf and the prompts on it; without `force`, refuses when it still has prompts. */
export async function deleteShelf(shelves: Shelves, store: Store, name: string, force: boolean): Promise<{ name: string; count: number }> {
  const current = await requireShelf(shelves, store, name);
  const count = (await store.list()).filter(onShelf(current.name)).length;
  if (count && !force) throw new UserError(t('cli.shelf.deleteForce', { name: current.name, count: plural(count) }));
  await store.reshelve(current.name, null);
  if (current.saved) await shelves.remove(current.name);
  return { name: current.name, count };
}

/** The message after a delete: "deleted shelf X" plus how many prompts went with it. */
export const deletedMessage = ({ name, count }: { name: string; count: number }): string =>
  t('cli.shelf.deletedMsg', { name, count: count ? t('cli.shelf.deletedWithPrompts', { count: plural(count) }) : '' });
