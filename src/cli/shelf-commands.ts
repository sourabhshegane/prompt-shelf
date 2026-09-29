import { onShelf } from '../domain/prompt.js';
import { withOrphans } from '../domain/shelf.js';
import { t } from '../i18n/index.js';
import { UserError } from '../errors.js';
import type { Store } from '../storage/prompt-store.js';
import type { Shelves } from '../storage/shelf-store.js';
import { deletedMessage, deleteShelf, renameShelf, requireShelf } from '../storage/shelf-ops.js';
import type { ShelfAction } from './args.js';

// `stash shelves` and `stash shelf new | rename | star | rm`.

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
  if (cmd.action === 'star') {
    const current = await requireShelf(shelves, store, first);
    if (!current.saved) await shelves.create(current.name);
    const starred = await shelves.toggleStar(current.name);
    return starred ? t('cli.shelf.starredMsg', { name: current.name }) : t('cli.shelf.unstarredMsg', { name: current.name });
  }
  if (cmd.action === 'rename') {
    if (!second) throw new UserError(t('cli.shelf.usageRenameError'), 2);
    const { from, to } = await renameShelf(shelves, store, first, second);
    return t('cli.shelf.renamedMsg', { old: from, new: to });
  }
  return deletedMessage(await deleteShelf(shelves, store, first, cmd.force));
}
