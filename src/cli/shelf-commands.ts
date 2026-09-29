import { onShelf } from '../domain/prompt.js';
import { findShelf, withOrphans } from '../domain/shelf.js';
import { t, tn } from '../i18n/index.js';
import { UserError } from '../errors.js';
import type { Store } from '../storage/prompt-store.js';
import type { Shelves } from '../storage/shelf-store.js';
import type { ShelfAction } from './args.js';

// `stash shelves` and `stash shelf new | rename | star | rm`.

const plural = (n: number) => tn('cli.shelf.pluralPrompts', n, { count: n });

/** A shelf by name, case-insensitively: one in the shelf file, or one that prompts still point at. */
export async function requireShelf(shelves: Shelves, store: Store, name: string): Promise<{ name: string; saved: boolean }> {
  const saved = await shelves.find(name);
  if (saved) return { name: saved, saved: true };
  const orphan = findShelf(withOrphans([], await store.list()), name);
  if (orphan) return { name: orphan, saved: false };
  throw new UserError(t('cli.shelf.notFoundError', { name }));
}

/** Each shelf with its prompt count, starred first. */
export async function shelfLines(shelves: Shelves, store: Store): Promise<string[]> {
  const prompts = await store.list();
  const starred = await shelves.starred();
  return withOrphans(await shelves.list(), prompts).map((name) => `${starred.includes(name) ? '★ ' : '  '}${name} (${prompts.filter(onShelf(name)).length})`);
}

/** Runs a shelf command and returns what to tell the user. */
export async function runShelfCommand(cmd: { action: ShelfAction; names: string[]; force: boolean }, shelves: Shelves, store: Store): Promise<string> {
  const [first, second] = cmd.names;
  const rename = cmd.action === 'rename' ? ' <new name>' : '';
  if (!first) throw new UserError(t('cli.shelf.usageError', { action: cmd.action, rename }), 2);
  if (cmd.action === 'new') return t('cli.shelf.readyMsg', { name: await shelves.create(first) });
  const current = await requireShelf(shelves, store, first);
  if (cmd.action === 'star') {
    if (!current.saved) await shelves.create(current.name);
    const starred = await shelves.toggleStar(current.name);
    return starred ? t('cli.shelf.starredMsg', { name: current.name }) : t('cli.shelf.unstarredMsg', { name: current.name });
  }
  if (cmd.action === 'rename') {
    if (!second) throw new UserError(t('cli.shelf.usageRenameError'), 2);
    const renamed = current.saved ? await shelves.rename(current.name, second) : await shelves.create(second);
    await store.reshelve(current.name, renamed);
    return t('cli.shelf.renamedMsg', { old: current.name, new: renamed });
  }
  const count = (await store.list()).filter(onShelf(current.name)).length;
  if (count && !cmd.force) throw new UserError(t('cli.shelf.deleteForce', { name: current.name, count: plural(count) }));
  await store.reshelve(current.name, null);
  if (current.saved) await shelves.remove(current.name);
  const countMsg = count ? t('cli.shelf.deletedWithPrompts', { count: plural(count) }) : '';
  return t('cli.shelf.deletedMsg', { name: current.name, count: countMsg });
}
