/**
 * window.__otty — the read-only state snapshot that Playwright asserts
 * against (CLAUDE.md rule 5). PURE builder so its shape is unit-tested.
 *
 * P1-08 addition (additive, existing fields untouched): `items` lists the
 * ground items with positions so the full-round E2E bot can navigate to
 * branches. `itemsOnGround` is kept for older specs (= items.length).
 */
import type { GameState } from '../core/types';

export interface SnapshotItem {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly type: string;
}

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
  /** Items currently lying on the ground (held items are excluded). */
  readonly items: readonly SnapshotItem[];
  /** P2-06: active sudden-event hazards (null when none / disabled). */
  readonly hazards: {
    readonly eagle: { readonly phase: 'warning' | 'swoop' | 'carry'; readonly x: number; readonly y: number } | null;
    readonly bear: { readonly phase: 'approach' | 'leaving'; readonly x: number; readonly y: number } | null;
  } | null;
}

export function buildSnapshot(state: GameState): OttySnapshot {
  const otters: Record<string, { x: number; y: number; action: string; carrying: string | null }> =
    {};
  for (const o of Object.values(state.otters)) {
    otters[o.id] = { x: o.pos.x, y: o.pos.y, action: o.action, carrying: o.carrying };
  }
  const items: SnapshotItem[] = [];
  for (const i of Object.values(state.items)) {
    if (i.heldBy === null) items.push({ id: i.id, x: i.pos.x, y: i.pos.y, type: i.type });
  }
  return {
    ready: true,
    tick: state.tick,
    phase: state.phase,
    timerMs: state.timerMs,
    dam: { progress: state.dam.progress, required: state.dam.required },
    otters,
    itemsOnGround: items.length,
    items,
    hazards: state.hazards
      ? {
          eagle: state.hazards.eagle
            ? { phase: state.hazards.eagle.phase, x: state.hazards.eagle.pos.x, y: state.hazards.eagle.pos.y }
            : null,
          bear: state.hazards.bear
            ? { phase: state.hazards.bear.phase, x: state.hazards.bear.pos.x, y: state.hazards.bear.pos.y }
            : null,
        }
      : null,
  };
}

export function publishSnapshot(state: GameState): void {
  (window as unknown as Record<string, unknown>).__otty = buildSnapshot(state);
}
