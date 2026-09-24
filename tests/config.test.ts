import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { loadConfig, saveConfig } from '../src/config.js';

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'prompt-shelf-config-'));
  file = join(dir, 'nested', 'config.json');
});

afterEach(() => rm(dir, { recursive: true, force: true }));

describe('loadConfig', () => {
  it('defaults to ctrl+f when the file is missing', async () => {
    expect(await loadConfig(file)).toEqual({ hotkey: 'ctrl+f', listHotkey: 'ctrl+q' });
  });

  it('falls back to defaults on malformed json', async () => {
    await writeFile(join(dir, 'broken.json'), '{nope');
    expect(await loadConfig(join(dir, 'broken.json'))).toEqual({ hotkey: 'ctrl+f', listHotkey: 'ctrl+q' });
  });
});

describe('saveConfig', () => {
  it('creates the directory and writes the merged config', async () => {
    await saveConfig({ hotkey: 'ctrl+y' }, file);
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ hotkey: 'ctrl+y' });
    expect(await loadConfig(file)).toEqual({ hotkey: 'ctrl+y', listHotkey: 'ctrl+q' });
  });

  it.skipIf(process.platform === 'win32')('creates the directory as owner-only', async () => {
    await saveConfig({ hotkey: 'ctrl+y' }, file);
    expect((await stat(dirname(file))).mode & 0o777).toBe(0o700);
  });

  it('preserves unknown keys already in the file', async () => {
    await saveConfig({ hotkey: 'f2' }, file);
    await writeFile(file, JSON.stringify({ hotkey: 'f2', extra: true }));
    await saveConfig({ hotkey: 'ctrl+y' }, file);
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ hotkey: 'ctrl+y', extra: true });
  });
});
