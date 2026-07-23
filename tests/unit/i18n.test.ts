/**
 * P4-0 i18n foundation. The dictionary is the single source of user-facing
 * copy; every UI string routes through `t()`. Tests pin the stable API other
 * P4 slices build on (t / setLang / getLang / toggleLang / onLangChange) and
 * guard translation completeness so a key can never render in one language and
 * fall back to a raw key in the other (a UX regression the first build hit).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../../src/locale/en';
import zhTW from '../../src/locale/zh-TW';
import { getLang, onLangChange, setLang, t, toggleLang, type Lang } from '../../src/i18n';

describe('i18n', () => {
  beforeEach(() => setLang('zh-TW'));

  it('returns the key itself for a missing key', () => {
    expect(t('no.such.key')).toBe('no.such.key');
  });

  it('interpolates {var} placeholders', () => {
    setLang('en');
    expect(t('title.fish', { name: 'Otty' })).toContain('Otty');
  });

  it('leaves an unmatched placeholder in place when the var is absent', () => {
    expect(t('title.fish')).toContain('{name}');
  });

  it('switches language', () => {
    setLang('zh-TW');
    expect(t('ui.restart')).toBe('重新開始');
    setLang('en');
    expect(t('ui.restart')).toBe('Restart');
  });

  it('getLang reflects the last setLang', () => {
    setLang('en');
    expect(getLang()).toBe('en');
  });

  it('toggleLang flips between the two languages and returns the new one', () => {
    setLang('zh-TW');
    expect(toggleLang()).toBe('en');
    expect(getLang()).toBe('en');
    expect(toggleLang()).toBe('zh-TW');
  });

  it('notifies onLangChange subscribers and supports unsubscribe', () => {
    const spy = vi.fn();
    const off = onLangChange(spy);
    setLang('en');
    expect(spy).toHaveBeenCalledWith('en');
    off();
    setLang('zh-TW');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('does not notify subscribers when the language is unchanged', () => {
    setLang('en');
    const spy = vi.fn();
    onLangChange(spy);
    setLang('en');
    expect(spy).not.toHaveBeenCalled();
  });

  describe('translation completeness', () => {
    const enKeys = Object.keys(en).sort();
    const zhKeys = Object.keys(zhTW).sort();

    it('en and zh-TW define exactly the same keys', () => {
      expect(enKeys).toEqual(zhKeys);
    });

    it('has no blank values in either language', () => {
      for (const [k, v] of Object.entries(en)) expect(v.trim(), `en:${k}`).not.toBe('');
      for (const [k, v] of Object.entries(zhTW)) expect(v.trim(), `zh:${k}`).not.toBe('');
    });

    it('keeps the same {placeholders} in both languages for every key', () => {
      const slots = (s: string): string[] => (s.match(/\{(\w+)\}/g) ?? []).sort();
      for (const k of enKeys) {
        expect(slots(en[k]!), `placeholders differ for ${k}`).toEqual(slots(zhTW[k]!));
      }
    });
  });

  afterEach(() => setLang('zh-TW'));
});

// Compile-time guard: Lang stays a two-member union other slices can rely on.
const _langs: Lang[] = ['zh-TW', 'en'];
void _langs;
