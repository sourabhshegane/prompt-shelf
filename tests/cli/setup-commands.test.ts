import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runHotkeyCommand } from '../../src/cli/setup-commands.js';

describe('runHotkeyCommand', () => {
  let dir: string;
  let file: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'prompt-shelf-cli-'));
    file = join(dir, 'config.json');
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('prints both hotkeys when no spec is given', async () => {
    expect(await runHotkeyCommand(undefined, file)).toBe('hotkey: ctrl+f\nlist hotkey: ctrl+q');
  });

  it('writes a valid ctrl hotkey and reports it', async () => {
    expect(await runHotkeyCommand('ctrl+y', file)).toBe('hotkey set to ctrl+y — takes effect in new sessions');
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ hotkey: 'ctrl+y' });
    expect(await runHotkeyCommand(undefined, file)).toBe('hotkey: ctrl+y\nlist hotkey: ctrl+q');
  });

  it('accepts the default ctrl+f since no adapter reserves it', async () => {
    expect(await runHotkeyCommand('ctrl+f', file)).toMatch(/set to ctrl\+f/);
  });

  it('accepts function keys and normalises the label', async () => {
    expect(await runHotkeyCommand('F2', file)).toBe('hotkey set to f2 — takes effect in new sessions');
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ hotkey: 'f2' });
  });

  it('rejects an unsupported spec without writing', async () => {
    await expect(runHotkeyCommand('f13', file)).rejects.toThrow(/unsupported hotkey/i);
    await expect(readFile(file, 'utf8')).rejects.toThrow();
  });

  it('refuses a key reserved by an adapter and names it', async () => {
    await expect(runHotkeyCommand('ctrl+t', file)).rejects.toThrow(/reserved by claude, codex/);
    await expect(readFile(file, 'utf8')).rejects.toThrow();
  });

  it('shows and sets the list hotkey without touching the stash hotkey', async () => {
    expect(await runHotkeyCommand(undefined, file, true)).toBe('list hotkey: ctrl+q');
    expect(await runHotkeyCommand('f3', file, true)).toBe('list hotkey set to f3 — takes effect in new sessions');
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ listHotkey: 'f3' });
  });

  it('refuses a key already used by the other hotkey', async () => {
    await expect(runHotkeyCommand('ctrl+f', file, true)).rejects.toThrow(/already the stash hotkey/);
    await expect(runHotkeyCommand('ctrl+q', file)).rejects.toThrow(/already the list hotkey/);
    await expect(readFile(file, 'utf8')).rejects.toThrow();
  });
});
