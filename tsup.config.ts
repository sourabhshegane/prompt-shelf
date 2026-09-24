import { defineConfig } from 'tsup';
export default defineConfig({
  entry: ['src/cli.ts', 'src/shims.ts'],
  format: ['esm'],
  target: 'node20',
  clean: true,
  sourcemap: true,
  external: ['node-pty', '@xterm/headless', '@xterm/addon-serialize'],
});
