import { accessSync, constants, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';

// Finding real executables on PATH, around prompt-shelf's own shims.

export const win32 = process.platform === 'win32';

export type Env = Record<string, string | undefined>;

export const homeFor = (env: Env) => env.HOME ?? env.USERPROFILE ?? homedir();

/** Where the shims live. Fixed under the home folder: the POSIX shim script hard-codes it. */
export const shimDirFor = (env: Env): string => join(homeFor(env), '.prompt-shelf', 'bin');
export const shimDir = shimDirFor(process.env);

const isShimDir = (entry: string, env: Env) => resolve(entry) === resolve(shimDirFor(env));

export const shimDirOnPath = (env: Env = process.env): boolean => (env.PATH ?? '').split(delimiter).some((entry) => entry && isShimDir(entry, env));

/** PATH without the shim folder, so the real agent runs and not the shim again. */
export function stripShimDir(path: string | undefined, env: Env = process.env): string {
  return (path ?? '')
    .split(delimiter)
    .filter((entry) => !entry || !isShimDir(entry, env))
    .join(delimiter);
}

const isExecutableFile = (file: string) => {
  try {
    if (!statSync(file).isFile()) return false;
    if (!win32) accessSync(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

/** The agent's real executable on PATH, skipping the shims. */
export function findRealBinary(name: string, env: Env = process.env): string | null {
  const exts = win32 ? [...(env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';'), ''] : [''];
  for (const entry of stripShimDir(env.PATH, env).split(delimiter)) {
    for (const ext of exts) {
      const candidate = join(entry, name + ext);
      if (isExecutableFile(candidate)) return candidate;
    }
  }
  return null;
}

/** Windows .cmd/.bat scripts can only be started through the shell. */
export const isCmdScript = (file: string): boolean => /\.(cmd|bat)$/i.test(file);
