import type { AgentAdapter } from '../adapters/index.js';
import { UserError } from '../errors.js';
import type { Config } from '../storage/config.js';
import { parseHotkey, type Hotkey } from '../terminal/keys.js';

export interface SessionKeys {
  /** Asks where to save the draft. */
  save: Hotkey;
  /** Opens the list. */
  list: Hotkey;
}

/** The configured hotkeys, checked against each other and the agent's own keys. */
export function sessionKeys(config: Config, adapter: Pick<AgentAdapter, 'name' | 'reservedKeys'>): SessionKeys {
  for (const [spec, fix] of [
    [config.hotkey, 'stash hotkey <key>'],
    [config.listHotkey, 'stash hotkey list <key>'],
  ] as const) {
    if (adapter.reservedKeys.includes(spec.toLowerCase())) throw new UserError(`hotkey ${spec} is reserved by ${adapter.name}; pick another with \`${fix}\``, 2);
  }
  const save = parseHotkey(config.hotkey);
  const list = parseHotkey(config.listHotkey);
  if (save.label === list.label) throw new UserError(`the stash and list hotkeys are both ${save.label}; change one with \`stash hotkey list <key>\``, 2);
  return { save, list };
}
