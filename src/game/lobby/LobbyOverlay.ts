/**
 * 大廳 / 準備室 DOM overlay (P3-03 + P3-05). Rendered outside Phaser so it can
 * show before the game boots and during reconnects. Pure-logic bits it leans
 * on (code validation, connection state, profile persistence) are unit-tested;
 * this file is the untested DOM glue that wires them to a Colyseus room.
 *
 * Flow: pick nickname + colours (persisted, no login) -> Create or Join r/ABCD
 * -> 準備室 roster with ready toggles + a share link -> owner starts -> resolve
 * with a connected ColyseusAdapter for GameScene. Late joiners spectate.
 */
import type { GameAdapter } from '../../core/adapter';
import { ColyseusAdapter } from '../../net/ColyseusAdapter';
import { joinRoom, transportForRoom } from '../../net/colyseus-connect';
import { LobbyController } from '../../net/lobby-controller';
import {
  ClientMessage,
  joinLink,
  PLAYER_COLORS,
  ServerMessage,
  type ClearDrawingBroadcast,
  type DrawBroadcast,
  type PlayerProfile,
  type RosterEntry,
  type RosterPayload,
} from '../../net/protocol';
import { makeDrawBatch } from '../../net/draw-batch';
import { cycleColor, loadProfile, saveProfile } from '../../net/profile-store';
import { getLang, setLang, t } from '../../i18n';

export interface LobbyResult {
  readonly adapter: GameAdapter;
  readonly localPlayerId: string | null;
  readonly spectator: boolean;
  readonly roomCode: string;
}

/** Narrow room shape the ready-room screen + drawing canvas need. Both the
 *  real colyseus.js Room and test doubles satisfy this structurally. */
interface RoomLike {
  readonly sessionId: string;
  send(type: string, message?: unknown): void;
  onMessage(type: string, handler: (message: unknown) => void): void;
}

/** P4-7: live state for the shared 準備室 drawing canvas + its teardown. */
interface DrawingCanvasHandle {
  readonly wrap: HTMLElement;
  stop(): void;
}

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  style: Partial<CSSStyleDeclaration> = {},
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  Object.assign(node, props);
  Object.assign(node.style, style);
  return node;
};

/** P4-7: draw a full polyline (used for a full redraw after a clear). */
function strokeLine(ctx: CanvasRenderingContext2D, color: string, pts: readonly (readonly [number, number])[]): void {
  if (pts.length === 0) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0]![0], pts[0]![1]);
  for (const [x, y] of pts) ctx.lineTo(x, y);
  ctx.stroke();
}

/** P4-7: append newly-arrived points to an in-progress stroke without
 *  redrawing the whole canvas — `from` bridges the gap from the previous
 *  flushed batch so the line stays continuous across batch boundaries. */
function strokeSegment(
  ctx: CanvasRenderingContext2D,
  color: string,
  from: readonly [number, number] | undefined,
  pts: readonly (readonly [number, number])[],
): void {
  const chain = from ? [from, ...pts] : pts;
  strokeLine(ctx, color, chain);
}

export interface LobbyOptions {
  readonly serverUrl: string;
  /** Pre-filled room code from a #/r/ABCD deep link. */
  readonly initialCode?: string | null;
  readonly storage?: Storage;
}

export class LobbyOverlay {
  private readonly root: HTMLDivElement;
  private readonly controller = new LobbyController();
  private profile: PlayerProfile;
  private resolve!: (r: LobbyResult) => void;
  /** Re-renders whichever screen is currently shown; refreshed by each
   *  render* method so the language toggle can redraw in place (P4-0). */
  private rerenderCurrent: () => void = () => this.renderSetup();
  /** P4-7: shared 準備室 drawing canvas state, lazily created once per
   *  connection (not re-created on every roster re-render). Torn down via
   *  stopDrawingCanvas() when the round starts or the overlay closes. */
  private drawing: DrawingCanvasHandle | null = null;

  constructor(private readonly opts: LobbyOptions) {
    this.profile = loadProfile(opts.storage ?? safeLocalStorage());
    this.root = el('div', { id: 'otty-lobby' }, {
      position: 'fixed', inset: '0', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: 'rgba(20,40,48,0.92)', zIndex: '1000',
      fontFamily: 'system-ui, sans-serif', color: '#eef',
    });
  }

