import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';

export const stashDir = join(homedir(), '.prompt-shelf');
export const stashFile = join(stashDir, 'stash.jsonl');
export const configFile = join(stashDir, 'config.json');

export interface Config {
  /** Stashes the box, or opens the list when the box is empty. */
  hotkey: string;
  /** Always opens the list and never stashes; a picked entry is appended to what is in the box. */
  listHotkey: string;
}

const defaults: Config = { hotkey: 'ctrl+f', listHotkey: 'ctrl+q' };

async function readRaw(filePath: string): Promise<Record<string, unknown>> {
  const raw = await readFile(filePath, 'utf8').catch(() => '');
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
  const merged = { ...(await readRaw(filePath)), ...partial };
  await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });
  const tmp = `${filePath}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(merged, null, 2) + '\n');
  await rename(tmp, filePath);
}
