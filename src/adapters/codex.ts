import { homedir } from 'node:os';
import { join } from 'node:path';
import { repoDirs } from '../domain/scope.js';
import type { Skill } from '../domain/skill.js';
import { markedInputBox } from './input-box.js';
import { firstByName, skillsIn } from './skill-files.js';
import type { AgentAdapter } from './types.js';

/** OpenAI Codex CLI: https://github.com/openai/codex */
export const codexAdapter: AgentAdapter = {
  name: 'codex',
  displayName: 'Codex',
  command: 'codex',
  reservedKeys: ['ctrl+t', 'ctrl+c', 'ctrl+d', 'ctrl+j', 'ctrl+r', 'ctrl+g'],
  ...markedInputBox({ marker: /^\s*›\s?(.*)$/ }),
  dimPlaceholder: true,
  pasteLabel: { pattern: /\[Pasted Content (\d+) chars\]/g, key: 'chars' },
  unsafeDraft: /\[Pasted Content/i,
  skills: (cwd) => codexSkills(cwd),
  // `$name` mentions a skill anywhere in a prompt.
  skillPrompt: (name) => `$${name} `,
};

/** Where Codex looks for skills besides the repo; tests point these at temporary folders. */
export interface CodexRoots {
  home: string;
  /** Codex's own folder ($CODEX_HOME, or ~/.codex). */
  codexHome: string;
  /** Machine-wide skills. */
  systemSkills: string;
}

const defaultRoots = (): CodexRoots => ({
  home: homedir(),
  codexHome: process.env.CODEX_HOME || join(homedir(), '.codex'),
  systemSkills: '/etc/codex/skills',
});

/**
 * Skills Codex can use in `cwd`, in its precedence order: https://learn.chatgpt.com/docs/build-skills
 * (`<codexHome>/skills` is the older user location, still used by Codex's skill installer.)
 */
export function codexSkills(cwd: string, roots: CodexRoots = defaultRoots()): Skill[] {
  return firstByName([
    ...repoDirs(cwd).flatMap((d) => skillsIn(join(d, '.agents', 'skills'), 'project')),
    ...skillsIn(join(roots.home, '.agents', 'skills'), 'personal'),
    ...skillsIn(join(roots.codexHome, 'skills'), 'personal'),
    ...skillsIn(roots.systemSkills, 'personal'),
    ...skillsIn(join(roots.codexHome, 'skills', '.system'), 'built-in'),
  ]);
}
