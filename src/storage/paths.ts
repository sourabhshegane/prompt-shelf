import { homedir } from 'node:os';
import { join } from 'node:path';

/** Where prompt-shelf keeps its files. PROMPT_SHELF_DIR moves them, e.g. for testing. */
export function dataDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.PROMPT_SHELF_DIR || join(homedir(), '.prompt-shelf');
}

export const stashDir = dataDir();
/** Every prompt, drafts and shelved ones (the file name predates shelves). */
export const promptsFile = join(stashDir, 'stash.jsonl');
export const shelvesFile = join(stashDir, 'shelves.json');
export const configFile = join(stashDir, 'config.json');
