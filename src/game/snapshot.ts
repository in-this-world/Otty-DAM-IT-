/**
 * window.__otty — the read-only state snapshot that Playwright asserts
 * against (CLAUDE.md rule 5). PURE builder so its shape is unit-tested.
 */
import type { GameState } from '../core/types';

export interface OttySnapshot {
  readonly ready: boolean;
  readonly tick: number;
  readonly phase: GameState['phase'];
  readonly timerMs: number;
  readonly dam: { readonly progress: number; readonly required: number };
  readonly otters: Readonly<
    Record<string, { x: number; y: number; action: string; carrying: string | null }>
  >;
  readonly itemsOnGround: number;
}

export function buildSnapshot(state: GameState): OttySnapshot {
  const otters: Record<string, { x: number; y: number; action: string; carrying: string | null }> =
    {};
  for (const o of Object.values(state.otters)) {
    otters[o.id] = { x: o.pos.x, y: o.pos.y, action: o.action, carrying: o.carrying };
  }
  return {
    ready: true,
    tick: state.tick,
    phase: state.phase,
    timerMs: state.timerMs,
    dam: { progress: state.dam.progress, required: state.dam.required },
    otters,
    itemsOnGround: Object.values(state.items).filter((i) => i.heldBy === null).length,
  };
}

export function publishSnapshot(state: GameState): void {
  (window as unknown as Record<string, unknown>).__otty = buildSnapshot(state);
}
