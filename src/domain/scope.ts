import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export type Scope = 'repo' | 'all';

/**
 * `dir` and each parent up to the root of its git repo (inclusive); when `dir` isn't in a repo, the
 * walk goes to the filesystem root. Claude Code and Codex both look for repo skills this way.
 */
export function repoDirs(dir: string): string[] {
  const dirs: string[] = [];
  for (let d = resolve(dir); ; d = dirname(d)) {
    dirs.push(d);
    if (existsSync(join(d, '.git')) || dirname(d) === d) return dirs;
  }
}

const roots = new Map<string, string>();

/** The root of the git repo containing `dir`, or `dir` itself when it isn't inside one. */
export function repoRoot(dir: string): string {
  const start = resolve(dir);
  let root = roots.get(start);
  if (root === undefined) {
    const dirs = repoDirs(start);
    const top = dirs[dirs.length - 1]!;
    root = existsSync(join(top, '.git')) ? top : start;
    roots.set(start, root);
  }
  return root;
}

export const inRepo = (entry: { cwd: string }, cwd: string): boolean => repoRoot(entry.cwd) === repoRoot(cwd);

export function scoped<T extends { cwd: string }>(entries: T[], scope: Scope, cwd: string | undefined): T[] {
  return scope === 'all' || cwd === undefined ? entries : entries.filter((e) => inRepo(e, cwd));
}
