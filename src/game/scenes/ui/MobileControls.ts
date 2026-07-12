/**
 * P2-06 mobile controls — Phaser 演出 layer (thin).
 *
 * A left-hand virtual joystick + right-hand action buttons. All the maths
 * (offset -> directions) lives in the pure, unit-tested `touch.ts`; this class
 * only draws the widgets, tracks touch pointers, and exposes the currently
 * held logical inputs as a Partial<InputSnapshot> for GameScene to OR into the
 * keyboard snapshot (mergeSnapshots). No game rules here (CLAUDE.md rule 2).
 */
import Phaser from 'phaser';
import type { InputSnapshot } from '../../input';
import { clampKnob, joystickDirections } from '../../touch';

type ButtonKey = 'interact' | 'build' | 'poke' | 'swim' | 'throw' | 'dig' | 'eat';

interface ActionButton {
  readonly key: ButtonKey;
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly circle: Phaser.GameObjects.Arc;
}

const JOY_BASE = { x: 120, y: 430, radius: 66 } as const;

const BUTTONS: readonly { key: ButtonKey; x: number; y: number; r: number; label: string; color: number }[] = [
  { key: 'interact', x: 858, y: 452, r: 42, label: '撿/放', color: 0x3a7d44 },
  { key: 'build', x: 852, y: 356, r: 34, label: '建', color: 0x8b5a2b },
  { key: 'poke', x: 770, y: 420, r: 34, label: '戳', color: 0xb5462f },
  { key: 'swim', x: 782, y: 326, r: 30, label: '游', color: 0x2f6f9f },
  // P2-10: throw / dig / eat
  { key: 'throw', x: 706, y: 476, r: 30, label: '丟', color: 0xa2762d },
  { key: 'dig', x: 700, y: 380, r: 30, label: '挖', color: 0x6b4a2b },
  { key: 'eat', x: 912, y: 356, r: 28, label: '吃', color: 0x4f8a5b },
];

export class MobileControls {
  private readonly container: Phaser.GameObjects.Container;
  private readonly knob: Phaser.GameObjects.Arc;
  private readonly buttons: ActionButton[] = [];

  private joyPointerId: number | null = null;
  private knobOffset = { dx: 0, dy: 0 };
  private readonly held: Record<ButtonKey, boolean> = {
    interact: false,
    build: false,
    poke: false,
    swim: false,
    throw: false,
    dig: false,
    eat: false,
  };
  /** pointerId -> which button it is pressing (for multi-touch release). */
  private readonly buttonPointers = new Map<number, ButtonKey>();

  constructor(private readonly scene: Phaser.Scene) {
    scene.input.addPointer(2); // allow joystick + a couple of buttons at once

    const base = scene.add
      .circle(JOY_BASE.x, JOY_BASE.y, JOY_BASE.radius, 0xffffff, 0.14)
      .setStrokeStyle(2, 0xffffff, 0.5);
    this.knob = scene.add.circle(JOY_BASE.x, JOY_BASE.y, 30, 0xffffff, 0.35);

    const objs: Phaser.GameObjects.GameObject[] = [base, this.knob];
    for (const b of BUTTONS) {
      const circle = scene.add.circle(b.x, b.y, b.r, b.color, 0.5).setStrokeStyle(2, 0xffffff, 0.7);
      const label = scene.add
        .text(b.x, b.y, b.label, { fontSize: '15px', color: '#ffffff' })
        .setOrigin(0.5);
      this.buttons.push({ key: b.key, x: b.x, y: b.y, r: b.r, circle });
      objs.push(circle, label);
    }

    this.container = scene.add.container(0, 0, objs).setDepth(1000).setScrollFactor(0);

    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onMove, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    scene.input.on(Phaser.Input.Events.GAME_OUT, this.releaseAll, this);
  }

  /** Currently held logical inputs (joystick directions + button presses). */
  snapshot(): Partial<InputSnapshot> {
    if (!this.container.visible) return {};
    const dirs = joystickDirections(this.knobOffset.dx, this.knobOffset.dy, JOY_BASE.radius);
    return { ...dirs, ...this.held };
  }

  setVisible(visible: boolean): void {
    this.container.setVisible(visible);
    if (!visible) this.releaseAll();
  }

  destroy(): void {
    const { input } = this.scene;
    input.off(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    input.off(Phaser.Input.Events.POINTER_MOVE, this.onMove, this);
    input.off(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    input.off(Phaser.Input.Events.GAME_OUT, this.releaseAll, this);
    this.container.destroy(true);
  }

  /* ------------------------------ pointers ------------------------------- */

  private onDown(pointer: Phaser.Input.Pointer): void {
    if (!this.container.visible) return;
    // Joystick claims a touch that lands near its base (generous grab area).
    if (this.joyPointerId === null && this.within(pointer, JOY_BASE.x, JOY_BASE.y, JOY_BASE.radius * 1.9)) {
      this.joyPointerId = pointer.id;
      this.updateKnob(pointer);
      return;
    }
    for (const b of this.buttons) {
      if (this.within(pointer, b.x, b.y, b.r + 8)) {
        this.held[b.key] = true;
        this.buttonPointers.set(pointer.id, b.key);
        return;
      }
    }
  }

  private onMove(pointer: Phaser.Input.Pointer): void {
    if (pointer.id === this.joyPointerId) this.updateKnob(pointer);
  }

  private onUp(pointer: Phaser.Input.Pointer): void {
    if (pointer.id === this.joyPointerId) {
      this.joyPointerId = null;
      this.knobOffset = { dx: 0, dy: 0 };
      this.knob.setPosition(JOY_BASE.x, JOY_BASE.y);
    }
    const btn = this.buttonPointers.get(pointer.id);
    if (btn) {
      this.held[btn] = false;
      this.buttonPointers.delete(pointer.id);
    }
  }

  private updateKnob(pointer: Phaser.Input.Pointer): void {
    const k = clampKnob(pointer.x - JOY_BASE.x, pointer.y - JOY_BASE.y, JOY_BASE.radius);
    this.knobOffset = k;
    this.knob.setPosition(JOY_BASE.x + k.dx, JOY_BASE.y + k.dy);
  }

  private within(pointer: Phaser.Input.Pointer, x: number, y: number, r: number): boolean {
    return Math.hypot(pointer.x - x, pointer.y - y) <= r;
  }

  private releaseAll(): void {
    this.joyPointerId = null;
    this.knobOffset = { dx: 0, dy: 0 };
    this.knob.setPosition(JOY_BASE.x, JOY_BASE.y);
    this.buttonPointers.clear();
    this.held.interact = this.held.build = this.held.poke = this.held.swim = false;
  }
}
