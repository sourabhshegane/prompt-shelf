import { createRequire } from 'node:module';
import { chmodSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

try {
  const require = createRequire(import.meta.url);
  const pkgPath = require.resolve('node-pty/package.json');
  const pkgDir = dirname(pkgPath);
  const prebuildsDir = join(pkgDir, 'prebuilds');
  if (existsSync(prebuildsDir)) {
    for (const entry of readdirSync(prebuildsDir)) {
      const spawnHelper = join(prebuildsDir, entry, 'spawn-helper');
      if (existsSync(spawnHelper)) {
        chmodSync(spawnHelper, 0o755);
      }
    }
  }
} catch {}

if (process.env.npm_config_global !== 'true') {
  console.log('prompt-shelf: local install, run "stash enable" to install shims');
} else {
  try {
    const shimsModule = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'shims.js');
    if (existsSync(shimsModule)) {
      const { installShims, describeInstall } = await import(shimsModule);
      for (const line of describeInstall(await installShims())) console.log(`prompt-shelf: ${line}`);
    } else {
      console.log('prompt-shelf: dist/ not built yet; run `npm run build && stash enable`');
    }
  } catch (err) {
    console.log(`prompt-shelf: shim install skipped (${err?.message ?? err}); run \`stash enable\` later`);
  }
}
