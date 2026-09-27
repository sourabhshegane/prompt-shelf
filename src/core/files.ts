import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';

const LOCK_RETRY_MS = 15;
const LOCK_TIMEOUT_MS = 5000;
// A lock older than this was left by a session that crashed mid-write.
const STALE_LOCK_MS = 10000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Runs `fn` while holding `<file>.lock`, so read-modify-write cycles from several sessions (and
 * several key presses in one session) never interleave and lose each other's changes.
 */
export async function withFileLock<T>(file: string, fn: () => Promise<T>): Promise<T> {
  const lock = `${file}.lock`;
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  for (;;) {
    try {
      await (await open(lock, 'wx')).close();
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      const age = await stat(lock).then((s) => Date.now() - s.mtimeMs, () => 0);
      if (age > STALE_LOCK_MS) await rm(lock, { force: true });
      else if (Date.now() > deadline) throw new Error(`${file} is locked by another prompt-shelf session`);
      else await sleep(LOCK_RETRY_MS);
    }
  }
  try {
    return await fn();
  } finally {
    await rm(lock, { force: true });
  }
}

/** Writes through a uniquely named temp file and a rename, so readers never see half a file. */
export async function writeFileAtomic(file: string, content: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tmp, content, 'utf8');
  await rename(tmp, file);
}

/** A file's text, or null when it doesn't exist; any other read error is thrown. */
export async function readTextIfExists(file: string): Promise<string | null> {
  try {
    return await readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}
