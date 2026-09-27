import type { OverlayAction, Status } from '../ui/list-panel.js';
import type { PickerAction } from '../ui/save-picker.js';
import { withOrphans, type Shelves } from '../storage/shelf-store.js';
import { isStashDraft, type Prompt, type Store } from '../storage/prompt-store.js';

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

const gone: Effect = { refresh: true, status: { text: 'that prompt was changed in another session', error: true } };
const draftsLeft = async (ctx: ActionContext) => (await ctx.store.list()).filter(isStashDraft).length;

/** Carries out a list-panel action. `hasDraft`: the agent's box already had text when the list opened. */
export async function overlayEffect(ctx: ActionContext, action: OverlayAction, hasDraft: boolean): Promise<Effect> {
  switch (action.type) {
    case 'close':
      return { close: true };
    case 'pop': {
      if (!(await ctx.store.remove(action.prompt.id))) return gone;
      const left = await draftsLeft(ctx);
      return { close: true, insert: action.prompt.text, status: { text: `${hasDraft ? 'appended' : 'popped'} · ${left} left` } };
    }
    case 'use': {
      if (!(await ctx.store.markUsed(action.prompt.id))) return gone;
      const kept = action.prompt.shelf ? `kept on ${action.prompt.shelf}` : 'kept in stash';
      return { close: true, insert: action.prompt.text, status: { text: `${hasDraft ? 'appended' : 'used'} · ${kept}` } };
    }
    case 'use-skill':
      return { close: true, insert: ctx.skillPrompt(action.name, hasDraft), status: { text: `skill: ${action.name}` } };
    case 'delete':
      return (await ctx.store.remove(action.prompt.id)) ? { refresh: true, status: { text: 'deleted' } } : gone;
    case 'save-to-shelf': {
      // Registers the shelf too, in case another session renamed or deleted it meanwhile.
      const shelf = await ctx.shelves.create(action.shelf);
      if (!(await ctx.store.setShelf(action.prompt.id, shelf))) return gone;
      return { refresh: true, status: { text: `saved to ${shelf}` } };
    }
    case 'create-shelf': {
      const shelf = await ctx.shelves.create(action.name);
      if (!action.prompt) return { refresh: true, showShelf: shelf, status: { text: `shelf ${shelf} is ready` } };
      if (!(await ctx.store.setShelf(action.prompt.id, shelf))) return gone;
      return { refresh: true, status: { text: `saved to ${shelf}` } };
    }
    case 'star-shelf': {
      const shelf = await ctx.shelves.create(action.shelf);
      const starred = await ctx.shelves.toggleStar(shelf);
      return { refresh: true, status: { text: `${starred ? 'starred' : 'unstarred'} ${shelf}` } };
    }
    case 'move-shelf': {
      const moved = await ctx.shelves.move(await ctx.shelves.create(action.shelf), action.step);
      return moved ? { refresh: true } : { status: { text: action.step < 0 ? 'already first' : 'already last' } };
    }
    case 'none':
      return {};
  }
}

/** Carries out a save-picker action for the draft `text` read from the agent's box. */
export async function pickerEffect(ctx: ActionContext, action: PickerAction, text: string): Promise<Effect> {
  if (action.type === 'none') return {};
  if (action.type === 'cancel') return { close: true };
  const shelf = action.type === 'create-shelf' ? await ctx.shelves.create(action.name) : action.shelf && (await ctx.shelves.create(action.shelf));
  await ctx.store.add({ text, agent: ctx.agent, cwd: ctx.cwd, ...(shelf ? { shelf } : {}) });
  return { close: true, clearDraft: true, status: { text: shelf ? `saved to ${shelf}` : `stashed (${await draftsLeft(ctx)})` } };
}
