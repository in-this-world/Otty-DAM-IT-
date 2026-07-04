/**
 * P1-05/06/07: the playable single-machine round.
 *
 * Reads core state via LocalAdapter and renders it — no game rules live
 * here (CLAUDE.md rule 2). Placeholder art for items/dam until P2-08.
 *
 * Controls: Arrows/WASD move · E/Space pick up / drop · B build · R restart.
 */
import Phaser from 'phaser';
import { LocalAdapter, type GameAdapter, type Unsubscribe } from '../../core/adapter';
import { planOtterCommands, recommendedAiCount } from '../../core/ai';
import { DEFAULT_OTTER_SPEED_PER_SEC } from '../../core/state';
import type { GameState } from '../../core/types';
import { animationKeyForAction } from '../anim/registry';
import {
  deriveCommands,
  INITIAL_TRACKER,
  mergeSnapshots,
  snapshotFromCodes,
  type InputTracker,
} from '../input';
import { parseGameParams } from '../params';
import { publishSnapshot } from '../snapshot';
import { formatTime, progressRatio } from './ui/format';
import { MobileControls } from './ui/MobileControls';
import { OTTER_TEXTURE } from './BootScene';

const PLAYER_ID = 'otter-1';
const WORLD = { width: 960, height: 540 };
const OTTER_DISPLAY_HEIGHT = 96;
/** Local solo play spawns AI teammates to fill out a small party (P2-05). */
const HUMAN_COUNT = 1;
const DEFAULT_PARTY_SIZE = 3;
/** AI otters move at this %% of normal speed by default (?aiSpeed overrides). */
const DEFAULT_AI_SPEED_PCT = 55;
/** Placeholder water zone (P2-03): float + raft + wash-off debuff. Real
 *  level layout arrives with P2-08/P4 art. */
const WATER = [{ x: 40, y: 372, width: 250, height: 140 }] as const;

export class GameScene extends Phaser.Scene {
  private adapter!: GameAdapter;
  private unsubscribe: Unsubscribe | null = null;
  private latest: GameState | null = null;

  private readonly codesDown = new Set<string>();
  private tracker: InputTracker = INITIAL_TRACKER;

  private otterSprites = new Map<string, Phaser.GameObjects.Sprite>();
  private itemDots = new Map<string, Phaser.GameObjects.Arc>();
  private damZone!: Phaser.GameObjects.Rectangle;
  private damFill!: Phaser.GameObjects.Rectangle;
  private hudBarBg!: Phaser.GameObjects.Rectangle;
  private hudBarFill!: Phaser.GameObjects.Rectangle;
  private hudTimer!: Phaser.GameObjects.Text;
  private overlay: Phaser.GameObjects.Container | null = null;

  private mobileControls!: MobileControls;
  // P2-06 hazard placeholders (real art: P2-08/09).
  private eagleShadow: Phaser.GameObjects.Ellipse | null = null;
  private eagleBird: Phaser.GameObjects.Arc | null = null;
  private bearBody: Phaser.GameObjects.Arc | null = null;
  private bearLabel: Phaser.GameObjects.Text | null = null;

  constructor() {
    super('Game');
  }

