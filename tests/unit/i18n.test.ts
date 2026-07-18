import { describe, it, expect } from 'vitest';
import { t, setLang, getLang } from '../../src/i18n';

describe('i18n', () => {
  it('returns the key itself when missing', () => {
    expect(t('no.such.key')).toBe('no.such.key');
  });

  it('interpolates vars', () => {
    setLang('en');
    expect(t('hint.needStick')).toBe('You need a stick!');
    expect(t('ui.restart')).toBe('Restart');
  });

  it('switches language', () => {
    setLang('zh-TW');
    expect(t('ui.restart')).toBe('重新開始');
    expect(getLang()).toBe('zh-TW');
  });

  it('interpolates {vars} in templates', () => {
    setLang('en');
    // uses a real key so this test stays meaningful after locale edits
    expect(t('lobby.roomTitle', { code: 'ABCD' })).toBe('Ready Room · Room ABCD');
  });
});
