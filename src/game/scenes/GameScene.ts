/**
 * P1-05/06/07 + P2-08/09 art: the playable single-machine round.
 *
 * Reads core state via LocalAdapter and renders it — no game rules live here
 * (CLAUDE.md rule 2). Wave-2 art (obj_* props, dam stages, eagle/bear NPCs,
 * dizzy/win/lose clips) is mapped by the pure src/game/render-map module;
 * the P2-09 tile background comes from the pure src/game/scene-map module.
 *
 * Controls: Arrows/WASD move · E/Space pick up / drop · B build · F poke ·
 * C swim (toggle) · T throw · G dig · Q eat · R restart.
 */
import Phaser from 'phaser';
import { LocalAdapter, type GameAdapter, type Unsubscribe } from '../../core/adapter';
import { BUILD_ZONE_HALF } from '../../core/dam';
import { planOtterCommands, recommendedAiCount } from '../../core/ai';
import { DEFAULT_OTTER_SPEED_PER_SEC,
  MULTIPLAYER_TIMER_MS,
  PLAY_WORLD,
} from '../../core/state';
import type { GameState } from '../../core/types';
import {
  CONE_HAT_FRAME,
  NPC,
  damStageFrame,
  heldOverlayFrame,
  itemFrame,
  otterAnimKey,
} from '../render-map';
import { transientAnimForEvent } from '../action-anim';
import { effectsForEvent, type EffectSpec } from '../effects';
import type { GameEvent } from '../../core/types';
import {
  deriveCommands,
  INITIAL_TRACKER,
  mergeSnapshots,
  snapshotFromCodes,
  type InputTracker,
} from '../input';
import { DAM_SITE, WATER_FRAME_MS, WATER_RECT, buildSceneLayout } from '../scene-map';
import { parseGameParams } from '../params';
import { publishSnapshot } from '../snapshot';
import { formatTime, progressRatio } from './ui/format';
import { MobileControls } from './ui/MobileControls';
import { OTTER_TEXTURE } from './BootScene';
import { t } from '../../i18n';

const PLAYER_ID = 'otter-1';
const WORLD = PLAY_WORLD;
const OTTER_DISPLAY_HEIGHT = 96;
const ITEM_DISPLAY_HEIGHT = 42;
const CONE_HAT_HEIGHT = 34;
const HELD_ITEM_HEIGHT = 30;
const DAM_DISPLAY_HEIGHT = 104;
const EFFECT_DISPLAY_HEIGHT = 40;
/** Local solo play spawns AI teammates to fill out a small party (P2-05). */
const HUMAN_COUNT = 1;
const DEFAULT_PARTY_SIZE = 3;
/** AI otters move at this % of normal speed by default (?aiSpeed overrides). */
const DEFAULT_AI_SPEED_PCT = 55;
/** Water zone (P2-03 float/raft/wash) — snapped to the P2-09 tile grid so
 *  gameplay bounds and the painted river agree (scene-map.WATER_RECT). */
const WATER = [WATER_RECT] as const;

export class GameScene extends Phaser.Scene {
  private adapter!: GameAdapter;
  /** Local otter id for input; null when spectating (P3-03). */
  private localId: string | null = PLAYER_ID;
  /** True when driven by an injected networked adapter (P3-02/03). */
  private networked = false;
  private unsubscribe: Unsubscribe | null = null;
  private eventsUnsub: Unsubscribe | null = null;
  /** Per-otter one-shot animation override (throw/dig/pick_stone/wash). */
  private transientAnims = new Map<string, { animKey: string; expiresAt: number }>();
  private latest: GameState | null = null;

  private readonly codesDown = new Set<string>();
  private tracker: InputTracker = INITIAL_TRACKER;

