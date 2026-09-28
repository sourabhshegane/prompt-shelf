import { allAdapters } from './adapters/index.js';
import * as shims from './system/shims.js';
import type { Env } from './system/binaries.js';

// Shim commands for every supported agent. Also the build's `shims` entry (dist/shims.js), which
// scripts/postinstall.js imports: keep `installShims()` and `describeInstall(result)` working.

const commands = () => allAdapters().map((a) => a.command);

export const installShims = (env?: Env) => shims.installShims(commands(), env);
export const removeShims = (env?: Env) => shims.removeShims(commands(), env);
export const describeInstall = (result: shims.InstallResult, env?: Env) => shims.describeInstall(result, commands(), env);
export { describeRemove, pathHint } from './system/shims.js';
