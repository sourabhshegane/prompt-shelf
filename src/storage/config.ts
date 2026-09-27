import { homedir } from 'node:os';
import { join } from 'node:path';
import { readTextIfExists, withFileLock, writeFileAtomic } from './files.js';

// PROMPT_SHELF_DIR keeps the stash, shelves and settings somewhere else, e.g. for testing.
export const stashDir = process.env.PROMPT_SHELF_DIR || join(homedir(), '.prompt-shelf');
export const stashFile = join(stashDir, 'stash.jsonl');
export const configFile = join(stashDir, 'config.json');
export const shelvesFile = join(stashDir, 'shelves.json');

export interface Config {
  /** Asks where to save what is in the box (the stash, or a shelf). */
  hotkey: string;
  /** Opens the list; a picked prompt is added after what is in the box. */
  listHotkey: string;
}

const defaults: Config = { hotkey: 'ctrl+f', listHotkey: 'ctrl+q' };

async function readRaw(filePath: string): Promise<Record<string, unknown>> {
  const raw = await readTextIfExists(filePath);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function loadConfig(filePath = configFile): Promise<Config> {
  const raw = await readRaw(filePath);
  return { ...defaults, ...(raw as Partial<Config>) };
}

export async function saveConfig(partial: Partial<Config>, filePath = configFile): Promise<void> {
  await withFileLock(filePath, async () => {
    const merged = { ...(await readRaw(filePath)), ...partial };
    await writeFileAtomic(filePath, JSON.stringify(merged, null, 2) + '\n');
  });
}
