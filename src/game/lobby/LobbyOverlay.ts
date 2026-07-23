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
  type PlayerProfile,
  type RosterEntry,
  type RosterPayload,
} from '../../net/protocol';
import { cycleColor, loadProfile, saveProfile } from '../../net/profile-store';
import { getLang, t, toggleLang } from '../../i18n';

export interface LobbyResult {
  readonly adapter: GameAdapter;
  readonly localPlayerId: string | null;
  readonly spectator: boolean;
  readonly roomCode: string;
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
  /** Re-render the screen currently showing (used by the language toggle). */
  private rerender: () => void = () => this.renderSetup();

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
    this.rerender = () => this.renderSetup();
    this.root.replaceChildren();
    const card = this.card(t('lobby.title'));

    const nick = el('input', {
      value: this.profile.nickname, maxLength: 12, placeholder: t('lobby.nicknamePlaceholder'),
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

  private renderReadyRoom(
    room: { sessionId: string; send(t: string, m?: unknown): void },
    roster: RosterPayload,
  ): void {
    this.rerender = () => this.renderReadyRoom(room, roster);
    this.root.replaceChildren();
    const card = this.card(t('lobby.roomTitle', { code: roster.roomCode || '----' }));

    const list = el('div', {}, { margin: '12px 0', display: 'flex', flexDirection: 'column', gap: '6px' });
    for (const p of roster.players) {
      const row = el('div', {}, { display: 'flex', alignItems: 'center', gap: '8px' });
      row.append(
        el('span', {}, { width: '14px', height: '14px', borderRadius: '50%', background: p.hatColor || '#888', opacity: p.connected ? '1' : '0.4' }),
        el('span', { textContent: `${p.nickname || t('lobby.defaultOtter')}${p.owner ? ' 👑' : ''}${p.spectator ? ' ' + t('lobby.spectatorTag') : ''}` }, { flex: '1' }),
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
      card.append(this.button(mine.ready ? t('lobby.cancelReady') : t('lobby.ready'), () => room.send(ClientMessage.SetReady, { ready: !mine.ready })));
      if (mine.owner) card.append(this.button(t('lobby.start'), () => room.send(ClientMessage.StartGame)));
    } else if (mine?.spectator) {
      card.append(el('div', { textContent: t('lobby.spectatorNotice') }, { marginTop: '8px', color: '#8cf' }));
    }
    this.root.append(card);
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
    const header = el('div', {}, { display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 12px' });
    header.append(
      el('h2', { textContent: title }, { margin: '0', fontSize: '20px', flex: '1' }),
      this.langToggle(),
    );
    c.append(header);
    return c;
  }
  /** EN/中 toggle shown in every card header; flips language and re-renders live. */
  private langToggle(): HTMLButtonElement {
    const b = el('button', { textContent: getLang() === 'zh-TW' ? 'EN' : '中' }, {
      padding: '4px 10px', fontSize: '13px', borderRadius: '8px', border: '1px solid #6cf',
      background: 'transparent', color: '#cfe8ef', cursor: 'pointer', flexShrink: '0',
    });
    b.onclick = () => { toggleLang(); this.rerender(); };
    return b;
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
