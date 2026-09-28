/** A message shown in place of the key hints for a moment. */
export interface Status {
  text: string;
  error?: boolean;
}

/**
 * A panel drawn over the agent, just above its input box. It turns keys into actions for the
 * session to carry out and draws itself from its own state; it never touches files or the terminal.
 */
export interface Panel<Action> {
  handleKey(chunk: string): Action;
  /** Exactly `rows` lines of at most `cols` cells, joined by `\r\n`. */
  render(cols: number, rows: number, status?: Status): string;
}
