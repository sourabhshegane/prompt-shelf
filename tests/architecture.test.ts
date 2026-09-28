import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';

// The layer rules from CONTRIBUTING.md ("Layout"), checked on every test run.

const SRC = join(import.meta.dirname, '..', 'src');
const files = readdirSync(SRC, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.ts'));
// A file's layer: its folder, or its own name for the few files at the top of src/.
const layerOf = (file: string) => (file.includes('/') ? file.split('/')[0]! : file.replace(/\.ts$/, ''));

/** Which layers each layer may import from (besides itself). */
const ALLOWED: Record<string, string[]> = {
  errors: [],
  debug: ['storage'],
  domain: ['errors'],
  terminal: ['errors'],
  system: ['errors'],
  storage: ['domain', 'errors', 'debug'],
  adapters: ['domain', 'terminal', 'errors'],
  ui: ['domain', 'terminal', 'errors', 'i18n'],
  i18n: [],
  session: ['adapters', 'domain', 'storage', 'terminal', 'system', 'ui', 'errors', 'debug', 'i18n'],
  'shims-entry': ['adapters', 'system'],
  cli: ['adapters', 'domain', 'storage', 'terminal', 'system', 'session', 'errors', 'debug', 'shims-entry', 'i18n'],
};

// Files in src/ that `file` imports (package.json and other outside files are left out).
const imports = (file: string) =>
  [...readFileSync(join(SRC, file), 'utf8').matchAll(/from '(\.[^']+)'/g)]
    .map((m) => normalize(relative(SRC, join(SRC, dirname(file), m[1]!))).replace(/\.js$/, '.ts'))
    .filter((target) => !target.startsWith('..'));

// A file's code without its comments.
const code = (file: string) =>
  readFileSync(join(SRC, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

describe('architecture', () => {
  it('knows the layer of every source file', () => {
    expect(files.map(layerOf).filter((l) => !(l in ALLOWED))).toEqual([]);
  });

  it('imports only from allowed layers', () => {
    const wrong = files.flatMap((file) =>
      imports(file)
        .filter((target) => layerOf(target) !== layerOf(file) && !ALLOWED[layerOf(file)]!.includes(layerOf(target)))
        .map((target) => `${file} -> ${target}`),
    );
    expect(wrong).toEqual([]);
  });

  it('only lets the session and CLI entry points be imported from the session layer', () => {
    const wrong = files
      .filter((f) => layerOf(f) === 'cli')
      .flatMap((file) => imports(file).filter((t) => layerOf(t) === 'session' && t !== 'session/run.ts').map((t) => `${file} -> ${t}`));
    expect(wrong).toEqual([]);
  });

  it('keeps each agent inside src/adapters: others use the registry, never a specific adapter', () => {
    const outside = files.filter((f) => layerOf(f) !== 'adapters');
    const direct = outside.flatMap((file) =>
      imports(file)
        .filter((t) => layerOf(t) === 'adapters' && !['adapters/index.ts', 'adapters/types.ts'].includes(t))
        .map((t) => `${file} -> ${t}`),
    );
    expect(direct).toEqual([]);
    const named = outside.filter((file) => /\b(claude|codex)\b/i.test(code(file)));
    expect(named).toEqual([]);
  });
});
