/** P3-05: nickname + hat/scarf colour persistence (no login). */
import { beforeEach, describe, expect, it } from 'vitest';
import { PLAYER_COLORS, defaultProfile } from '../../../src/net/protocol';
import {
  cycleColor,
  loadProfile,
  nameTagText,
  PROFILE_KEY,
  saveProfile,
  type KeyValueStore,
} from '../../../src/net/profile-store';

class FakeStore implements KeyValueStore {
  private m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
}

describe('profile-store (P3-05)', () => {
  let store: FakeStore;
  beforeEach(() => {
    store = new FakeStore();
  });

  it('returns a default profile when nothing is saved', () => {
    expect(loadProfile(store)).toEqual(defaultProfile());
    expect(loadProfile(null)).toEqual(defaultProfile());
  });

  it('round-trips a sanitized profile through storage', () => {
    const saved = saveProfile(store, {
      nickname: '  Splashy McDamface  ',
      hatColor: '#ff0000',
      scarfColor: '#00ff00',
    });
    expect(saved.nickname).toBe('Splashy McDa'); // trimmed + clamped to 12
    expect(store.getItem(PROFILE_KEY)).toContain('#ff0000');
    expect(loadProfile(store)).toEqual(saved);
  });

  it('falls back to default on corrupt JSON', () => {
    store.setItem(PROFILE_KEY, '{not json');
    expect(loadProfile(store)).toEqual(defaultProfile());
  });

  it('cycles palette colours in both directions and wraps', () => {
    expect(cycleColor(PLAYER_COLORS[0]!)).toBe(PLAYER_COLORS[1]);
    expect(cycleColor(PLAYER_COLORS[PLAYER_COLORS.length - 1]!)).toBe(PLAYER_COLORS[0]);
    expect(cycleColor(PLAYER_COLORS[0]!, -1)).toBe(PLAYER_COLORS[PLAYER_COLORS.length - 1]);
    expect(cycleColor('not-a-color')).toBe(PLAYER_COLORS[0]);
  });

  it('name tag falls back to the default nickname when empty', () => {
    expect(nameTagText({ nickname: 'Otto', hatColor: '#000000', scarfColor: '#000000' })).toBe('Otto');
    expect(nameTagText(null)).toBe(defaultProfile().nickname);
  });
});
