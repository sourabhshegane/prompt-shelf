import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { allAdapters, reservedBy } from '../adapters/index.js';
import { debugLogFile } from '../debug.js';
import { UserError } from '../errors.js';
import { loadConfig, saveConfig } from '../storage/config.js';
import { configFile, stashDir } from '../storage/paths.js';
import { findRealBinary, shimDir, shimDirOnPath } from '../system/binaries.js';
import { pathHint } from '../system/shims.js';
import { parseHotkey } from '../terminal/keys.js';

// `stash hotkey` and `stash doctor`.

/** Shows the hotkeys, or sets one (`list`: the list hotkey) after checking it can be used. */
export async function runHotkeyCommand(spec: string | undefined, filePath = configFile, list = false): Promise<string> {
  const config = await loadConfig(filePath);
  if (spec === undefined) return list ? `list hotkey: ${config.listHotkey}` : `hotkey: ${config.hotkey}\nlist hotkey: ${config.listHotkey}`;
  const { label } = parseHotkey(spec);
  const owners = reservedBy(label);
  if (owners.length) throw new UserError(`${label} is reserved by ${owners.join(', ')}; pick another`);
  const other = list ? config.hotkey : config.listHotkey;
  if (label === other) throw new UserError(`${label} is already the ${list ? 'stash' : 'list'} hotkey; pick another`);
  await saveConfig(list ? { listHotkey: label } : { hotkey: label }, filePath);
  return `${list ? 'list hotkey' : 'hotkey'} set to ${label} — takes effect in new sessions`;
}

/** What's installed where, for bug reports and for fixing a setup. */
export function doctorLines(version: string): string[] {
  const onPath = shimDirOnPath();
  const debugLog = debugLogFile();
  const lines = [
    `prompt-shelf ${version} · node ${process.version} · ${process.platform}`,
    `data: ${stashDir}`,
    `debug log: ${debugLog ?? 'off (PROMPT_SHELF_DEBUG=1 turns it on)'}`,
    `shim dir: ${shimDir}`,
    `on PATH: ${onPath ? 'yes' : 'no'}`,
  ];
  for (const { command } of allAdapters()) {
    const shimmed = existsSync(join(shimDir, command)) || existsSync(join(shimDir, `${command}.cmd`));
    lines.push(`${command}: shim ${shimmed ? 'installed' : 'missing'}, real binary ${findRealBinary(command) ?? 'not found'}`);
  }
  if (!onPath) lines.push(`fix: ${pathHint()}`);
  return lines;
}
