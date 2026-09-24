import type { AgentAdapter } from './types.js';
import { claudeAdapter } from './claude.js';
import { codexAdapter } from './codex.js';

const registry = new Map<string, AgentAdapter>([
  [claudeAdapter.name, claudeAdapter],
  [codexAdapter.name, codexAdapter],
]);

export const adapterNames = [...registry.keys()];
export const getAdapter = (name: string): AgentAdapter | undefined => registry.get(name);
export const reservedBy = (hotkey: string): string[] =>
  [...registry.values()].filter((a) => a.reservedKeys.includes(hotkey.toLowerCase())).map((a) => a.name);
export type { AgentAdapter, Draft } from './types.js';
