/**
 * P4-0 — tiny i18n runtime. The dictionaries in `src/locale/*` are the single
 * source of user-facing copy; every UI string routes through `t()`.
 *
 * Design notes:
 * - Two-language union (`zh-TW` | `en`); keep it small and stable — other P4
 *   slices import this shape and must not have to widen it.
 * - Vitest runs under `node` with no `window`/`localStorage`/`navigator`, so
 *   every browser-global read is guarded and the module never throws on import.
 * - `onLangChange` lets live UI (Phaser HUD, DOM lobby) re-render on a language
 *   flip without each call site re-reading `localStorage`.
 */
import en from './locale/en';
import zhTW from './locale/zh-TW';

export type Lang = 'zh-TW' | 'en';

export const LANGS: readonly Lang[] = ['zh-TW', 'en'];

const DICTS: Record<Lang, Record<string, string>> = { 'zh-TW': zhTW, en };
const STORAGE_KEY = 'otty.lang';

const isLang = (v: unknown): v is Lang => v === 'zh-TW' || v === 'en';

function detectInitialLang(): Lang {
  try {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (isLang(saved)) return saved;
  } catch {
    /* localStorage blocked (private mode / node) — fall through */
  }
  try {
    if (typeof navigator !== 'undefined' && navigator.language?.startsWith('zh')) return 'zh-TW';
  } catch {
    /* no navigator (node) */
  }
  // Default to zh-TW: the game's primary audience and its source-of-truth copy.
  return 'zh-TW';
}

let lang: Lang = detectInitialLang();
const listeners = new Set<(l: Lang) => void>();

/** Translate a key, interpolating `{var}` placeholders. Missing key -> key. */
export const t = (key: string, vars: Record<string, string | number> = {}): string => {
  const template = DICTS[lang][key] ?? key;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
};

export const getLang = (): Lang => lang;

/** Set the active language, persist it, and notify subscribers if it changed. */
export const setLang = (next: Lang): void => {
  if (next === lang) return;
  lang = next;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* persistence is best-effort */
  }
  for (const cb of listeners) cb(lang);
};

/** Flip to the other language and return the new one. */
export const toggleLang = (): Lang => {
  setLang(lang === 'zh-TW' ? 'en' : 'zh-TW');
  return lang;
};

/** Subscribe to language changes; returns an unsubscribe function. */
export const onLangChange = (cb: (l: Lang) => void): (() => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
