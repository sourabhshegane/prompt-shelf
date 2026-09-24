import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export type Scope = 'repo' | 'all';

const roots = new Map<string, string>();

/** The root of the git repo containing `dir`, or `dir` itself when it isn't inside one. */
export function repoRoot(dir: string): string {
  const start = resolve(dir);
  let root = roots.get(start);
  if (root === undefined) {
    root = start;
    for (let d = start; ; d = dirname(d)) {
      if (existsSync(join(d, '.git'))) {
        root = d;
        break;
      }
      if (dirname(d) === d) break;
    }
    roots.set(start, root);
  }
  return root;
}

export const inRepo = (entry: { cwd: string }, cwd: string): boolean => repoRoot(entry.cwd) === repoRoot(cwd);

export function scoped<T extends { cwd: string }>(entries: T[], scope: Scope, cwd: string | undefined): T[] {
  return scope === 'all' || cwd === undefined ? entries : entries.filter((e) => inRepo(e, cwd));
}
