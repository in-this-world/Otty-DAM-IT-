/** P3-03: room-code validation, deep links, and connection-state UX. */
import { describe, expect, it } from 'vitest';
import { NET_ERROR_MESSAGES } from '../../../src/net/protocol';
import { LobbyController } from '../../../src/net/lobby-controller';

describe('LobbyController (P3-03)', () => {
  it('parses room codes from #/r/ABCD deep links', () => {
    expect(LobbyController.codeFromLocation('#/r/ABCD')).toBe('ABCD');
    expect(LobbyController.codeFromLocation('https://x/#/r/wxyz')).toBe('WXYZ');
    expect(LobbyController.codeFromLocation('#/nope')).toBeNull();
  });

  it('validates + normalizes typed codes', () => {
    const c = new LobbyController();
    expect(c.validateJoin('  r/abcd ')).toEqual({ ok: true, code: 'ABCD' });
    expect(c.validateJoin('AB1D')).toEqual({ ok: false, error: 'INVALID_CODE' });
    expect(c.validateJoin('toolongcode')).toEqual({ ok: false, error: 'INVALID_CODE' });
  });

  it('walks connecting -> connected on welcome', () => {
    const c = new LobbyController();
    expect(c.beginConnect('ABCD')).toBe(true);
    expect(c.view().state).toBe('connecting');
    expect(c.beginConnect('ABCD')).toBe(false); // no double-connect
    c.onWelcome({ playerId: 'otter-3', roomCode: 'ABCD', spectator: false });
    const v = c.view();
    expect(v.state).toBe('connected');
    expect(v.localPlayerId).toBe('otter-3');
    expect(v.message).toBe('已連線');
  });

  it('marks spectators joining a live game', () => {
    const c = new LobbyController();
    c.beginConnect('ABCD');
    c.onWelcome({ playerId: null, roomCode: 'ABCD', spectator: true });
    expect(c.spectator).toBe(true);
    expect(c.view().message).toBe('觀戰中');
  });

  it('surfaces error copy and blocks/allows reconnect flow', () => {
    const c = new LobbyController();
    c.onError('ROOM_FULL');
    expect(c.view().state).toBe('error');
    expect(c.view().message).toBe(NET_ERROR_MESSAGES.ROOM_FULL);

    const d = new LobbyController();
    d.beginConnect('ABCD');
    d.onWelcome({ playerId: 'otter-1', roomCode: 'ABCD', spectator: false });
    d.onDisconnect();
    expect(d.view().state).toBe('reconnecting');
    d.onReconnected();
    expect(d.view().state).toBe('connected');
    d.onDisconnect();
    d.onReconnectFailed();
    expect(d.view().state).toBe('disconnected');
  });
});