  /** Show the lobby; resolves once the round starts with a connected adapter. */
  run(): Promise<LobbyResult> {
    document.body.appendChild(this.root);
    this.renderSetup();
    return new Promise<LobbyResult>((res) => (this.resolve = res));
  }

  /* --------- screen 1: personalization + create/join --------- */
  private renderSetup(): void {
    this.rerenderCurrent = () => this.renderSetup();
    this.root.replaceChildren();
    const card = this.card(t('lobby.title'));

    const nick = el('input', {
      value: this.profile.nickname, maxLength: 12, placeholder: t('lobby.nickname'),
    }, { padding: '8px', fontSize: '16px', borderRadius: '8px', border: 'none', width: '100%' });
    nick.oninput = () => (this.profile = saveProfile(this.storage, { ...this.profile, nickname: nick.value }));
    card.append(this.field(t('lobby.nickname'), nick));

    card.append(this.colorRow(t('lobby.hatColor'), 'hatColor'));
    card.append(this.colorRow(t('lobby.scarfColor'), 'scarfColor'));

    const code = el('input', {
      value: this.opts.initialCode ?? '', placeholder: t('lobby.roomCodePlaceholder'), maxLength: 4,
    }, { padding: '8px', fontSize: '16px', borderRadius: '8px', border: 'none', width: '100%', textTransform: 'uppercase' });
    card.append(this.field(t('lobby.joinCodeLabel'), code));

    const banner = el('div', {}, { minHeight: '20px', fontSize: '14px', color: '#f88' });
    const create = this.button(t('lobby.create'), () => void this.connect(null, banner));
    const join = this.button(t('lobby.join'), () => {
      const v = this.controller.validateJoin(code.value);
      if (!v.ok) { banner.textContent = t('lobby.invalidCode'); return; }
      void this.connect(v.code!, banner);
    });
    const btns = el('div', {}, { display: 'flex', gap: '8px', marginTop: '12px' });
    btns.append(create, join);
    card.append(btns, banner);
    this.root.append(card);
  }

  private colorRow(label: string, key: 'hatColor' | 'scarfColor'): HTMLElement {
    const swatch = el('button', {}, {
      width: '32px', height: '32px', borderRadius: '50%', border: '2px solid #fff',
      background: this.profile[key], cursor: 'pointer',
    });
    swatch.onclick = () => {
      this.profile = saveProfile(this.storage, { ...this.profile, [key]: cycleColor(this.profile[key]) });
      swatch.style.background = this.profile[key];
    };
    const row = el('div', {}, { display: 'flex', alignItems: 'center', gap: '10px', margin: '8px 0' });
    row.append(el('span', { textContent: label }, { flex: '1' }), swatch);
    return row;
  }

  /* --------- screen 2: 準備室 roster --------- */
  private async connect(roomCode: string | null, banner: HTMLElement): Promise<void> {
    if (!this.controller.beginConnect(roomCode)) return;
    banner.style.color = '#8cf';
    banner.textContent = t('lobby.connecting');
    try {
      const room = await joinRoom({ url: this.opts.serverUrl, roomCode: roomCode ?? undefined, profile: this.profile });
      const mine = (r: RosterPayload): RosterEntry | undefined =>
        r.players.find((p) => p.sessionId === room.sessionId);
      let started = false;

      room.onMessage(ServerMessage.Roster, (payload: RosterPayload) => {
        if (started) return;
        const me = mine(payload);
        this.controller.onWelcome({
          playerId: me?.otterId ?? null,
          roomCode: payload.roomCode,
          spectator: Boolean(me?.spectator),
        });
        if (payload.phase === 'playing' || payload.phase === 'ended') {
          started = true;
          this.stopDrawingCanvas();
          const adapter = new ColyseusAdapter(transportForRoom(room), {
            localPlayerId: me?.otterId ?? null,
          });
          adapter.start();
          this.close();
          this.resolve({
            adapter,
            localPlayerId: me?.otterId ?? null,
            spectator: Boolean(me?.spectator),
            roomCode: payload.roomCode,
          });
        } else {
          this.renderReadyRoom(room, payload);
        }
      });
      room.onLeave(() => this.controller.onDisconnect());
    } catch {
      this.controller.onError('ROOM_NOT_FOUND');
      banner.style.color = '#f88';
      banner.textContent = t('lobby.connectFailed');
    }
  }

