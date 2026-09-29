import { randomUUID } from 'node:crypto';
import { UserError } from '../errors.js';
import { readTextIfExists, withFileLock, writeFileAtomic } from './files.js';
import { DEFAULT_SHELVES, findShelf, validName } from '../domain/shelf.js';

const FILE_VERSION = 2;

interface Shelf {
  id: string;
  name: string;
}

interface ShelfFile {
  version: number;
  shelves: Shelf[];
  starred: string[]; // Shelf IDs, not names
}

/** The user's shelves in their chosen order, and which are starred. Prompts point at a shelf by name. */
export class Shelves {
  constructor(private readonly filePath: string) {}

  // A missing file means the defaults; a damaged one is an error, so a save can't silently wipe it.
  private async read(): Promise<ShelfFile> {
    const raw = await readTextIfExists(this.filePath);
    if (raw === null) {
      const defaults = DEFAULT_SHELVES.map((name) => ({ id: randomUUID(), name }));
      return { version: FILE_VERSION, shelves: defaults, starred: [] };
    }
    let parsed: Partial<Record<keyof ShelfFile, unknown>>;
    try {
      parsed = JSON.parse(raw) as typeof parsed;
    } catch {
      throw new UserError(`${this.filePath} is damaged; fix or delete it (your prompts are safe in the stash file)`);
    }
    const version = typeof parsed.version === 'number' ? parsed.version : 1;
    if (version > FILE_VERSION) throw new UserError(`${this.filePath} is from a newer version (v${version}); upgrade prompt-shelf`);

    // Migrate from version 1 (string names) to version 2 (Shelf objects with IDs)
    let shelves: Shelf[];
    if (version === 1 && Array.isArray(parsed.shelves) && typeof parsed.shelves[0] === 'string') {
      shelves = (parsed.shelves as string[]).map((name) => ({ id: randomUUID(), name }));
    } else {
      const isShelves = (v: unknown): v is Shelf[] => Array.isArray(v) && v.every((s) => typeof s === 'object' && s !== null && typeof (s as any).id === 'string' && typeof (s as any).name === 'string');
      shelves = isShelves(parsed.shelves) ? parsed.shelves : [];
    }

    const starred = (v: unknown) => (Array.isArray(v) ? v.filter((id): id is string => typeof id === 'string') : []);
    const starredIds = starred(parsed.starred).filter((id) => shelves.some((s) => s.id === id));

    // Spread first so fields a newer version added survive this version's saves.
    return { ...parsed, version: FILE_VERSION, shelves, starred: starredIds };
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

  /** Shelf names in display order: starred ones first, each group in the user's order. */
  async list(): Promise<string[]> {
    const { shelves, starred } = await this.read();
    return [
      ...shelves.filter((s) => starred.includes(s.id)).map((s) => s.name),
      ...shelves.filter((s) => !starred.includes(s.id)).map((s) => s.name),
    ];
  }

  /** Shelf names that are starred. */
  async starred(): Promise<string[]> {
    const { shelves, starred: starredIds } = await this.read();
    return starredIds.map((id) => shelves.find((s) => s.id === id)?.name).filter((n): n is string => n !== undefined);
  }

  /** The shelf object with matching name (case-insensitive). */
  private findByName(shelves: Shelf[], name: string): Shelf | undefined {
    const target = name.toLowerCase();
    return shelves.find((s) => s.name.toLowerCase() === target);
  }

  /** The stored spelling of a shelf name, matched case-insensitively. */
  async find(name: string): Promise<string | undefined> {
    const shelf = this.findByName((await this.read()).shelves, name);
    return shelf?.name;
  }

  /** The shelf ID with matching name (case-insensitive), or undefined if not found. */
  private async findId(name: string): Promise<string | undefined> {
    const shelf = this.findByName((await this.read()).shelves, name);
    return shelf?.id;
  }

  /** Adds a shelf and returns its name; an existing shelf with that name is returned as is. */
  async create(name: string): Promise<string> {
    const clean = validName(name);
    return this.change((file) => {
      const existing = this.findByName(file.shelves, clean);
      if (existing) return existing.name;
      file.shelves.push({ id: randomUUID(), name: clean });
      return clean;
    });
  }

  async rename(from: string, to: string): Promise<string> {
    const clean = validName(to);
    return this.change((file) => {
      const current = this.requireByName(file.shelves, from);
      const clash = this.findByName(file.shelves, clean);
      if (clash && clash.id !== current.id) throw new UserError(`a shelf named "${clash.name}" already exists`);
      current.name = clean;
      return clean;
    });
  }

  async remove(name: string): Promise<void> {
    await this.change((file) => {
      const current = this.requireByName(file.shelves, name);
      file.shelves = file.shelves.filter((s) => s.id !== current.id);
      file.starred = file.starred.filter((id) => id !== current.id);
    });
  }

  /** Stars or unstars a shelf; returns whether it is starred now. */
  async toggleStar(name: string): Promise<boolean> {
    return this.change((file) => {
      const current = this.requireByName(file.shelves, name);
      const isStarred = file.starred.includes(current.id);
      file.starred = isStarred ? file.starred.filter((id) => id !== current.id) : [...file.starred, current.id];
      return !isStarred;
    });
  }

  /**
   * Moves a shelf one place left (-1) or right (1) in the display order. Starred and other shelves
   * stay in their own groups, so a move never crosses between them. Returns whether it moved.
   */
  async move(name: string, step: -1 | 1): Promise<boolean> {
    return this.change((file) => {
      const current = this.requireByName(file.shelves, name);
      const isStarred = file.starred.includes(current.id);
      const group = file.shelves.filter((s) => file.starred.includes(s.id) === isStarred);
      const neighbourIdx = group.indexOf(current) + step;
      if (neighbourIdx < 0 || neighbourIdx >= group.length) return false;
      const neighbour = group[neighbourIdx]!;
      const a = file.shelves.indexOf(current);
      const b = file.shelves.indexOf(neighbour);
      [file.shelves[a], file.shelves[b]] = [file.shelves[b]!, file.shelves[a]!];
      return true;
    });
  }

  private requireByName(shelves: Shelf[], name: string): Shelf {
    const found = this.findByName(shelves, name);
    if (!found) throw new UserError(`no shelf named "${name}"`);
    return found;
  }
}
