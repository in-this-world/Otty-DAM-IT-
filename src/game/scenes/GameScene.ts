/**
 * P1-05/06/07 + P2-08/09 art: the playable single-machine round.
 *
 * Reads core state via LocalAdapter and renders it — no game rules live here
 * (CLAUDE.md rule 2). Wave-2 art (obj_* props, dam stages, eagle/bear NPCs,
 * dizzy/win/lose clips) is mapped by the pure src/game/render-map module.
 *
 * Controls: Arrows/WASD move · E/Space pick up / drop · B build · F poke ·
 * C swim (toggle) · R restart.
 */
import Phaser from 'phaser';
import { LocalAdapter, type GameAdapter, type Unsubscribe } from '../../core/adapter';
import { planOtterCommands, recommendedAiCount } from '../../core/ai';
import { DEFAULT_OTTER_SPEED_PER_SEC } from '../../core/state';
import type { GameState } from '../../core/types';
import {
  CONE_HAT_FRAME,
  NPC,
  damStageFrame,
  itemFrame,
  otterAnimKey,
} from '../render-map';
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
const ITEM_DISPLAY_HEIGHT = 30;
const CONE_HAT_HEIGHT = 34;
const DAM_DISPLAY_HEIGHT = 104;
/** Local solo play spawns AI teammates to fill out a small party (P2-05). */
const HUMAN_COUNT = 1;
const DEFAULT_PARTY_SIZE = 3;
/** AI otters move at this % of normal speed by default (?aiSpeed overrides). */
const DEFAULT_AI_SPEED_PCT = 55;
/** Placeholder water zone (P2-03): float + raft + wash-off debuff. Real
 *  level layout arrives with P4 art. */
const WATER = [{ x: 40, y: 372, width: 250, height: 140 }] as const;

export class GameScene extends Phaser.Scene {
  private adapter!: GameAdapter;
  private unsubscribe: Unsubscribe | null = null;
  private latest: GameState | null = null;

  private readonly codesDown = new Set<string>();
  private tracker: InputTracker = INITIAL_TRACKER;

  private otterSprites = new Map<string, Phaser.GameObjects.Sprite>();
  private coneHats = new Map<string, Phaser.GameObjects.Sprite>();
  private itemSprites = new Map<string, Phaser.GameObjects.Sprite>();
  private damZone!: Phaser.GameObjects.Rectangle;
  private damSprite!: Phaser.GameObjects.Sprite;
  private hudBarBg!: Phaser.GameObjects.Rectangle;
  private hudBarFill!: Phaser.GameObjects.Rectangle;
  private hudTimer!: Phaser.GameObjects.Text;
  private overlay: Phaser.GameObjects.Container | null = null;

  private mobileControls!: MobileControls;
  // P2-08/09: real NPC art (eagle keeps a ground shadow as its telegraph).
  private eagleShadow: Phaser.GameObjects.Ellipse | null = null;
  private eagleSprite: Phaser.GameObjects.Sprite | null = null;
  private bearSprite: Phaser.GameObjects.Sprite | null = null;

  constructor() {
    super('Game');
  }

