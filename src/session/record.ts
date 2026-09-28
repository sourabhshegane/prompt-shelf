import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Screen } from '../terminal/screen.js';

/**
 * `stash --record`: saves what the screen shows, for writing and testing adapters. The .txt is
 * what an adapter reads; the .ans keeps colours and faint text, which the .txt drops.
 */
export async function recordScreen(screen: Screen, dir: string, agent: string): Promise<string> {
  await screen.write('');
  const base = join(dir, `record-${agent}-${Date.now()}`);
  await writeFile(`${base}.txt`, screen.lines().join('\n') + `\n--- cursor ${JSON.stringify(screen.cursor())}\n`);
  await writeFile(`${base}.ans`, screen.serialize());
  return `${base}.txt`;
}
