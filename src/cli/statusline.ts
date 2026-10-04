import { isStashDraft, type Prompt } from '../domain/prompt.js';
import { scoped } from '../domain/scope.js';
import { t, tn } from '../i18n/index.js';

// `stash statusline`: one line for Claude Code's status line (its `statusLine` command setting).

/** The folder Claude Code reports on stdin (JSON with `workspace.current_dir` or `cwd`), if any. */
export function statusCwd(stdin: string): string | undefined {
  try {
    const data = JSON.parse(stdin) as { cwd?: unknown; workspace?: { current_dir?: unknown } };
    const dir = data.workspace?.current_dir ?? data.cwd;
    return typeof dir === 'string' ? dir : undefined;
  } catch {
    return undefined;
  }
}

/** What to show: drafts parked in this repo, or the keys. Empty when the agent isn't running through stash. */
export function statusText(opts: { prompts: Prompt[]; cwd: string; inSession: boolean; save: string; list: string }): string {
  if (!opts.inSession) return '';
  const parked = scoped(opts.prompts.filter(isStashDraft), 'repo', opts.cwd).length;
  return parked ? tn('statusline.parked', parked, { count: parked, save: opts.save, list: opts.list }) : t('statusline.idle', { save: opts.save, list: opts.list });
}