  private renderReadyRoom(room: RoomLike, roster: RosterPayload): void {
    this.rerenderCurrent = () => this.renderReadyRoom(room, roster);
    this.root.replaceChildren();
    const card = this.card(t('lobby.roomTitle', { code: roster.roomCode || '----' }));

    const list = el('div', {}, { margin: '12px 0', display: 'flex', flexDirection: 'column', gap: '6px' });
    for (const p of roster.players) {
      const row = el('div', {}, { display: 'flex', alignItems: 'center', gap: '8px' });
      row.append(
        el('span', {}, { width: '14px', height: '14px', borderRadius: '50%', background: p.hatColor || '#888', opacity: p.connected ? '1' : '0.4' }),
        el('span', { textContent: `${p.nickname || '水獺'}${p.owner ? t('lobby.ownerBadge') : ''}${p.spectator ? t('lobby.spectatorBadge') : ''}` }, { flex: '1' }),
        el('span', { textContent: p.spectator ? '' : p.ready ? '✅' : '…' }),
      );
      list.append(row);
    }
    card.append(list);

    const share = el('input', {
      value: `${location.origin}${location.pathname}${joinLink(roster.roomCode)}`, readOnly: true,
    }, { width: '100%', padding: '6px', borderRadius: '6px', border: 'none', fontSize: '12px' });
    card.append(this.field(t('lobby.shareLink'), share));

    const mine = roster.players.find((p) => p.sessionId === room.sessionId);
    if (mine && !mine.spectator) {
      card.append(this.button(mine.ready ? t('lobby.unready') : t('lobby.ready'), () => room.send(ClientMessage.SetReady, { ready: !mine.ready })));
      if (mine.owner) card.append(this.button(t('lobby.start'), () => room.send(ClientMessage.StartGame)));
    } else if (mine?.spectator) {
      card.append(el('div', { textContent: t('lobby.spectatorNotice') }, { marginTop: '8px', color: '#8cf' }));
    }

    // P4-7: shared 準備室 drawing canvas — created once per connection and
    // re-appended (not recreated) on every roster re-render so its pointer
    // listeners, flush interval, and broadcast subscriptions stay alive.
    if (mine) card.append(this.ensureDrawingCanvas(room, mine.hatColor || PLAYER_COLORS[0]).wrap);

    this.root.append(card);
  }

