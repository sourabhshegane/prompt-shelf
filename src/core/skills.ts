import { readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { repoDirs } from './scope.js';

export interface Skill {
  name: string;
  description: string;
  /** Where it came from, shown next to it in the list. */
  source: 'project' | 'personal' | 'plugin' | 'built-in';
}

/** Where to look; tests point these at temporary folders. */
export interface SkillRoots {
  home: string;
  /** Codex's own folder ($CODEX_HOME, or ~/.codex). */
  codexHome: string;
  /** Machine-wide Codex skills. */
  systemCodexSkills: string;
}

export const defaultSkillRoots = (): SkillRoots => ({
  home: homedir(),
  codexHome: process.env.CODEX_HOME || join(homedir(), '.codex'),
  systemCodexSkills: '/etc/codex/skills',
});

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

// Folders (and symlinks to folders, a common way to share skills) directly inside `dir`.
// Reading skills must never break the list, so anything unreadable counts as empty.
function subfolders(dir: string): string[] {
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

// Every `<dir>/<folder>/SKILL.md`, minus skills the user can't invoke or switched off.
function skillsIn(dir: string, source: Skill['source'], prefix = '', off: Set<string> = new Set()): Skill[] {
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

function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}

// Claude Code settings files that apply in `cwd`: the user's, then each project's up to the repo root.
const claudeSettingsFiles = (home: string, cwd: string) => [
  join(home, '.claude', 'settings.json'),
  ...repoDirs(cwd).flatMap((d) => [join(d, '.claude', 'settings.json'), join(d, '.claude', 'settings.local.json')]),
];

// Skill names the user turned off (`skillOverrides: { name: "off" }`).
function switchedOff(home: string, cwd: string): Set<string> {
  const off = new Set<string>();
  for (const file of claudeSettingsFiles(home, cwd)) {
    const overrides = (readJson(file) as { skillOverrides?: Record<string, string> } | undefined)?.skillOverrides ?? {};
    for (const [name, value] of Object.entries(overrides)) if (value === 'off') off.add(name);
  }
  return off;
}

// Skills of plugins that are installed and enabled, named `plugin:skill`.
function pluginSkills(home: string, off: Set<string>): Skill[] {
  const settings = readJson(join(home, '.claude', 'settings.json')) as { enabledPlugins?: Record<string, boolean> } | undefined;
  const installed = readJson(join(home, '.claude', 'plugins', 'installed_plugins.json')) as
    | { plugins?: Record<string, { installPath?: string }[]> }
    | undefined;
  return Object.entries(settings?.enabledPlugins ?? {})
    .filter(([, on]) => on)
    .flatMap(([id]) => {
      const path = installed?.plugins?.[id]?.[0]?.installPath;
      return path ? skillsIn(join(path, 'skills'), 'plugin', `${id.split('@')[0]}:`, off) : [];
    });
}

// The first skill with a given name wins, matching each agent's own precedence order.
const firstByName = (skills: Skill[]) => {
  const seen = new Set<string>();
  return skills.filter((s) => !seen.has(s.name) && seen.add(s.name));
};

/** Skills Claude Code can use in `cwd`: https://code.claude.com/docs/en/skills */
export function claudeSkills(cwd: string, roots: SkillRoots = defaultSkillRoots()): Skill[] {
  const off = switchedOff(roots.home, cwd);
  const synced = join(roots.home, '.claude', 'skills', 'synced');
  return firstByName([
    ...repoDirs(cwd).flatMap((d) => skillsIn(join(d, '.claude', 'skills'), 'project', '', off)),
    ...skillsIn(join(roots.home, '.claude', 'skills'), 'personal', '', off),
    ...subfolders(synced).flatMap((d) => skillsIn(join(synced, d), 'personal', '', off)),
    ...pluginSkills(roots.home, off),
  ]);
}

/**
 * Skills Codex can use in `cwd`: https://learn.chatgpt.com/docs/build-skills
 * (`<codexHome>/skills` is the older user location, still used by Codex's skill installer.)
 */
export function codexSkills(cwd: string, roots: SkillRoots = defaultSkillRoots()): Skill[] {
  return firstByName([
    ...repoDirs(cwd).flatMap((d) => skillsIn(join(d, '.agents', 'skills'), 'project')),
    ...skillsIn(join(roots.home, '.agents', 'skills'), 'personal'),
    ...skillsIn(join(roots.codexHome, 'skills'), 'personal'),
    ...skillsIn(roots.systemCodexSkills, 'personal'),
    ...skillsIn(join(roots.codexHome, 'skills', '.system'), 'built-in'),
  ]);
}
