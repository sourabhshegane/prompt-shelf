import { describe, it, expect, afterEach } from 'vitest';
import { en } from '../../src/i18n/en.js';
import { allLocales, detectLocale, placeholders, t, useMessages, type Messages } from '../../src/i18n/index.js';

// What every translation must satisfy. A new language file is checked here once registered.

afterEach(() => useMessages(en, 'en'));

describe.each(Object.entries(allLocales()))('messages: %s', (_, messages) => {
  it('has every English key, and no others', () => {
    expect(Object.keys(messages).filter((k) => !/_(zero|two|few|many)$/.test(k)).sort()).toEqual(Object.keys(en).sort());
  });

  it('keeps each message non-empty with the same {placeholders} as English', () => {
    for (const [key, text] of Object.entries(en)) {
      const translated = (messages as Record<string, string>)[key]!;
      expect(translated.trim(), key).not.toBe('');
      expect(placeholders(translated), key).toEqual(placeholders(text));
    }
  });
});

describe('detectLocale', () => {
  const supported = ['en', 'fr', 'pt-br'];
  it('prefers PROMPT_SHELF_LANG, then the system locale, matching region then language', () => {
    expect(detectLocale({ PROMPT_SHELF_LANG: 'fr', LANG: 'pt_BR.UTF-8' }, supported)).toBe('fr');
    expect(detectLocale({ LANG: 'pt_BR.UTF-8' }, supported)).toBe('pt-br');
    expect(detectLocale({ LC_ALL: 'fr_CA.UTF-8', LANG: 'pt_BR.UTF-8' }, supported)).toBe('fr');
  });

  it('falls back to English for C, unset or unsupported locales', () => {
    expect(detectLocale({ LANG: 'C' }, supported)).toBe('en');
    expect(detectLocale({}, supported)).toBe('en');
    expect(detectLocale({ LANG: 'ja_JP.UTF-8' }, supported)).toBe('en');
  });
});

describe('t', () => {
  it('fills placeholders and leaves unknown ones visible', () => {
    expect(t('save.stashed', { count: 3 })).toBe('stashed (3)');
    expect(t('save.stashed')).toBe('stashed ({count})');
  });

  it('uses the language switched to', () => {
    useMessages({ ...en, 'save.nothing': 'rien à ranger' } as Messages, 'fr');
    expect(t('save.nothing')).toBe('rien à ranger');
  });
});
