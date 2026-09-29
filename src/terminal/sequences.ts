// Terminal input sequences used in more than one place.

/** Bracketed paste: the terminal wraps pasted text in these, and so do we when typing into the agent. */
export const PASTE_START = '\x1b[200~';
export const PASTE_END = '\x1b[201~';
/** The End key, then Backspace: how a draft is erased from an agent's input box. */
export const END_KEY = '\x1b[F';
export const BACKSPACE = '\x7f';
