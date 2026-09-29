import { isStashDraft, type Prompt } from '../domain/prompt.js';
import { withOrphans } from '../domain/shelf.js';
import { t, tn } from '../i18n/index.js';
import type { Store } from '../storage/prompt-store.js';
import type { Shelves } from '../storage/shelf-store.js';
import type { ListAction } from '../ui/list-panel.js';
import type { PickerAction } from '../ui/save-picker.js';
import type { Status } from '../ui/types.js';

/** What the actions work with; tests pass real stores in a temp folder. */
export interface ActionContext {
  store: Store;
  shelves: Shelves;
  /** Adapter name, stored with each prompt. */
  agent: string;
  cwd: string;
  skillPrompt(name: string, afterText: boolean): string;
}

/** What the app should do after an action, in this order. */
export interface Effect {
  /** Close the open panel. */
  close?: boolean;
  /** Clear the draft that was just saved from the agent's box. */
  clearDraft?: boolean;
  /** Paste this into the agent's box (after what's already there). */
  insert?: string;
  /** Reload the list panel's data. */
  refresh?: boolean;
  /** Then open this shelf's tab. */
  showShelf?: string;
  /** A message: in the panel if it stays open, otherwise as a toast. */
  status?: Status;
}

/** The data the list panel shows: prompts, shelves (including ones only prompts still point at) and stars. */
export async function panelData(ctx: ActionContext): Promise<{ prompts: Prompt[]; shelves: string[]; starred: string[] }> {
  const prompts = await ctx.store.list();
  return { prompts, shelves: withOrphans(await ctx.shelves.list(), prompts), starred: await ctx.shelves.starred() };
}

const gone: Effect = { refresh: true, status: { text: t('actions.changedOtherSession'), error: true } };
const draftsLeft = async (ctx: ActionContext) => (await ctx.store.list()).filter(isStashDraft).length;

/** Carries out a list-panel action. `hasDraft`: the agent's box already had text when the list opened. */
export async function listEffect(ctx: ActionContext, action: ListAction, hasDraft: boolean): Promise<Effect> {
  switch (action.type) {
    case 'close':
      return { close: true };
    case 'pop': {
      if (!(await ctx.store.remove(action.prompt.id))) return gone;
      const left = await draftsLeft(ctx);
      const key = hasDraft ? 'actions.appendedLeft' : 'actions.poppedLeft';
      return { close: true, insert: action.prompt.text, status: { text: t(key, { left }) } };
    }
    case 'use': {
      if (!(await ctx.store.markUsed(action.prompt.id))) return gone;
      const key = action.prompt.shelf
        ? (hasDraft ? 'actions.appendedShelf' : 'actions.keptShelf')
        : (hasDraft ? 'actions.appendedKeptStash' : 'actions.keptStash');
      const params = action.prompt.shelf ? { shelf: action.prompt.shelf } : {};
      return { close: true, insert: action.prompt.text, status: { text: t(key, params) } };
    }
    case 'use-skill':
      return { close: true, insert: ctx.skillPrompt(action.name, hasDraft), status: { text: t('actions.skillInserted', { name: action.name }) } };
    case 'delete':
      return (await ctx.store.remove(action.prompt.id)) ? { refresh: true, status: { text: t('actions.deleted') } } : gone;
    case 'save-to-shelf': {
      // Registers the shelf too, in case another session renamed or deleted it meanwhile.
      const shelf = await ctx.shelves.create(action.shelf);
      if (!(await ctx.store.setShelf(action.prompt.id, shelf))) return gone;
      return { refresh: true, status: { text: t('save.savedTo', { shelf }) } };
    }
    case 'create-shelf': {
      const shelf = await ctx.shelves.create(action.name);
      if (!action.prompt) return { refresh: true, showShelf: shelf, status: { text: t('actions.shelfReady', { name: shelf }) } };
      if (!(await ctx.store.setShelf(action.prompt.id, shelf))) return gone;
      return { refresh: true, status: { text: t('save.savedTo', { shelf }) } };
    }
    case 'star-shelf': {
      const shelf = await ctx.shelves.create(action.shelf);
      const starred = await ctx.shelves.toggleStar(shelf);
      const key = starred ? 'actions.starredShelf' : 'actions.unstarredShelf';
      return { refresh: true, status: { text: t(key, { shelf }) } };
    }
    case 'move-shelf': {
      const moved = await ctx.shelves.move(await ctx.shelves.create(action.shelf), action.step);
      return moved ? { refresh: true } : { status: { text: t(action.step < 0 ? 'actions.alreadyFirst' : 'actions.alreadyLast') } };
    }
    case 'delete-shelf': {
      // Confirmation is handled in the UI
      // Check if shelf exists and use its canonical name, or if it's an orphan, just remove its prompts
      const canonicalName = await ctx.shelves.find(action.shelf);
      if (canonicalName) {
        // Shelf exists in shelves file, delete it normally
        await ctx.shelves.remove(canonicalName);
        return { refresh: true, status: { text: t('cli.shelf.deletedMsg', { name: canonicalName, count: '' }) } };
      }
      // Shelf is an orphan (prompts point to it but it doesn't exist in shelves file)
      // Just remove its prompts by moving them to stash
      const count = await ctx.store.reshelve(action.shelf, null);
      return { refresh: true, status: { text: `deleted ${action.shelf} (${count} prompts moved to stash)` } };
    }
    case 'rename-shelf': {
      // Check if shelf exists first (orphan shelves can't be renamed)
      const exists = await ctx.shelves.find(action.shelf);
      if (!exists) return { status: { text: `can't rename orphan shelf "${action.shelf}" — delete it to move its prompts to stash`, error: true } };
      const newName = await ctx.shelves.rename(action.shelf, action.newName);
      return { refresh: true, status: { text: t('cli.shelf.renamedMsg', { old: action.shelf, new: newName }) } };
    }
    case 'none':
      return {};
  }
}

/** Carries out a save-picker action for the draft `text` read from the agent's box. */
export async function pickerEffect(ctx: ActionContext, action: PickerAction, text: string): Promise<Effect> {
  if (action.type === 'none') return {};
  if (action.type === 'cancel') return { close: true };
  if (action.type === 'delete-shelf') {
    const count = (await ctx.store.list()).filter((p) => p.shelf?.toLowerCase() === action.shelf.toLowerCase()).length;
    if (count > 0) return { status: { text: t('cli.shelf.deleteForce', { name: action.shelf, count: tn('cli.shelf.pluralPrompts', count, { count }) }), error: true } };
    await ctx.shelves.remove(action.shelf);
    return { refresh: true, status: { text: t('cli.shelf.deletedMsg', { name: action.shelf, count: '' }) } };
  }
  const shelf = action.type === 'create-shelf' ? await ctx.shelves.create(action.name) : action.shelf && (await ctx.shelves.create(action.shelf));
  await ctx.store.add({ text, agent: ctx.agent, cwd: ctx.cwd, ...(shelf ? { shelf } : {}) });
  const count = await draftsLeft(ctx);
  const statusText = shelf ? t('save.savedTo', { shelf }) : t('save.stashed', { count });
  return { close: true, clearDraft: true, status: { text: statusText } };
}
