import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, chmod, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { findRealBinary, installShims, removeShims, shimDirFor, stripShimDir } from '../src/shims.js';

const unix = process.platform !== 'win32';

let root: string;
let home: string;
let realBin: string;

async function fakeBinary(dir: string, name: string) {
  await mkdir(dir, { recursive: true });
  const file = join(dir, name);
  await writeFile(file, '#!/bin/sh\necho fake\n');
  await chmod(file, 0o755);
  return file;
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'stash-shims-'));
  home = join(root, 'home');
  realBin = join(root, 'real');
  await mkdir(home, { recursive: true });
  await fakeBinary(realBin, 'claude');
});

const envFor = (extra: Record<string, string> = {}) => ({ HOME: home, SHELL: '/bin/zsh', PATH: realBin, ...extra });

describe.skipIf(!unix)('findRealBinary', () => {
  it('skips the shim dir and returns the real binary', async () => {
    const env = envFor();
    const shimDir = shimDirFor(env);
    await fakeBinary(shimDir, 'claude');
    const real = findRealBinary('claude', { ...env, PATH: [shimDir, realBin].join(delimiter) });
    expect(real).toBe(join(realBin, 'claude'));
  });

  it('returns null when the binary is absent', () => {
    expect(findRealBinary('codex', envFor())).toBeNull();
  });

  it('returns null when only the shim exists', async () => {
    const env = envFor();
    const shimDir = shimDirFor(env);
    await fakeBinary(shimDir, 'codex');
    expect(findRealBinary('codex', { ...env, PATH: [shimDir, realBin].join(delimiter) })).toBeNull();
  });
});

describe('stripShimDir', () => {
  it('removes the shim dir from PATH and leaves the rest in order', () => {
    const env = envFor();
    const shimDir = shimDirFor(env);
    expect(stripShimDir([shimDir, '/usr/bin', shimDir, realBin].join(delimiter), env)).toBe(['/usr/bin', realBin].join(delimiter));
  });

  it('keeps empty PATH entries', () => {
    const env = envFor();
    expect(stripShimDir(['', '/usr/bin', ''].join(delimiter), env)).toBe(['', '/usr/bin', ''].join(delimiter));
  });
});

describe.skipIf(!unix)('installShims', () => {
  it('writes an executable shim for each agent found on PATH', async () => {
    const env = envFor();
    const result = await installShims(env);
    const shim = join(home, '.prompt-shelf', 'bin', 'claude');
    expect(result.shims).toEqual([shim]);
    expect(existsSync(join(home, '.prompt-shelf', 'bin', 'codex'))).toBe(false);
    const mode = (await stat(shim)).mode & 0o111;
    expect(mode).toBe(0o111);
    const content = await readFile(shim, 'utf8');
    expect(content.startsWith('#!/bin/sh\n')).toBe(true);
    expect(content).toContain('if command -v stash >/dev/null 2>&1; then exec stash claude "$@"; fi');
    expect(content).toContain('exec claude "$@"');
  });

  it('runs stash when it is on PATH and falls through to the real binary when it is not', async () => {
    const env = envFor();
    const { shims } = await installShims(env);
    const shim = shims[0]!;
    const stashBin = join(root, 'stash-bin');
    await mkdir(stashBin, { recursive: true });
    await writeFile(join(stashBin, 'stash'), '#!/bin/sh\necho "stash $*"\n');
    await chmod(join(stashBin, 'stash'), 0o755);
    const system = ['/usr/bin', '/bin'];
    const run = (path: string[]) => execFileSync(shim, ['--resume'], { env: { HOME: home, PATH: path.join(delimiter) }, encoding: 'utf8' }).trim();
    expect(run([shimDirFor(env), stashBin, realBin, ...system])).toBe('stash claude --resume');
    expect(run([shimDirFor(env), realBin, ...system])).toBe('fake');
  });

  it('appends the marked rc line to ~/.zshrc exactly once', async () => {
    const env = envFor();
    await writeFile(join(home, '.zshrc'), 'export FOO=1');
    const first = await installShims(env);
    expect(first.rcFile).toBe(join(home, '.zshrc'));
    expect(first.rcChanged).toBe(true);
    const second = await installShims(env);
    expect(second.rcChanged).toBe(false);
    const rc = await readFile(join(home, '.zshrc'), 'utf8');
    expect(rc).toBe('export FOO=1\nexport PATH="$HOME/.prompt-shelf/bin:$PATH"  # prompt-shelf\n');
  });

  it('targets ~/.bashrc for bash and config.fish for fish', async () => {
    const bash = await installShims(envFor({ SHELL: '/bin/bash' }));
    expect(bash.rcFile).toBe(join(home, '.bashrc'));
    const fish = await installShims(envFor({ SHELL: '/opt/homebrew/bin/fish' }));
    expect(fish.rcFile).toBe(join(home, '.config', 'fish', 'config.fish'));
    const fishRc = await readFile(fish.rcFile!, 'utf8');
    expect(fishRc).toBe('fish_add_path --path --move ~/.prompt-shelf/bin # prompt-shelf\n');
  });

  it('reports no rc file for an unknown shell', async () => {
    const result = await installShims(envFor({ SHELL: '/bin/tcsh' }));
    expect(result.rcFile).toBeNull();
    expect(result.rcChanged).toBe(false);
  });
});

describe.skipIf(!unix)('removeShims', () => {
  it('deletes shims and the marked rc line, leaving other content intact', async () => {
    const env = envFor();
    await writeFile(join(home, '.zshrc'), 'export FOO=1\n# keep me\n');
    await installShims(env);
    const shim = join(home, '.prompt-shelf', 'bin', 'claude');
    const result = await removeShims(env);
    expect(result.removed).toEqual([shim]);
    expect(result.rcFile).toBe(join(home, '.zshrc'));
    expect(result.rcChanged).toBe(true);
    expect(existsSync(shim)).toBe(false);
    expect(await readFile(join(home, '.zshrc'), 'utf8')).toBe('export FOO=1\n# keep me\n');
  });

  it('removes only the anchored marker line and preserves the trailing-newline state', async () => {
    const env = envFor();
    const rc = join(home, '.zshrc');
    const line = 'export PATH="$HOME/.prompt-shelf/bin:$PATH"  # prompt-shelf';
    for (const [before, after] of [
      [`a\n${line}\n`, 'a\n'],
      [`a\n${line}`, 'a'],
      [`${line}\nb # prompt-shelf-old\n`, 'b # prompt-shelf-old\n'],
    ]) {
      await writeFile(rc, before!);
      expect((await removeShims(env)).rcChanged).toBe(true);
      expect(await readFile(rc, 'utf8')).toBe(after);
    }
  });

  it('is a no-op when nothing was installed', async () => {
    const result = await removeShims(envFor());
    expect(result).toEqual({ removed: [], rcFile: join(home, '.zshrc'), rcChanged: false });
  });
});
