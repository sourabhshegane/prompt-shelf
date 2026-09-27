import type { AgentAdapter, MarkerSpec } from './types.js';
import { backspaceClear, findInputStart, readMarkedDraft } from './types.js';
import { claudeSkills } from './skill-files.js';

const spec: MarkerSpec = {
  marker: /^\s*[>❯]\s?(.*)$/,
  continuation: /^\s{2}(.*)$/,
  terminator: /^[─╭╰]/,
};

export const claudeAdapter: AgentAdapter = {
  name: 'claude',
  displayName: 'Claude Code',
  command: 'claude',
  skills: (cwd) => claudeSkills(cwd),
  // `/name` runs a skill, but only at the start of a prompt; after typed text it is named in words.
  skillPrompt: (name, afterText) => (afterText ? `use the /${name} skill ` : `/${name} `),
  reservedKeys: ['ctrl+s', 'ctrl+g', 'ctrl+t', 'ctrl+o', 'ctrl+r', 'ctrl+l', 'ctrl+j', 'ctrl+v', 'ctrl+x', 'ctrl+b', 'ctrl+e', 'ctrl+c', 'ctrl+d'],
  readDraft: (lines, cursor, cols) => readMarkedDraft(lines, cursor, spec, cols),
  dimPlaceholder: true,
  unsafeDraft: /\[Pasted text #\d+/,
  pasteLabel: { pattern: /\[Pasted text #(\d+)(?: \+(\d+) lines?)?\]/g, key: 'number' },
  clearDraft: backspaceClear,
  inputTop: (lines) => findInputStart(lines, spec),
  isBorder: (line) => spec.terminator.test(line),
};
