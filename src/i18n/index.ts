import { en, type MessageKey } from './en.js';

// Messages in the user's language. Adding a language is one file with the same keys as en.ts
// (TypeScript rejects a missing or unknown key) plus one line in LOCALES below.

type PluralBase<K> = K extends `${infer B}_other` ? B : never;
type ExtraPluralForm = 'zero' | 'two' | 'few' | 'many';

/**
 * A translation: every English key, with the same `{placeholders}`. Languages with more plural
 * forms than English (e.g. Polish `_few`, `_many`) may add them for any counted message.
 */
export type Messages = Record<MessageKey, string> & Partial<Record<`${PluralBase<MessageKey>}_${ExtraPluralForm}`, string>>;

const LOCALES: Record<string, Messages> = { en };

/**
 * The language to use: PROMPT_SHELF_LANG, else the system locale (LC_ALL, LC_MESSAGES, LANG), as
 * a supported tag. `pt_BR.UTF-8` tries `pt-br`, then `pt`; anything unsupported is English.
 */
export function detectLocale(env: NodeJS.ProcessEnv = process.env, supported: string[] = Object.keys(LOCALES)): string {
  for (const value of [env.PROMPT_SHELF_LANG, env.LC_ALL, env.LC_MESSAGES, env.LANG]) {
    if (!value || value === 'C' || value === 'POSIX') continue;
    const tag = value.split('.')[0]!.replace('_', '-').toLowerCase();
    for (const candidate of [tag, tag.split('-')[0]!]) if (supported.includes(candidate)) return candidate;
  }
  return 'en';
}

let locale = detectLocale();
let messages: Messages = LOCALES[locale]!;

/** The language in use, e.g. for formatting dates the same way. */
export const currentLocale = (): string => locale;

/** Switches language; for tests and for trying a translation that isn't registered yet. */
export function useMessages(next: Messages, tag: string): void {
  messages = next;
  locale = tag;
}

const fill = (text: string, params: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));

/** The message for `key` in the current language, with `{placeholders}` filled in. */
export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  return fill(messages[key] ?? en[key], params);
}

/** A counted message in the form the language's plural rules pick for `count` (`_one`, `_few`, …, else `_other`), with `{count}`. */
export function tn(key: PluralBase<MessageKey>, count: number, params: Record<string, string | number> = {}): string {
  const form = new Intl.PluralRules(locale).select(count);
  const all = messages as Record<string, string | undefined>;
  const text = all[`${key}_${form}`] ?? all[`${key}_other`] ?? (en as Record<string, string>)[`${key}_other`]!;
  return fill(text, { count, ...params });
}

/** Every `{placeholder}` in a message, sorted; translations must keep the same set. */
export const placeholders = (text: string): string[] => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();

export const allLocales = (): Readonly<Record<string, Messages>> => LOCALES;