  /**
   * Lazily builds the shared 準備室 drawing canvas + its makeDrawBatch
   * pipeline (P4-7). Idempotent: subsequent calls return the existing
   * handle instead of re-wiring pointer listeners / re-subscribing to
   * broadcasts / starting a second flush interval (the P3 net lesson this
   * repo is built on — batch, don't spam, and never leak intervals).
   */
  private ensureDrawingCanvas(room: RoomLike, hatColor: string): DrawingCanvasHandle {
    if (this.drawing) return this.drawing;

    const canvas = el('canvas', { width: 400, height: 200 }, {
      width: '100%', height: '160px', borderRadius: '8px', background: '#0f2329',
      touchAction: 'none', cursor: 'crosshair', display: 'block',
    });
    const ctx = canvas.getContext('2d')!;
    // Per-session polylines (own + everyone else's), so "clear only my
    // strokes" can drop just one session's entry and redraw the rest.
    const strokesBySession = new Map<string, { color: string; pts: Array<readonly [number, number]> }>();

    const redraw = (): void => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const { color, pts } of strokesBySession.values()) strokeLine(ctx, color, pts);
    };
    const appendStroke = (sessionId: string, color: string, pts: readonly (readonly [number, number])[]): void => {
      const entry = strokesBySession.get(sessionId) ?? { color, pts: [] };
      const from = entry.pts[entry.pts.length - 1];
      entry.color = color;
      entry.pts.push(...pts);
      strokesBySession.set(sessionId, entry);
      strokeSegment(ctx, color, from, pts);
    };

    const batch = makeDrawBatch({
      color: hatColor,
      send: (payload) => room.send(ClientMessage.Draw, { pts: payload.pts }),
    });

    let isDrawing = false;
    const rectPoint = (ev: PointerEvent): [number, number] => {
      const r = canvas.getBoundingClientRect();
      const x = ((ev.clientX - r.left) / r.width) * canvas.width;
      const y = ((ev.clientY - r.top) / r.height) * canvas.height;
      return [x, y];
    };
    const addLocalPoint = (ev: PointerEvent): void => {
      const [x, y] = rectPoint(ev);
      batch.addPoint(x, y);
      appendStroke(room.sessionId, hatColor, [[x | 0, y | 0]]);
    };
    const onDown = (ev: PointerEvent): void => { isDrawing = true; addLocalPoint(ev); };
    const onMove = (ev: PointerEvent): void => { if (isDrawing) addLocalPoint(ev); };
    const onUp = (): void => { isDrawing = false; };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointerleave', onUp);

    // Drive the batcher's flush timer off a plain interval (P3 net lesson:
    // batch + flush periodically, never one network message per pointer
    // event). Cleared in stop() so it never leaks past this screen.
    const FLUSH_MS = 50;
    const interval = setInterval(() => batch.tick(FLUSH_MS), FLUSH_MS);

    room.onMessage(ServerMessage.Draw, (message: unknown) => {
      const m = message as DrawBroadcast;
      if (!m || m.sessionId === room.sessionId || !Array.isArray(m.pts)) return;
      appendStroke(m.sessionId, m.color, m.pts);
    });
    room.onMessage(ServerMessage.ClearDrawing, (message: unknown) => {
      const m = message as ClearDrawingBroadcast;
      if (!m) return;
      strokesBySession.delete(m.sessionId);
      redraw();
    });

    const clearBtn = this.button(t('drawing.clearMine'), () => {
      strokesBySession.delete(room.sessionId); // optimistic local clear
      redraw();
      room.send(ClientMessage.ClearDrawing);
    });
    clearBtn.style.marginTop = '4px';

    const wrap = el('div', {}, { marginTop: '10px' });
    wrap.append(canvas, clearBtn);

    this.drawing = {
      wrap,
      stop: () => {
        clearInterval(interval);
        canvas.removeEventListener('pointerdown', onDown);
        canvas.removeEventListener('pointermove', onMove);
        canvas.removeEventListener('pointerup', onUp);
        canvas.removeEventListener('pointerleave', onUp);
      },
    };
    return this.drawing;
  }

  /**
   * P4-7: fade the canvas out over ~400ms then tear it down, once the round
   * starts (roster phase flips away from 'lobby'). No-op if never created.
   */
  private stopDrawingCanvas(): void {
    if (!this.drawing) return;
    const handle = this.drawing;
    this.drawing = null;
    handle.wrap.style.transition = 'opacity 400ms';
    handle.wrap.style.opacity = '0';
    setTimeout(() => {
      handle.stop();
      handle.wrap.remove();
    }, 400);
  }

  /* --------- helpers --------- */
  private get storage(): Storage | undefined {
    return this.opts.storage ?? safeLocalStorage();
  }
  private card(title: string): HTMLDivElement {
    const c = el('div', {}, {
      background: '#1b3b45', padding: '24px', borderRadius: '16px', width: '320px',
      boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
    });
    const header = el('div', {}, {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '12px',
    });
    header.append(
      el('h2', { textContent: title }, { margin: '0', fontSize: '20px' }),
      this.langToggleButton(),
    );
    c.append(header);
    return c;
  }

  /** EN/中 toggle (P4-0): flips the active language and redraws the current
   *  screen in place. Persisted via setLang -> localStorage('otty.lang'). */
  private langToggleButton(): HTMLButtonElement {
    const btn = el('button', { textContent: t('lobby.langToggle') }, {
      padding: '4px 10px', fontSize: '13px', borderRadius: '8px', border: '1px solid #fff',
      background: 'transparent', color: '#eef', cursor: 'pointer', flexShrink: '0',
    });
    btn.onclick = () => {
      setLang(getLang() === 'zh-TW' ? 'en' : 'zh-TW');
      this.rerenderCurrent();
    };
    return btn;
  }
  private field(label: string, input: HTMLElement): HTMLElement {
    const wrap = el('label', {}, { display: 'block', margin: '8px 0', fontSize: '13px' });
    wrap.append(el('div', { textContent: label }, { marginBottom: '4px', opacity: '0.8' }), input);
    return wrap;
  }
  private button(label: string, onClick: () => void): HTMLButtonElement {
    const b = el('button', { textContent: label }, {
      flex: '1', padding: '10px', fontSize: '15px', borderRadius: '10px', border: 'none',
      background: PLAYER_COLORS[2], color: '#fff', cursor: 'pointer', marginTop: '6px', width: '100%',
    });
    b.onclick = onClick;
    return b;
  }
  private close(): void {
    this.stopDrawingCanvas();
    this.root.remove();
  }
}

function safeLocalStorage(): Storage | undefined {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : undefined;
  } catch {
    return undefined;
  }
}
