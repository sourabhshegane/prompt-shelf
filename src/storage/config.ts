import { configFile } from './paths.js';
import { readTextIfExists, withFileLock, writeFileAtomic } from './files.js';

export interface Config {
  /** Asks where to save what is in the box (the stash, or a shelf). */
  hotkey: string;
  /** Opens the list; a picked prompt is added after what is in the box. */
  listHotkey: string;
}

/** The only place the default hotkeys are written down. */
export const DEFAULT_CONFIG: Readonly<Config> = { hotkey: 'ctrl+f', listHotkey: 'ctrl+q' };

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
  return { ...DEFAULT_CONFIG, ...(raw as Partial<Config>) };
}

/** Merges `partial` into the file, keeping keys this version doesn't know about. */
export async function saveConfig(partial: Partial<Config>, filePath = configFile): Promise<void> {
  await withFileLock(filePath, async () => {
    const merged = { ...(await readRaw(filePath)), ...partial };
    await writeFileAtomic(filePath, JSON.stringify(merged, null, 2) + '\n');
  });
}
