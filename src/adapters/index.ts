import type { AgentAdapter } from './types.js';
import { claudeAdapter } from './claude.js';
import { codexAdapter } from './codex.js';

// The supported agents. Adding one is a new file in this folder plus one line here.
const adapters: readonly AgentAdapter[] = [claudeAdapter, codexAdapter];

export const allAdapters = (): readonly AgentAdapter[] => adapters;
export const adapterNames = adapters.map((a) => a.name);
export const getAdapter = (name: string): AgentAdapter | undefined => adapters.find((a) => a.name === name);
/** The agents that use `hotkey` themselves. */
export const reservedBy = (hotkey: string): string[] => adapters.filter((a) => a.reservedKeys.includes(hotkey.toLowerCase())).map((a) => a.name);
export type { AgentAdapter, Draft } from './types.js';
