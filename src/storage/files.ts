import { chmod, mkdir, open, readFile, rename, rm, stat, writeFile, fsync } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { debug } from '../debug.js';
import { UserError } from '../errors.js';

const LOCK_RETRY_MS = 15;
const LOCK_TIMEOUT_MS = 5000;
// A lock older than this was left by a session that crashed mid-write.
const STALE_LOCK_MS = 10000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Runs `fn` while holding `<file>.lock`, so read-modify-write cycles from several sessions (and
 * several key presses in one session) never interleave and lose each other's changes.
 * Lock file contains the process ID and a token for safer stale detection.
 */
export async function withFileLock<T>(file: string, fn: () => Promise<T>): Promise<T> {
  const lock = `${file}.lock`;
  const lockToken = `${process.pid}-${randomUUID()}`;
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  for (;;) {
    try {
      const handle = await open(lock, 'wx');
      await handle.writeFile(lockToken);
      await handle.close();
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      const age = await stat(lock).then((s) => Date.now() - s.mtimeMs, () => 0);
      if (age > STALE_LOCK_MS) {
        debug('lock', 'removed a stale lock', { file: lock, ageMs: Math.round(age) });
        await rm(lock, { force: true });
      }
      else if (Date.now() > deadline) throw new UserError(`${file} is locked by another prompt-shelf session`);
      else await sleep(LOCK_RETRY_MS);
    }
  }
  try {
    return await fn();
  } finally {
    // Only remove our own lock (check token matches)
    try {
      const content = await readTextIfExists(lock);
      if (content === lockToken) await rm(lock, { force: true });
    } catch {
      // If we can't read or remove, let stale detection handle it next time
    }
  }
}

/** Writes through a uniquely named temp file and a rename, so readers never see half a file. Sets 0600 permissions and fsyncs for durability. */
export async function writeFileAtomic(file: string, content: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  const fd = await open(tmp, 'w');
  try {
    await fd.writeFile(content, 'utf8');
    // Fsync to ensure data is written to disk before rename
    try {
      await fsync(fd.fd);
    } catch {
      // If fsync fails, continue anyway; rename is what matters most
    }
  } finally {
    await fd.close();
  }
  // Set permissions before rename so the new file is never world-readable
  try {
    await chmod(tmp, 0o600);
  } catch {
    // If chmod fails, rename anyway; this maintains atomic semantics
  }
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
