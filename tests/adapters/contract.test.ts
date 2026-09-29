import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { allAdapters } from '../../src/adapters/index.js';
import { DEFAULT_CONFIG } from '../../src/storage/config.js';
import { parseHotkey } from '../../src/terminal/keys.js';

// What every adapter must do. A new adapter is checked here as soon as it is registered; its own
// test file then covers its real screens (see CONTRIBUTING.md, "Adding an agent").

const adapters = allAdapters();
const emptyRepo = mkdtempSync(join(tmpdir(), 'contract-'));

describe('the adapter registry', () => {
  it('has unique names and commands', () => {
    expect(new Set(adapters.map((a) => a.name)).size).toBe(adapters.length);
    expect(new Set(adapters.map((a) => a.command)).size).toBe(adapters.length);
  });
});

describe.each(adapters.map((a) => [a.name, a] as const))('adapter %s', (_, adapter) => {
  it('has a command-line name, a display name and a command', () => {
    expect(adapter.name).toMatch(/^[a-z][a-z0-9-]*$/);
    expect(adapter.displayName.trim()).not.toBe('');
    expect(adapter.command.trim()).not.toBe('');
  });

  it('lists its own keys as valid lowercase hotkeys, leaving the default hotkeys free', () => {
    for (const key of adapter.reservedKeys) {
      expect(key).toBe(key.toLowerCase());
      expect(() => parseHotkey(key)).not.toThrow();
    }
    expect(adapter.reservedKeys).not.toContain(DEFAULT_CONFIG.hotkey);
    expect(adapter.reservedKeys).not.toContain(DEFAULT_CONFIG.listHotkey);
  });

  it('reads no draft from a blank screen and erases a draft with a key sequence', () => {
    const blank = Array.from({ length: 24 }, () => '');
    expect(adapter.readDraft(blank, { x: 0, y: 23 }, 80)).toBeNull();
    expect(adapter.inputTop(blank)).toBeNull();
    expect(adapter.clearDraft({ text: 'ab\ncd' })).not.toBe('');
  });

  it('names a picked skill in its own syntax, before and after other text', () => {
    for (const afterText of [false, true]) expect(adapter.skillPrompt('my-skill', afterText)).toContain('my-skill');
  });

  it('describes its collapsed-paste placeholder with a global pattern (replace needs it)', () => {
    if (adapter.pasteLabel) expect(adapter.pasteLabel.pattern.global).toBe(true);
  });

  it('lists skills without throwing, even in an empty folder', () => {
    expect(Array.isArray(adapter.skills(emptyRepo))).toBe(true);
  });
});
