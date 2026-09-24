import { describe, it, expect, beforeAll } from 'vitest';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repoRoot, scoped } from '../../src/core/scope.js';

let base: string;
let repo: string;
let plain: string;

beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), 'prompt-shelf-scope-'));
  repo = join(base, 'repo');
  plain = join(base, 'plain');
  await mkdir(join(repo, '.git'), { recursive: true });
  await mkdir(join(repo, 'src', 'deep'), { recursive: true });
  await mkdir(join(plain, 'sub'), { recursive: true });
});

describe('repoRoot', () => {
  it('finds the git root from any folder inside the repo', () => {
    expect(repoRoot(join(repo, 'src', 'deep'))).toBe(repo);
    expect(repoRoot(repo)).toBe(repo);
  });

  it('returns the folder itself outside a git repo', () => {
    expect(repoRoot(join(plain, 'sub'))).toBe(join(plain, 'sub'));
  });
});

describe('scoped', () => {
  const entries = () => [
    { cwd: repo, text: 'root' },
    { cwd: join(repo, 'src', 'deep'), text: 'deep' },
    { cwd: plain, text: 'plain' },
    { cwd: join(plain, 'sub'), text: 'plain sub' },
  ];

  it('shows everything from the same git repo, whichever subfolder it was stashed in', () => {
    expect(scoped(entries(), 'repo', join(repo, 'src')).map((e) => e.text)).toEqual(['root', 'deep']);
  });

  it('matches the exact folder outside a git repo', () => {
    expect(scoped(entries(), 'repo', plain).map((e) => e.text)).toEqual(['plain']);
  });

  it('shows everything for the all scope', () => {
    expect(scoped(entries(), 'all', repo)).toHaveLength(4);
  });
});
