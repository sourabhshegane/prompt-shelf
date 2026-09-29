import { homedir } from 'node:os';
import { join } from 'node:path';
import { repoDirs } from '../domain/scope.js';
import type { Skill } from '../domain/skill.js';
import { markedInputBox } from './input-box.js';
import { firstByName, readJson, skillsIn, subfolders } from './skill-files.js';
import type { AgentAdapter } from './types.js';

/** Claude Code: https://code.claude.com/docs */
export const claudeAdapter: AgentAdapter = {
  name: 'claude',
  displayName: 'Claude Code',
  command: 'claude',
  reservedKeys: ['ctrl+s', 'ctrl+g', 'ctrl+t', 'ctrl+o', 'ctrl+r', 'ctrl+l', 'ctrl+j', 'ctrl+v', 'ctrl+x', 'ctrl+b', 'ctrl+e', 'ctrl+c', 'ctrl+d'],
  ...markedInputBox({ marker: /^\s*[>❯]\s?(.*)$/ }),
  dimPlaceholder: true,
  pasteLabel: { pattern: /\[Pasted text #(\d+)(?: \+(\d+) lines?)?\]/g, key: 'number' },
  unsafeDraft: /\[Pasted text #\d+/,
  skills: (cwd) => claudeSkills(cwd),
  // `/name` runs a skill, but only at the start of a prompt; after typed text it is named in words.
  skillPrompt: (name, afterText) => (afterText ? `use the /${name} skill ` : `/${name} `),
};

// Settings files that apply in `cwd`: the user's, then each project's up to the repo root.
const settingsFiles = (home: string, cwd: string) => [
  join(home, '.claude', 'settings.json'),
  ...repoDirs(cwd).flatMap((d) => [join(d, '.claude', 'settings.json'), join(d, '.claude', 'settings.local.json')]),
];

// Skill names the user turned off (`skillOverrides: { name: "off" }`).
function switchedOff(home: string, cwd: string): Set<string> {
  const off = new Set<string>();
  for (const file of settingsFiles(home, cwd)) {
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

/** Skills Claude Code can use in `cwd`, in its precedence order: https://code.claude.com/docs/en/skills */
export function claudeSkills(cwd: string, home = homedir()): Skill[] {
  const off = switchedOff(home, cwd);
  const synced = join(home, '.claude', 'skills', 'synced');
  return firstByName([
    ...repoDirs(cwd).flatMap((d) => skillsIn(join(d, '.claude', 'skills'), 'project', '', off)),
    ...skillsIn(join(home, '.claude', 'skills'), 'personal', '', off),
    ...subfolders(synced).flatMap((d) => skillsIn(join(synced, d), 'personal', '', off)),
    ...pluginSkills(home, off),
  ]);
}
