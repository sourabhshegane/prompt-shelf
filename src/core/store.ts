import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export interface StashEntry {
  id: string;
  text: string;
  agent: string;
  cwd: string;
  createdAt: string;
}

export class Store {
  constructor(private readonly filePath: string) {}

  async list(): Promise<StashEntry[]> {
    const raw = await readFile(this.filePath, 'utf8').catch(() => '');
    const entries: StashEntry[] = [];
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try {
        entries.push(JSON.parse(line) as StashEntry);
      } catch {
        continue;
      }
    }
    return entries.reverse();
  }

  async add(input: { text: string; agent: string; cwd: string }): Promise<StashEntry> {
    const entry: StashEntry = { id: randomUUID(), createdAt: new Date().toISOString(), ...input };
    await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
    await appendFile(this.filePath, JSON.stringify(entry) + '\n', 'utf8');
    return entry;
  }

  async remove(id: string): Promise<boolean> {
    const entries = await this.list();
    const kept = entries.filter((e) => e.id !== id);
    if (kept.length === entries.length) return false;
    await this.rewrite(kept.reverse());
    return true;
  }

  private async rewrite(entriesOldestFirst: StashEntry[]): Promise<void> {
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
    await writeFile(tmp, entriesOldestFirst.map((e) => JSON.stringify(e)).join('\n') + (entriesOldestFirst.length ? '\n' : ''), 'utf8');
    await rename(tmp, this.filePath);
  }
}