  private otterSprites = new Map<string, Phaser.GameObjects.Sprite>();
  private coneHats = new Map<string, Phaser.GameObjects.Sprite>();
  /** P2-11: small held-item sprite over the paws (fish/stone/dirt). */
  private heldOverlays = new Map<string, Phaser.GameObjects.Sprite>();
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
    // P3: a networked ColyseusAdapter may be injected by the lobby overlay via
    // the Phaser registry; otherwise run a single-machine LocalAdapter as before.
    const injected = this.game.registry.get('netAdapter') as GameAdapter | undefined;
    if (injected) {
      this.adapter = injected;
      this.networked = true;
      this.localId = (this.game.registry.get('netLocalId') as string | null) ?? null;
    } else {
      this.adapter = new LocalAdapter({
        playerCount: HUMAN_COUNT + aiCount,
        seed: params.seed ?? (Date.now() % 0xffffffff) >>> 0,
        world: WORLD,
        water: WATER,
        speedByOtter,
        timerMs: params.timer ?? MULTIPLAYER_TIMER_MS,
        ...(params.required !== null ? { damRequiredPerPlayer: params.required } : {}),
        ...(params.hazards ? { hazards: { enabled: true } } : {}),
      });
    }

    this.cameras.main.setBackgroundColor('#87b558');
    this.createBackground(params.freeze);
    this.createDam();
    this.createHud();

    this.mobileControls = new MobileControls(this);
    this.mobileControls.setVisible(false);

