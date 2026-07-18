/**
 * P4-0: i18n foundation. Small, stable API — later P4 branches depend on
 * `t()`/`setLang()`/`getLang()` staying as they are here; add new keys to
 * both locale dictionaries, don't change this module's shape.
 *
 * Imported by vitest under node (no window/localStorage/navigator), so all
 * browser-global access is guarded with try/catch or typeof checks.
 */
import zhTW from './locale/zh-TW';
import en from './locale/en';

const dicts = { 'zh-TW': zhTW, en } as const;
export type Lang = keyof typeof dicts;

function isLang(v: string | null | undefined): v is Lang {
  return v === 'zh-TW' || v === 'en';
}

function detectInitialLang(): Lang {
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('otty.lang');
      if (isLang(stored)) return stored;
    }
  } catch {
    // localStorage unavailable (privacy mode, node, etc.) — fall through.
  }
  try {
    if (typeof navigator !== 'undefined' && navigator.language?.startsWith('zh')) {
      return 'zh-TW';
    }
  } catch {
    // navigator unavailable (node) — fall through to default.
  }
  return typeof navigator !== 'undefined' ? 'en' : 'zh-TW';
}

let lang: Lang = detectInitialLang();

export function t(key: string, vars: Record<string, string | number> = {}): string {
  const dict = dicts[lang] as Record<string, string>;
  const template = dict[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

export function setLang(l: Lang): void {
  lang = l;
  try {
    localStorage.setItem('otty.lang', l);
  } catch {
    // no-op: localStorage unavailable (node/privacy mode).
  }
}

export function getLang(): Lang {
  return lang;
}
