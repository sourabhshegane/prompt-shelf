// English, the source language. Every user-facing message lives here under a key; other languages
// are files with the same keys (see ./index.ts). `{name}` is filled in by t(); keep it in
// translations. Keys ending in `_one` / `_other` are plural forms, picked by tn().

export const en = {
  'save.nothing': 'nothing to stash',
  'save.collapsedPaste': 'draft contains a collapsed paste — expand it first',
  'save.stashed': 'stashed ({count})',
  'save.savedTo': 'saved to {shelf}',
  'error.prefix': 'error: {message}',
} as const;

export type MessageKey = keyof typeof en;