    this.unsubscribe = this.adapter.onState((state) => {
      this.latest = state;
      publishSnapshot(state);
      if (!this.networked) this.driveAi(state);
    });
    // P2-09 juice: transient action clips + impact/splash effect sprites.
    this.eventsUnsub = this.adapter.onEvents((events) => this.handleEvents(events));

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
    try {
      this.latest = this.adapter.getState();
      publishSnapshot(this.latest);
    } catch {
      // Networked: no snapshot until the first server tick arrives.
    }
  }

  update(): void {
    const state = this.latest;
    if (!state) return;

    const me = this.localId ? state.otters[this.localId] : undefined;
    const snapshot = mergeSnapshots(
      snapshotFromCodes(this.codesDown),
      this.mobileControls.snapshot(),
    );
    if (this.localId) {
      const { commands, tracker } = deriveCommands(
        this.tracker,
        snapshot,
        this.localId,
        (me?.carrying ?? null) !== null,
      );
      this.tracker = tracker;
      for (const command of commands) this.adapter.sendCommand(command);
    }

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
      let key = otterAnimKey(o, state.phase);
      const override = this.transientAnims.get(o.id);
      // transient clips override the base action, but not win/lose/dizzy states.
      if (override && this.time.now < override.expiresAt && state.phase === 'playing' && o.stunnedMs <= 0) {
        key = override.animKey;
      }
      if (sprite.anims.currentAnim?.key !== key && this.anims.exists(key)) {
        sprite.play(key);
      }
      this.renderConeHat(o.id, o.hat === 'cone', o.pos.x, o.pos.y);
      this.renderHeldItem(o.id, o.carrying, o.pos.x, o.pos.y, o.facing === 'left');
    }
  }

  /** P2-11: carry/build art bakes in a branch — overlay other materials. */
  private renderHeldItem(
    id: string,
    carrying: import('../../core/types').ItemType | null,
    x: number,
    y: number,
    facingLeft: boolean,
  ): void {
    const frame = heldOverlayFrame(carrying);
    let overlay = this.heldOverlays.get(id);
    if (!frame) {
      overlay?.setVisible(false);
      return;
    }
    if (!overlay) {
      if (!this.hasFrame(frame)) return;
      overlay = this.add.sprite(x, y, OTTER_TEXTURE, frame);
      this.heldOverlays.set(id, overlay);
    }
    if (overlay.frame.name !== frame) overlay.setFrame(frame);
    overlay.setScale(HELD_ITEM_HEIGHT / (overlay.frame.height || HELD_ITEM_HEIGHT));
    overlay
      .setVisible(true)
      .setFlipX(facingLeft)
      .setPosition(x + (facingLeft ? -26 : 26), y + 10);
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

  /** P2-09: painted tile background (grass / river / forest / decor) from the
   *  pure scene-map layout. Water cells cycle frames unless ?freeze pins them
   *  (deterministic E2E screenshots). */
  private createBackground(freeze: boolean): void {
    if (!this.textures.exists('tile_grass')) {
      // tile art missing (tests / partial builds): keep the old flat look.
      for (const w of WATER) {
        this.add
          .rectangle(w.x + w.width / 2, w.y + w.height / 2, w.width, w.height, 0x2f8fb0, 0.55)
          .setStrokeStyle(2, 0x8fdcef);
      }
      return;
    }
    const layout = buildSceneLayout(WORLD);
    for (const t of layout.tiles) {
      this.add
        .image(t.x, t.y, t.texture, t.frame)
        .setDisplaySize(t.size, t.size)
        .setFlipX(t.flipX ?? false);
    }
    const waterImages = layout.animatedWater.map((t) =>
      this.add.image(t.x, t.y, t.texture, t.frame).setDisplaySize(t.size, t.size),
    );
    if (!freeze && waterImages.length > 0) {
      let waterFrame = 0;
      this.time.addEvent({
        delay: WATER_FRAME_MS,
        loop: true,
        callback: () => {
          waterFrame = (waterFrame + 1) % 4;
          for (const img of waterImages) img.setFrame(waterFrame);
        },
      });
    }
    for (const d of layout.decor) {
      if (!this.hasFrame(d.frame)) continue;
      const img = this.add.image(d.x, d.y, OTTER_TEXTURE, d.frame);
      if (img.height > 0) img.setScale(d.height / img.height);
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
    const site = DAM_SITE;
    // P2-12: the drawn zone IS the core build zone (no more invisible slack).
    this.damZone = this.add
      .rectangle(site.x, site.y, BUILD_ZONE_HALF.w * 2, BUILD_ZONE_HALF.h * 2, 0x4a3421, 0.2)
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
    this.add.text(16, 40, t('hud.controls'), {
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
    const title = won ? t('game.win') : t('game.lose');
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
      .text(480, 300, t('game.restartHint'), { fontSize: '18px', color: '#ffffff' })
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

  /** P2-09: turn per-tick core events into transient anims + effect sprites. */
  private handleEvents(events: readonly GameEvent[]): void {
    const state = this.latest;
    if (!state) return;
    for (const ev of events) {
      const ta = transientAnimForEvent(ev);
      if (ta && this.anims.exists(ta.animKey)) {
        this.transientAnims.set(ta.otterId, { animKey: ta.animKey, expiresAt: this.time.now + ta.durationMs });
      }
      for (const fx of effectsForEvent(ev, state)) this.spawnEffect(fx);
      // P4-1: no-stick poke rejection — only toast for the LOCAL player's
      // own command, so a shared/networked event stream doesn't pop a hint
      // for every otter in the room.
      if (
        ev.type === 'commandRejected' &&
        ev.command === 'poke' &&
        ev.reason === 'noStick' &&
        ev.playerId === this.localId
      ) {
        this.showToast(t('hint.needStick'));
      }
    }
  }

  /** P4-1: brief on-screen toast (fades over ~1.5s) for a rejected command. */
  private showToast(message: string): void {
    const text = this.add
      .text(480, 470, message, {
        fontSize: '18px',
        color: '#ffe066',
        backgroundColor: '#00304aee',
        padding: { x: 12, y: 6 },
      })
      .setOrigin(0.5)
      .setDepth(1000);
    this.tweens.add({
      targets: text,
      alpha: 0,
      delay: 900,
      duration: 600,
      onComplete: () => text.destroy(),
    });
  }

  /** Spawn a short-lived sprite that rises + fades, then destroys itself. */
  private spawnEffect(fx: EffectSpec): void {
    if (!this.hasFrame(fx.frame)) return;
    const sprite = this.add.sprite(fx.x, fx.y, OTTER_TEXTURE, fx.frame);
    if (sprite.height > 0) sprite.setScale(EFFECT_DISPLAY_HEIGHT / sprite.height);
    this.tweens.add({
      targets: sprite,
      alpha: 0,
      y: fx.y - fx.riseY,
      duration: fx.ttlMs,
      ease: 'Quad.easeOut',
      onComplete: () => sprite.destroy(),
    });
  }

  /* ------------------------------ lifecycle ------------------------------ */

  private restart(): void {
    this.teardown();
    this.otterSprites.clear();
    this.coneHats.clear();
    this.heldOverlays.clear();
    this.itemSprites.clear();
    this.overlay = null;
    this.eagleShadow = this.eagleSprite = null;
    this.bearSprite = null;
    this.transientAnims.clear();
    this.eventsUnsub = null;
    this.tracker = INITIAL_TRACKER;
    this.scene.restart();
  }

  private teardown(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.eventsUnsub?.();
    this.eventsUnsub = null;
    this.mobileControls?.destroy();
    this.adapter.stop();
  }
}
