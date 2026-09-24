import type { AgentAdapter, MarkerSpec } from './types.js';
import { backspaceClear, findInputStart, readMarkedDraft } from './types.js';

const spec: MarkerSpec = {
  marker: /^\s*[>❯]\s?(.*)$/,
  continuation: /^\s{2}(.*)$/,
  terminator: /^[─╭╰]/,
};

export const claudeAdapter: AgentAdapter = {
  name: 'claude',
  command: 'claude',
  reservedKeys: ['ctrl+s', 'ctrl+g', 'ctrl+t', 'ctrl+o', 'ctrl+r', 'ctrl+l', 'ctrl+j', 'ctrl+v', 'ctrl+x', 'ctrl+b', 'ctrl+e', 'ctrl+c', 'ctrl+d'],
  readDraft: (lines, cursor, cols) => readMarkedDraft(lines, cursor, spec, cols),
  unsafeDraft: /\[Pasted text #\d+/,
  pasteLabel: { pattern: /\[Pasted text #(\d+)(?: \+\d+ lines?)?\]/g, key: 'number' },
  clearDraft: backspaceClear,
  inputTop: (lines) => findInputStart(lines, spec),
  isBorder: (line) => spec.terminator.test(line),
};
