import type { AgentAdapter, MarkerSpec } from './types.js';
import { backspaceClear, findInputStart, readMarkedDraft } from './types.js';

const spec: MarkerSpec = {
  marker: /^\s*›\s?(.*)$/,
  continuation: /^\s{2}(.*)$/,
  terminator: /^[─╭╰]/,
};

export const codexAdapter: AgentAdapter = {
  name: 'codex',
  command: 'codex',
  reservedKeys: ['ctrl+t', 'ctrl+c', 'ctrl+d', 'ctrl+j', 'ctrl+r', 'ctrl+g'],
  readDraft: (lines, cursor, cols) => readMarkedDraft(lines, cursor, spec, cols),
  dimPlaceholder: true,
  unsafeDraft: /\[Pasted Content/i,
  pasteLabel: { pattern: /\[Pasted Content (\d+) chars\]/g, key: 'chars' },
  clearDraft: backspaceClear,
  inputTop: (lines) => findInputStart(lines, spec),
  isBorder: (line) => spec.terminator.test(line),
};