  create(): void {
    const params = parseGameParams(window.location.search);
    // AI teammates fill the party for single-machine play; ?ai=N overrides
    // (E2E pins ?ai=0 for a deterministic single-otter round).
    const aiCount = params.ai ?? recommendedAiCount(HUMAN_COUNT, DEFAULT_PARTY_SIZE);
    // AI otters move slower than the human so they don't zip around; ?aiSpeed
    // (percent of normal) tunes it.
    const aiSpeedPct = params.aiSpeed ?? DEFAULT_AI_SPEED_PCT;
    const aiSpeed = Math.round((DEFAULT_OTTER_SPEED_PER_SEC * aiSpeedPct) / 100);
    const speedByOtter: Record<string, number> = {};
    for (let i = HUMAN_COUNT + 1; i <= HUMAN_COUNT + aiCount; i++) {
      speedByOtter[`otter-${i}`] = aiSpeed;
    }
    this.adapter = new LocalAdapter({
      playerCount: HUMAN_COUNT + aiCount,
      seed: params.seed ?? (Date.now() % 0xffffffff) >>> 0,
      world: WORLD,
      water: WATER,
      speedByOtter,
      timerMs: params.timer ?? 180_000,
      // E2E hook (?required=N): shrink the win condition so a full
      // win round fits inside a test budget. Omitted -> core default.
      ...(params.required !== null ? { damRequiredPerPlayer: params.required } : {}),
      // P2-06: eagle/bear sudden events. On by default; ?hazards=0 disables
      // them (E2E determinism / stable screenshots).
      ...(params.hazards ? { hazards: { enabled: true } } : {}),
    });

    this.cameras.main.setBackgroundColor('#2d6a7a');
    this.createWater();
    this.createDam();
    this.createHud();

    // P2-06 mobile controls: shown on touch devices or a narrow viewport
    // (visibility recomputed each frame so rotate/resize toggles it).
    this.mobileControls = new MobileControls(this);
    this.mobileControls.setVisible(false);

    this.unsubscribe = this.adapter.onState((state) => {
      this.latest = state;
      publishSnapshot(state);
      this.driveAi(state);
    });

    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      this.codesDown.add(e.code);
      if (e.code === 'KeyR' && this.latest && this.latest.phase !== 'playing') {
        this.restart();
      }
    });
    this.input.keyboard?.on('keyup', (e: KeyboardEvent) => this.codesDown.delete(e.code));
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());

    if (params.freeze) {
      // deterministic screenshot mode: sim clock off, animations frozen
      this.anims.pauseAll();
    } else {
      this.adapter.start();
    }
    this.latest = this.adapter.getState();
    publishSnapshot(this.latest);
  }

  update(): void {
    const state = this.latest;
    if (!state) return;

    // input -> commands (pure mapping, unit-tested)
    const me = state.otters[PLAYER_ID];
    const snapshot = mergeSnapshots(
      snapshotFromCodes(this.codesDown),
      this.mobileControls.snapshot(),
    );
    const { commands, tracker } = deriveCommands(
      this.tracker,
      snapshot,
      PLAYER_ID,
      (me?.carrying ?? null) !== null,
    );
    this.tracker = tracker;
    for (const command of commands) this.adapter.sendCommand(command);

    this.renderOtters(state);
    this.renderItems(state);
    this.renderHazards(state);
    this.renderDamAndHud(state);
    this.renderOverlay(state);
    this.mobileControls.setVisible(this.shouldShowMobile() && state.phase === 'playing');
  }

  /* ------------------------------ rendering ------------------------------ */

  private renderOtters(state: GameState): void {
    for (const o of Object.values(state.otters)) {
      let sprite = this.otterSprites.get(o.id);
      if (!sprite) {
        sprite = this.add.sprite(o.pos.x, o.pos.y, OTTER_TEXTURE);
        const scale = OTTER_DISPLAY_HEIGHT / sprite.height;
        sprite.setScale(scale);
        this.otterSprites.set(o.id, sprite);
      }
      sprite.setPosition(o.pos.x, o.pos.y);
      sprite.setFlipX(o.facing === 'left');
      const key = animationKeyForAction(o.action);
      if (sprite.anims.currentAnim?.key !== key && this.anims.exists(key)) {
        sprite.play(key);
      }
    }
  }

  private renderItems(state: GameState): void {
    const seen = new Set<string>();
    for (const item of Object.values(state.items)) {
      if (item.heldBy !== null) {
        this.itemDots.get(item.id)?.setVisible(false);
        continue;
      }
      seen.add(item.id);
      let dot = this.itemDots.get(item.id);
      if (!dot) {
        // placeholder: branches are brown dots (real art arrives with P2-08)
        dot = this.add.circle(item.pos.x, item.pos.y, 7, 0x8b5a2b);
        this.itemDots.set(item.id, dot);
      }
      dot.setVisible(true).setPosition(item.pos.x, item.pos.y);
    }
    for (const [id, dot] of this.itemDots) {
      if (!seen.has(id) && state.items[id] === undefined) {
        dot.destroy();
        this.itemDots.delete(id);
      }
    }
  }

  /** P2-03: render placeholder water zones (otters float + form rafts here). */
  private createWater(): void {
    for (const w of WATER) {
      this.add
        .rectangle(w.x + w.width / 2, w.y + w.height / 2, w.width, w.height, 0x2f8fb0, 0.55)
        .setStrokeStyle(2, 0x8fdcef);
    }
  }

  /** P2-05: every non-player otter is AI — feed the planner's commands in. */
  private driveAi(state: GameState): void {
    for (const otter of Object.values(state.otters)) {
      if (otter.id === PLAYER_ID) continue;
      for (const command of planOtterCommands(state, otter.id)) {
        this.adapter.sendCommand(command);
      }
    }
  }

  private createDam(): void {
    const site = { x: WORLD.width / 2, y: 96 };
    this.damZone = this.add
      .rectangle(site.x, site.y, 240, 72, 0x4a3421, 0.35)
      .setStrokeStyle(2, 0xd9b380);
    this.damFill = this.add.rectangle(site.x - 120, site.y + 36, 0, 10, 0x8b5a2b).setOrigin(0, 1);
    this.add
      .text(site.x, site.y - 52, 'DAM', { fontSize: '16px', color: '#d9b380' })
      .setOrigin(0.5);
  }

  private createHud(): void {
    this.hudBarBg = this.add
      .rectangle(16, 16, 260, 18, 0x00304a)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0xffffff);
    this.hudBarFill = this.add.rectangle(18, 18, 0, 14, 0x62d96b).setOrigin(0, 0);
    this.hudTimer = this.add
      .text(WORLD.width - 16, 16, '--:--', { fontSize: '24px', color: '#ffffff' })
      .setOrigin(1, 0);
    this.add.text(16, 40, 'WASD/方向鍵移動 · E/空白鍵撿放 · B建造 · F戳人 · C游泳(切換)', {
      fontSize: '13px',
      color: '#cfe8ef',
    });
  }

  private renderDamAndHud(state: GameState): void {
    const ratio = progressRatio(state.dam.progress, state.dam.required);
    this.hudBarFill.width = 256 * ratio;
    this.damFill.width = 240 * ratio;
    this.hudTimer.setText(formatTime(state.timerMs));
  }

  private renderOverlay(state: GameState): void {
    if (state.phase === 'playing' || this.overlay) return;
    const won = state.phase === 'won';
    const title = won ? '水壩完工!全員獲勝 🎉' : '洪水來了……下次加油!';
    const box = this.add
      .rectangle(480, 270, 560, 200, 0x00304a, 0.92)
      .setStrokeStyle(2, 0xffffff)
      .setInteractive({ useHandCursor: true });
    box.on(Phaser.Input.Events.POINTER_DOWN, () => {
      if (this.latest && this.latest.phase !== 'playing') this.restart();
    });
    const t1 = this.add
      .text(480, 240, title, { fontSize: '30px', color: won ? '#62d96b' : '#ff8080' })
      .setOrigin(0.5);
    const t2 = this.add
      .text(480, 300, '按 R 再來一局', { fontSize: '18px', color: '#ffffff' })
      .setOrigin(0.5);
    this.overlay = this.add.container(0, 0, [box, t1, t2]);
  }

  /** Show mobile controls on touch devices or a narrow viewport (P2-06). */
  private shouldShowMobile(): boolean {
    return this.sys.game.device.input.touch || window.innerWidth < 820;
  }

  /** P2-06: draw placeholder eagle (shadow + bird) and bear from state.hazards. */
  private renderHazards(state: GameState): void {
    const eagle = state.hazards?.eagle ?? null;
    if (eagle) {
      const { x, y } = eagle.pos;
      const warning = eagle.phase === 'warning';
      if (!this.eagleShadow) this.eagleShadow = this.add.ellipse(x, y, 64, 28, 0x000000, 0.35);
      this.eagleShadow.setPosition(x, y).setVisible(true).setAlpha(warning ? 0.35 : 0.5);
      if (!this.eagleBird) this.eagleBird = this.add.circle(x, y, 16, 0x3a2c22);
      // bird hovers high during the warning, then dives onto the target
      this.eagleBird.setPosition(x, y - (warning ? 110 : 14)).setVisible(true);
    } else {
      this.eagleShadow?.setVisible(false);
      this.eagleBird?.setVisible(false);
    }

    const bear = state.hazards?.bear ?? null;
    if (bear) {
      const { x, y } = bear.pos;
      if (!this.bearBody) this.bearBody = this.add.circle(x, y, 22, 0x6b4a2b).setStrokeStyle(2, 0x3a2617);
      this.bearBody.setPosition(x, y).setVisible(true);
      if (!this.bearLabel)
        this.bearLabel = this.add.text(x, y, '熊', { fontSize: '18px', color: '#ffffff' }).setOrigin(0.5);
      this.bearLabel.setPosition(x, y).setVisible(true);
    } else {
      this.bearBody?.setVisible(false);
      this.bearLabel?.setVisible(false);
    }
  }

  /* ------------------------------ lifecycle ------------------------------ */

  private restart(): void {
    this.teardown();
    this.otterSprites.clear();
    this.itemDots.clear();
    this.overlay = null;
    this.eagleShadow = this.eagleBird = null;
    this.bearBody = null;
    this.bearLabel = null;
    this.tracker = INITIAL_TRACKER;
    this.scene.restart();
  }

  private teardown(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.mobileControls?.destroy();
    this.adapter.stop();
  }
}
