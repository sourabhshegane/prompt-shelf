/**
 * An expected failure the user can fix: a bad argument, an unknown shelf, a hotkey clash, a damaged
 * file. Its message is shown as is; any other error is treated as a bug.
 */
export class UserError extends Error {
  constructor(
    message: string,
    /** 1 for a failed command, 2 for wrong usage or a configuration conflict. */
    readonly exitCode: 1 | 2 = 1,
  ) {
    super(message);
    this.name = 'UserError';
  }
}

export const describeError = (err: unknown): string => (err instanceof Error ? err.message : String(err));
