/**
 * Thin integration test for the P2-05 game-loop wiring (GameScene.driveAi).
 * GameScene needs Phaser so it can't run under Vitest, but the wiring
 * contract is: build a LocalAdapter (with P2-03 water config) and, each
 * tick, feed planOtterCommands() for every non-player otter back into the
 * adapter. This test exercises exactly that path.
 */
import { describe, expect, it } from 'vitest';
import { LocalAdapter, ManualScheduler } from '../../../src/core/adapter';
import { planOtterCommands } from '../../../src/core/ai';
import type { GameState } from '../../../src/core/types';

const PLAYER = 'otter-1';

describe('P2-05 wiring: AI teammates drive the dam through the adapter', () => {
  it('an idle human round is carried to victory by AI otters, water config accepted', () => {
    const scheduler = new ManualScheduler();
    const adapter = new LocalAdapter(
      {
        playerCount: 3, // 1 idle human + 2 AI teammates
        seed: 7,
        world: { width: 1000, height: 800 },
        timerMs: 240_000,
        water: [{ x: 40, y: 372, width: 250, height: 140 }], // P2-03 config path
      },
      { scheduler },
    );

    let latest: GameState = adapter.getState();
    adapter.onState((state) => {
      latest = state;
      for (const otter of Object.values(state.otters)) {
        if (otter.id === PLAYER) continue; // human is idle here
        for (const command of planOtterCommands(state, otter.id)) {
          adapter.sendCommand(command);
        }
      }
    });

    adapter.start();
    let guard = 0;
    while (latest.phase === 'playing' && guard++ < 6000) scheduler.advance(50);
    adapter.stop();

    expect(latest.phase).toBe('won');
    expect(latest.dam.progress).toBeGreaterThanOrEqual(latest.dam.required);
    // the human contributed nothing; the AI teammates did the work
    expect(latest.otters[PLAYER]?.score ?? 0).toBe(0);
  });
});
