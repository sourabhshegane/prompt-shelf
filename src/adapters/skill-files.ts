import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Skill } from '../domain/skill.js';

// Reading SKILL.md folders, the format Claude Code and Codex share (https://agentskills.io).
// Reading skills must never break the list, so anything unreadable counts as missing.

/**
 * The `name`, `description` and `user-invocable` fields of a SKILL.md front matter. Values can be
 * plain (continuing on indented lines), quoted, or `|` / `>` blocks.
 */
export function parseSkillFile(text: string): { name?: string; description?: string; 'user-invocable'?: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!match) return {};
  const lines = match[1]!.split(/\r?\n/);
  const out: Record<string, string> = {};
  for (let i = 0; i < lines.length; i++) {
    const field = /^(name|description|user-invocable):\s*(.*)$/.exec(lines[i]!);
    if (!field) continue;
    const parts = [field[2]!.trim()];
    const block = /^[|>]-?$/.test(parts[0]!);
    if (block) parts.pop();
    // Indented lines that follow belong to this value (a block, or a wrapped plain value).
    while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1]!)) parts.push(lines[++i]!.trim());
    out[field[1]!] = parts.join(' ').trim().replace(/^(["'])(.*)\1$/, '$2');
  }
  return out;
}

/** Folders (and symlinks to folders, a common way to share skills) directly inside `dir`. */
export function subfolders(dir: string): string[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names.filter((name) => {
    try {
      return statSync(join(dir, name)).isDirectory();
    } catch {
      return false;
    }
  });
}

/** Every `<dir>/<folder>/SKILL.md`, minus skills the user can't invoke or switched off. */
export function skillsIn(dir: string, source: Skill['source'], prefix = '', off: Set<string> = new Set()): Skill[] {
  const found: Skill[] = [];
  for (const folder of subfolders(dir)) {
    let text: string;
    try {
      text = readFileSync(join(dir, folder, 'SKILL.md'), 'utf8');
    } catch {
      continue;
    }
    const meta = parseSkillFile(text);
    const name = prefix + (meta.name || folder);
    if (meta['user-invocable'] === 'false' || off.has(name)) continue;
    // Without front matter, the first heading is the description, as Claude Code does.
    const heading = /^#\s+(.+)$/m.exec(text)?.[1]?.trim() ?? '';
    found.push({ name, description: meta.description || heading, source });
  }
  return found;
}

export function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}

/** The first skill with a given name wins; callers list locations in the agent's precedence order. */
export const firstByName = (skills: Skill[]): Skill[] => {
  const seen = new Set<string>();
  return skills.filter((s) => !seen.has(s.name) && seen.add(s.name));
};
