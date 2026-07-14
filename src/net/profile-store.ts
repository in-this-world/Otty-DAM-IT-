/**
 * 準備室 personalization persistence (P3-05). No login: a player's nickname
 * and hat/scarf colours live in localStorage so they carry across sessions.
 * Storage is injected (KeyValueStore) so this is unit-testable and SSR-safe.
 */
import {
  defaultProfile,
  PLAYER_COLORS,
  sanitizeProfile,
  type PlayerProfile,
} from './protocol';

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const PROFILE_KEY = 'otty.profile.v1';

/** Load + sanitize the saved profile, or a fresh default when none/invalid. */
export function loadProfile(store: KeyValueStore | null | undefined): PlayerProfile {
  if (!store) return defaultProfile();
  try {
    const raw = store.getItem(PROFILE_KEY);
    if (!raw) return defaultProfile();
    return sanitizeProfile(JSON.parse(raw) as Partial<PlayerProfile>);
  } catch {
    return defaultProfile();
  }
}

/** Sanitize + persist a profile; returns the cleaned value actually stored. */
export function saveProfile(
  store: KeyValueStore | null | undefined,
  profile: Partial<PlayerProfile>,
): PlayerProfile {
  const clean = sanitizeProfile(profile);
  try {
    store?.setItem(PROFILE_KEY, JSON.stringify(clean));
  } catch {
    // Private-mode / quota errors: keep the in-memory profile regardless.
  }
  return clean;
}

/** Next colour in the palette (wraps) — drives a 準備室 "change colour" tap. */
export function cycleColor(current: string, dir: 1 | -1 = 1): string {
  const i = PLAYER_COLORS.indexOf(current as (typeof PLAYER_COLORS)[number]);
  const n = PLAYER_COLORS.length;
  const next = i < 0 ? 0 : (i + dir + n) % n;
  return PLAYER_COLORS[next]!;
}

/** Overhead name-tag text for an otter, given its profile (P3-05 name tag). */
export function nameTagText(profile: PlayerProfile | null | undefined): string {
  const n = profile?.nickname?.trim();
  return n && n.length > 0 ? n : defaultProfile().nickname;
}
