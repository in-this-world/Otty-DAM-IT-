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
import type { GameState } from '../../core/types';
import { animationKeyForAction } from '../anim/registry';
import { deriveCommands, INITIAL_TRACKER, snapshotFromCodes, type InputTracker } from '../input';
import { publishSnapshot } from '../snapshot';
import { formatTime, progressRatio } from './ui/format';
import { OTTER_TEXTURE } from './BootScene';

const PLAYER_ID = 'otter-1';
const WORLD = { width: 960, height: 540 };
const OTTER_DISPLAY_HEIGHT = 96;

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

  constructor() {
    super('Game');
  }

  create(): void {
    this.adapter = new LocalAdapter({
      playerCount: 1,
      seed: (Date.now() % 0xffffffff) >>> 0,
      world: WORLD,
      timerMs: 180_000,
    });

    this.cameras.main.setBackgroundColor('#2d6a7a');
    this.createDam();
    this.createHud();

    this.unsubscribe = this.adapter.onState((state) => {
      this.latest = state;
      publishSnapshot(state);
    });

    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      this.codesDown.add(e.code);
      if (e.code === 'KeyR' && this.latest && this.latest.phase !== 'playing') {
        this.restart();
      }
    });
    this.input.keyboard?.on('keyup', (e: KeyboardEvent) => this.codesDown.delete(e.code));
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());

    this.adapter.start();
    this.latest = this.adapter.getState();
    publishSnapshot(this.latest);
  }

  update(): void {
    const state = this.latest;
    if (!state) return;

    // input -> commands (pure mapping, unit-tested)
    const me = state.otters[PLAYER_ID];
    const { commands, tracker } = deriveCommands(
      this.tracker,
      snapshotFromCodes(this.codesDown),
      PLAYER_ID,
      (me?.carrying ?? null) !== null,
    );
    this.tracker = tracker;
    for (const command of commands) this.adapter.sendCommand(command);

    this.renderOtters(state);
    this.renderItems(state);
    this.renderDamAndHud(state);
    this.renderOverlay(state);
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
    this.add.text(16, 40, 'WASD/方向鍵移動 · E/空白鍵撿放 · B建造', {
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
    const box = this.add.rectangle(480, 270, 560, 200, 0x00304a, 0.92).setStrokeStyle(2, 0xffffff);
    const t1 = this.add
      .text(480, 240, title, { fontSize: '30px', color: won ? '#62d96b' : '#ff8080' })
      .setOrigin(0.5);
    const t2 = this.add
      .text(480, 300, '按 R 再來一局', { fontSize: '18px', color: '#ffffff' })
      .setOrigin(0.5);
    this.overlay = this.add.container(0, 0, [box, t1, t2]);
  }

  /* ------------------------------ lifecycle ------------------------------ */

  private restart(): void {
    this.teardown();
    this.otterSprites.clear();
    this.itemDots.clear();
    this.overlay = null;
    this.tracker = INITIAL_TRACKER;
    this.scene.restart();
  }

  private teardown(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.adapter.stop();
  }
}
