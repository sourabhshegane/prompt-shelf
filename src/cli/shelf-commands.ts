import { onShelf } from '../domain/prompt.js';
import { findShelf, withOrphans } from '../domain/shelf.js';
import { UserError } from '../errors.js';
import type { Store } from '../storage/prompt-store.js';
import type { Shelves } from '../storage/shelf-store.js';
import type { ShelfAction } from './args.js';

// `stash shelves` and `stash shelf new | rename | star | rm`.

const plural = (n: number) => `${n} prompt${n === 1 ? '' : 's'}`;

/** A shelf by name, case-insensitively: one in the shelf file, or one that prompts still point at. */
export async function requireShelf(shelves: Shelves, store: Store, name: string): Promise<{ name: string; saved: boolean }> {
  const saved = await shelves.find(name);
  if (saved) return { name: saved, saved: true };
  const orphan = findShelf(withOrphans([], await store.list()), name);
  if (orphan) return { name: orphan, saved: false };
  throw new UserError(`no shelf named "${name}" — stash shelves lists them`);
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
  if (!first) throw new UserError(`usage: stash shelf ${cmd.action} <name>${cmd.action === 'rename' ? ' <new name>' : ''}`, 2);
  if (cmd.action === 'new') return `shelf ${await shelves.create(first)} is ready`;
  const current = await requireShelf(shelves, store, first);
  if (cmd.action === 'star') {
    if (!current.saved) await shelves.create(current.name);
    return `${(await shelves.toggleStar(current.name)) ? 'starred' : 'unstarred'} ${current.name}`;
  }
  if (cmd.action === 'rename') {
    if (!second) throw new UserError('usage: stash shelf rename <old> <new>', 2);
    const renamed = current.saved ? await shelves.rename(current.name, second) : await shelves.create(second);
    await store.reshelve(current.name, renamed);
    return `renamed ${current.name} to ${renamed}`;
  }
  const count = (await store.list()).filter(onShelf(current.name)).length;
  if (count && !cmd.force) throw new UserError(`shelf ${current.name} has ${plural(count)}; add --force to delete them too`);
  await store.reshelve(current.name, null);
  if (current.saved) await shelves.remove(current.name);
  return `deleted shelf ${current.name}${count ? ` and its ${plural(count)}` : ''}`;
}