  create(): void {
    const params = parseGameParams(window.location.search);
    // AI teammates fill the party for single-machine play; ?ai=N overrides
    // (E2E pins ?ai=0 for a deterministic single-otter round).
    const aiCount = params.ai ?? recommendedAiCount(HUMAN_COUNT, DEFAULT_PARTY_SIZE);
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
      ...(params.required !== null ? { damRequiredPerPlayer: params.required } : {}),
      ...(params.hazards ? { hazards: { enabled: true } } : {}),
    });

    this.cameras.main.setBackgroundColor('#2d6a7a');
    this.createWater();
    this.createDam();
    this.createHud();

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
        sprite.setScale(OTTER_DISPLAY_HEIGHT / sprite.height);
        this.otterSprites.set(o.id, sprite);
      }
      sprite.setPosition(o.pos.x, o.pos.y);
      sprite.setFlipX(o.facing === 'left');
      const key = otterAnimKey(o, state.phase);
      if (sprite.anims.currentAnim?.key !== key && this.anims.exists(key)) {
        sprite.play(key);
      }
      this.renderConeHat(o.id, o.hat === 'cone', o.pos.x, o.pos.y);
    }
  }

  /** Whether the atlas actually has a frame (guards against art gaps). */
  private hasFrame(frame: string): boolean {
    return this.textures.get(OTTER_TEXTURE).has(frame);
  }

  /** Small cone worn above the head while an otter holds the cone hat (P2-01). */
  private renderConeHat(id: string, wearing: boolean, x: number, y: number): void {
    let hat = this.coneHats.get(id);
    if (!wearing) {
      hat?.setVisible(false);
      return;
    }
    if (!hat) {
      if (!this.hasFrame(CONE_HAT_FRAME)) return;
      hat = this.add.sprite(x, y, OTTER_TEXTURE, CONE_HAT_FRAME);
      hat.setScale(CONE_HAT_HEIGHT / hat.height);
      this.coneHats.set(id, hat);
    }
    hat.setVisible(true).setPosition(x, y - OTTER_DISPLAY_HEIGHT * 0.52);
  }

  private renderItems(state: GameState): void {
    const seen = new Set<string>();
    for (const item of Object.values(state.items)) {
      if (item.heldBy !== null) {
        this.itemSprites.get(item.id)?.setVisible(false);
        continue;
      }
      seen.add(item.id);
      let sprite = this.itemSprites.get(item.id);
      if (!sprite) {
        const frame = itemFrame(item.type);
        if (!this.hasFrame(frame)) continue;
        sprite = this.add.sprite(item.pos.x, item.pos.y, OTTER_TEXTURE, frame);
        sprite.setScale(ITEM_DISPLAY_HEIGHT / sprite.height);
        this.itemSprites.set(item.id, sprite);
      }
      sprite.setVisible(true).setPosition(item.pos.x, item.pos.y);
    }
    for (const [id, sprite] of this.itemSprites) {
      if (!seen.has(id) && state.items[id] === undefined) {
        sprite.destroy();
        this.itemSprites.delete(id);
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
      .rectangle(site.x, site.y, 240, 72, 0x4a3421, 0.2)
      .setStrokeStyle(2, 0xd9b380);
    // staged dam sprite; frame set each tick from progress (render-map).
    this.damSprite = this.add.sprite(site.x, site.y + 24, OTTER_TEXTURE, 'obj_dam_0').setOrigin(0.5, 1);
    if (this.damSprite.height > 0) this.damSprite.setScale(DAM_DISPLAY_HEIGHT / this.damSprite.height);
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
    this.hudTimer.setText(formatTime(state.timerMs));
    const frame = damStageFrame(state.dam.progress, state.dam.required, state.phase);
    if (this.hasFrame(frame) && this.damSprite.frame.name !== frame) {
      this.damSprite.setFrame(frame);
    }
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

  /** P2-08/09: eagle + bear NPCs from state.hazards, real animated sprites. */
  private renderHazards(state: GameState): void {
    const eagle = state.hazards?.eagle ?? null;
    if (eagle) {
      const { x, y } = eagle.pos;
      const warning = eagle.phase === 'warning';
      if (!this.eagleShadow) this.eagleShadow = this.add.ellipse(x, y, 70, 30, 0x000000, 0.35);
      this.eagleShadow.setPosition(x, y).setVisible(true).setAlpha(warning ? 0.3 : 0.5);
      if (!this.eagleSprite) this.eagleSprite = this.makeNpc(NPC.eagle.animKey, NPC.eagle.displayHeight);
      // bird circles high during the warning, then dives onto the target.
      this.eagleSprite?.setPosition(x, y - (warning ? 120 : 16)).setVisible(true);
    } else {
      this.eagleShadow?.setVisible(false);
      this.eagleSprite?.setVisible(false);
    }

    const bear = state.hazards?.bear ?? null;
    if (bear) {
      const { x, y } = bear.pos;
      if (!this.bearSprite) this.bearSprite = this.makeNpc(NPC.bear.animKey, NPC.bear.displayHeight);
      // face the target it is lumbering toward (defaults to right-facing art).
      let target: { readonly x: number; readonly y: number } | null = null;
      if (bear.targetOtterId) target = state.otters[bear.targetOtterId]?.pos ?? null;
      else if (bear.targetItemId) target = state.items[bear.targetItemId]?.pos ?? null;
      if (this.bearSprite) {
        this.bearSprite.setPosition(x, y).setVisible(true);
        if (target) this.bearSprite.setFlipX(target.x < x);
      }
    } else {
      this.bearSprite?.setVisible(false);
    }
  }

  /** Create an NPC sprite playing `animKey`, scaled to `displayHeight`. */
  private makeNpc(animKey: string, displayHeight: number): Phaser.GameObjects.Sprite | null {
    const sprite = this.add.sprite(0, 0, OTTER_TEXTURE);
    if (sprite.height > 0) sprite.setScale(displayHeight / sprite.height);
    if (this.anims.exists(animKey)) sprite.play(animKey);
    return sprite;
  }

  /* ------------------------------ lifecycle ------------------------------ */

  private restart(): void {
    this.teardown();
    this.otterSprites.clear();
    this.coneHats.clear();
    this.itemSprites.clear();
    this.overlay = null;
    this.eagleShadow = this.eagleSprite = null;
    this.bearSprite = null;
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
