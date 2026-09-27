import { readTextIfExists, withFileLock, writeFileAtomic } from './files.js';
import type { Prompt } from './prompt-store.js';

/** Names the list panel uses for its own tabs, so no shelf can take them. */
const RESERVED = ['stash', 'skills'];
const MAX_NAME = 30;
/** What a new user starts with, until they create, rename, star, move or delete a shelf. */
const DEFAULT_SHELVES = ['Ideas', 'To explore', 'Common'];

interface ShelfFile {
  shelves: string[];
  starred: string[];
}

/** The user's shelves in their chosen order, and which are starred. Prompts point at a shelf by name. */
export class Shelves {
  constructor(private readonly filePath: string) {}

  // A missing file means the defaults; a damaged one is an error, so a save can't silently wipe it.
  private async read(): Promise<ShelfFile> {
    const raw = await readTextIfExists(this.filePath);
    if (raw === null) return { shelves: [...DEFAULT_SHELVES], starred: [] };
    let parsed: Partial<Record<keyof ShelfFile, unknown>>;
    try {
      parsed = JSON.parse(raw) as typeof parsed;
    } catch {
      throw new Error(`${this.filePath} is damaged; fix or delete it (your prompts are safe in the stash file)`);
    }
    const names = (v: unknown) => (Array.isArray(v) ? v.filter((n): n is string => typeof n === 'string') : []);
    const shelves = names(parsed.shelves);
    // Spread first so fields a newer version added survive this version's saves.
    return { ...parsed, shelves, starred: names(parsed.starred).filter((n) => shelves.includes(n)) };
  }

  // Read, change and save under a lock, so sessions and quick key presses never lose each other's changes.
  private async change<T>(edit: (file: ShelfFile) => T): Promise<T> {
    return withFileLock(this.filePath, async () => {
      const file = await this.read();
      const result = edit(file);
      await writeFileAtomic(this.filePath, JSON.stringify(file, null, 2) + '\n');
      return result;
    });
  }

  /** Shelves in display order: starred ones first, each group in the user's order. */
  async list(): Promise<string[]> {
    const { shelves, starred } = await this.read();
    return [...shelves.filter((n) => starred.includes(n)), ...shelves.filter((n) => !starred.includes(n))];
  }

  async starred(): Promise<string[]> {
    return (await this.read()).starred;
  }

  /** The stored spelling of a shelf name, matched case-insensitively. */
  async find(name: string): Promise<string | undefined> {
    return findIn((await this.read()).shelves, name);
  }

  /** Adds a shelf and returns its name; an existing shelf with that name is returned as is. */
  async create(name: string): Promise<string> {
    const clean = validName(name);
    return this.change((file) => {
      const existing = findIn(file.shelves, clean);
      if (existing) return existing;
      file.shelves.push(clean);
      return clean;
    });
  }

  async rename(from: string, to: string): Promise<string> {
    const clean = validName(to);
    return this.change((file) => {
      const current = requireIn(file.shelves, from);
      const clash = findIn(file.shelves, clean);
      if (clash && clash !== current) throw new Error(`a shelf named "${clash}" already exists`);
      const swap = (n: string) => (n === current ? clean : n);
      file.shelves = file.shelves.map(swap);
      file.starred = file.starred.map(swap);
      return clean;
    });
  }

  async remove(name: string): Promise<void> {
    await this.change((file) => {
      const current = requireIn(file.shelves, name);
      file.shelves = file.shelves.filter((n) => n !== current);
      file.starred = file.starred.filter((n) => n !== current);
    });
  }

  /** Stars or unstars a shelf; returns whether it is starred now. */
  async toggleStar(name: string): Promise<boolean> {
    return this.change((file) => {
      const current = requireIn(file.shelves, name);
      const starred = !file.starred.includes(current);
      file.starred = starred ? [...file.starred, current] : file.starred.filter((n) => n !== current);
      return starred;
    });
  }

  /**
   * Moves a shelf one place left (-1) or right (1) in the display order. Starred and other shelves
   * stay in their own groups, so a move never crosses between them. Returns whether it moved.
   */
  async move(name: string, step: -1 | 1): Promise<boolean> {
    return this.change((file) => {
      const current = requireIn(file.shelves, name);
      const group = file.shelves.filter((n) => file.starred.includes(n) === file.starred.includes(current));
      const neighbour = group[group.indexOf(current) + step];
      if (!neighbour) return false;
      const a = file.shelves.indexOf(current);
      const b = file.shelves.indexOf(neighbour);
      [file.shelves[a], file.shelves[b]] = [file.shelves[b]!, file.shelves[a]!];
      return true;
    });
  }
}

const findIn = (shelves: string[], name: string) => shelves.find((n) => n.toLowerCase() === name.trim().toLowerCase());

function requireIn(shelves: string[], name: string): string {
  const found = findIn(shelves, name);
  if (!found) throw new Error(`no shelf named "${name}"`);
  return found;
}

/**
 * Shelf names to show: the saved ones, plus any shelf that prompts still point at but the shelf file
 * doesn't list (e.g. after a rename was interrupted), so those prompts never become invisible.
 */
export function withOrphans(shelves: string[], prompts: Prompt[]): string[] {
  const all = [...shelves];
  for (const p of prompts) if (p.shelf && !findIn(all, p.shelf)) all.push(p.shelf);
  return all;
}

export function validName(name: string): string {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (!clean) throw new Error('a shelf needs a name');
  if ([...clean].length > MAX_NAME) throw new Error(`shelf names can be at most ${MAX_NAME} characters`);
  if (RESERVED.includes(clean.toLowerCase())) throw new Error(`"${clean}" is reserved; pick another name`);
  return clean;
}
