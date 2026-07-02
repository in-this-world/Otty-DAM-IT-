/**
 * P1-07 HUD formatting helpers — PURE module (zero Phaser imports).
 * Used by both the HUD renderer and the window.__otty E2E snapshot, so the
 * E2E suite can assert "HUD shows exactly what the sim says".
 */

/**
 * Countdown as "mm:ss". Seconds are rounded UP so the display reads "04:00"
 * for a fresh 240 000 ms timer and only hits "00:00" when the round is truly
 * over. Negative / non-finite input clamps to "00:00".
 */
export function formatTime(ms: number): string {
  const totalSeconds = Number.isFinite(ms) ? Math.max(0, Math.ceil(ms / 1000)) : 0;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Dam progress as a fill ratio clamped to [0, 1].
 * required <= 0 means "nothing needed" -> the dam counts as complete (1).
 */
export function progressRatio(progress: number, required: number): number {
  if (!Number.isFinite(progress) || !Number.isFinite(required)) return 0;
  if (required <= 0) return 1;
  return Math.min(1, Math.max(0, progress / required));
}
