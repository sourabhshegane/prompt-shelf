import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { dataDir } from './storage/paths.js';

// A debug log for bug reports, off unless PROMPT_SHELF_DEBUG is set: `=1` writes to debug.log in
// the data folder, any other value is a file path. It never goes to the screen (the agent owns it)
// and never contains prompt text, only sizes and states.

/** The log file in use, or null when debugging is off. */
export function debugLogFile(env: NodeJS.ProcessEnv = process.env): string | null {
  const setting = env.PROMPT_SHELF_DEBUG;
  if (!setting || setting === '0') return null;
  return setting === '1' || setting.toLowerCase() === 'true' ? join(dataDir(env), 'debug.log') : setting;
}

const file = debugLogFile();

/** Appends one line (synchronously, so it survives a crash). `area` groups lines, e.g. `keys`, `draft`. */
export function debug(area: string, message: string, data?: Record<string, unknown>): void {
  if (!file) return;
  try {
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, `${new Date().toISOString()} ${area} ${message}${data ? ' ' + JSON.stringify(data) : ''}\n`);
  } catch {
    // Logging must never break a session.
  }
}
