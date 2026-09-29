import { appendFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { onShelf, type Prompt } from '../domain/prompt.js';
import { readTextIfExists, withFileLock, writeFileAtomic } from './files.js';
import { UserError } from '../errors.js';

// Version 1: initial format with prompts as JSON lines (no header)
// Version 2: header line with version field, forward-compatible
const FILE_VERSION = 2;

interface FileHeader {
  version: number;
}

const isFileHeader = (value: unknown): value is FileHeader => {
  const v = value as Record<string, unknown> | null;
  return typeof v === 'object' && v !== null && typeof v.version === 'number';
};

const isPrompt = (value: unknown): value is Prompt => {
  const v = value as Record<string, unknown> | null;
  return (
    typeof v === 'object' &&
    v !== null &&
    ['id', 'text', 'agent', 'cwd', 'createdAt'].every((k) => typeof v[k] === 'string') &&
    (v.shelf === undefined || typeof v.shelf === 'string')
  );
};

/** One JSON line per prompt, oldest first. Every change happens under a lock shared by all sessions. */
export class Store {
  constructor(private readonly filePath: string) {}

  /** Prompts, oldest first, plus lines that aren't prompts; those are kept verbatim on every rewrite. */
  private async read(): Promise<{ prompts: Prompt[]; unreadable: string[]; version: number }> {
    const raw = (await readTextIfExists(this.filePath)) ?? '';
    const prompts: Prompt[] = [];
    const unreadable: string[] = [];
    let version = 1;
    const lines = raw.split('\n');
    let startIdx = 0;

    // Check if first line is a header (version 2+)
    if (lines.length > 0 && lines[0]) {
      try {
        const firstParsed = JSON.parse(lines[0]);
        if (isFileHeader(firstParsed)) {
          version = firstParsed.version;
          if (version > FILE_VERSION) throw new UserError(`${this.filePath} is from a newer version (v${version}); upgrade prompt-shelf`);
          startIdx = 1;
        }
      } catch (err) {
        // If it's not a header, treat as version 1 (prompts start from line 0)
        if (!(err instanceof UserError)) startIdx = 0;
        else throw err;
      }
    }

    for (let i = startIdx; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        unreadable.push(line);
        continue;
      }
      if (isPrompt(parsed)) prompts.push(parsed);
      else unreadable.push(line);
    }
    return { prompts, unreadable, version };
  }

  /** Newest first. */
  async list(): Promise<Prompt[]> {
    return (await this.read()).prompts.reverse();
  }

  async add(input: { text: string; agent: string; cwd: string; shelf?: string }): Promise<Prompt> {
    const { shelf, ...rest } = input;
    const prompt: Prompt = { id: randomUUID(), createdAt: new Date().toISOString(), ...rest, ...(shelf ? { shelf } : {}) };
    await withFileLock(this.filePath, async () => {
      // Ensure the file has a header (version 2 format)
      const raw = (await readTextIfExists(this.filePath)) ?? '';
      if (!raw || (!raw.includes('"version"') && raw.trim() === '')) {
        // File is empty or only has prompts (version 1), rewrite with header
        const { prompts, unreadable } = await this.read();
        const header = JSON.stringify({ version: FILE_VERSION });
        const lines = [header, ...unreadable, ...prompts.map((e) => JSON.stringify(e)), JSON.stringify(prompt)];
        await writeFileAtomic(this.filePath, lines.join('\n') + '\n');
      } else {
        // File has header or is a v1 file with content, just append
        await appendFile(this.filePath, JSON.stringify(prompt) + '\n', 'utf8');
      }
    });
    return prompt;
  }

  async remove(id: string): Promise<boolean> {
    return this.change((prompts) => {
      const i = prompts.findIndex((e) => e.id === id);
      if (i < 0) return false;
      prompts.splice(i, 1);
      return true;
    });
  }

  /** Moves a prompt onto a shelf; null when the prompt no longer exists (e.g. deleted in another session). */
  async setShelf(id: string, shelf: string): Promise<Prompt | null> {
    return this.change((prompts) => {
      const prompt = prompts.find((e) => e.id === id);
      if (prompt) prompt.shelf = shelf;
      return prompt ?? null;
    });
  }

  /** Counts one use of a prompt that stays saved. */
  async markUsed(id: string, at = new Date()): Promise<Prompt | null> {
    return this.change((prompts) => {
      const prompt = prompts.find((e) => e.id === id);
      if (!prompt) return null;
      prompt.usedCount = (prompt.usedCount ?? 0) + 1;
      prompt.lastUsedAt = at.toISOString();
      return prompt;
    });
  }

  /** Moves every prompt on shelf `from` to shelf `to`, or deletes them when `to` is null. */
  async reshelve(from: string, to: string | null): Promise<number> {
    return this.change((prompts) => {
      const matches = prompts.filter(onShelf(from));
      if (to === null) prompts.splice(0, prompts.length, ...prompts.filter((e) => !onShelf(from)(e)));
      else for (const e of matches) e.shelf = to;
      return matches.length;
    });
  }

  // Read, change in place and write back, all under the lock. The file is only rewritten when
  // `edit` reports it changed something (a truthy result, or a count above zero).
  private async change<T>(edit: (prompts: Prompt[]) => T): Promise<T> {
    return withFileLock(this.filePath, async () => {
      const { prompts, unreadable } = await this.read();
      const result = edit(prompts);
      if (result) {
        const header = JSON.stringify({ version: FILE_VERSION });
        const lines = [header, ...unreadable, ...prompts.map((e) => JSON.stringify(e))];
        await writeFileAtomic(this.filePath, lines.length ? lines.join('\n') + '\n' : '');
      }
      return result;
    });
  }
}
