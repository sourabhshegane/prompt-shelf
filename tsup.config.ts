import { defineConfig } from 'tsup';
export default defineConfig({
  // Output names are contracts: bin/stash.js imports dist/cli.js, scripts/postinstall.js imports dist/shims.js.
  entry: { cli: 'src/cli/main.ts', shims: 'src/system/shims.ts' },
  format: ['esm'],
  target: 'node20',
  clean: true,
  sourcemap: true,
  external: ['node-pty', '@xterm/headless', '@xterm/addon-serialize'],
});
