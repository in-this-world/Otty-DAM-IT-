/**
 * P3 fix: randomRoomCode is the CLIENT-owned code that makes
 * filterBy(['roomCode']) matchable (join lands in the host's room, not a new
 * empty one). Also guards the code round-trip helpers it relies on.
 */
import { describe, expect, it } from 'vitest';
import {
  isValidRoomCode,
  joinLink,
  parseJoinLink,
  randomRoomCode,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
} from '../../../src/net/protocol';

describe('randomRoomCode (P3 filterBy fix)', () => {
  it('is always a valid room code', () => {
    for (let i = 0; i < 500; i++) {
      const code = randomRoomCode();
      expect(code).toHaveLength(ROOM_CODE_LENGTH);
      expect(isValidRoomCode(code)).toBe(true);
      for (const ch of code) expect(ROOM_CODE_ALPHABET).toContain(ch);
    }
  });

  it('is deterministic under an injected rand (testable, no I/O)', () => {
    const seq = [0, 0.5, 0.99, 0.25];
    let i = 0;
    const rand = () => seq[i++ % seq.length]!;
    // floor(rand * 24): 0 -> A, 0.5*24=12 -> N, 0.99*24=23 -> Z, 0.25*24=6 -> G
    expect(randomRoomCode(rand)).toBe('ANZG');
  });

  it('round-trips through the share link so joiner rejoins the same room', () => {
    const code = randomRoomCode();
    expect(parseJoinLink(joinLink(code))).toBe(code);
  });
});
