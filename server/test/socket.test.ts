import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Server } from 'socket.io';
import { io as ioClient, type Socket } from 'socket.io-client';
import type {
  Ack,
  ClientToServerEvents,
  ServerToClientEvents,
  DisplaySession,
  SessionInfo,
  StateEnvelope,
} from '@imposter/shared';
import { AVATARS } from '@imposter/shared';
import { createGameServer, type GameIo } from '../src/net/gameServer';
import { InMemoryRoomStore } from '../src/net/roomStore';
import { words } from './helpers';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface TestClient {
  socket: ClientSocket;
  latest: StateEnvelope | null;
  /** Every raw state message received, for leak checks. */
  raw: string[];
  ended: string[];
}

let http: HttpServer;
let io: GameIo;
let url: string;
let stop: () => void;
const store = new InMemoryRoomStore();
const clients: TestClient[] = [];

beforeAll(async () => {
  http = createServer();
  io = new Server(http) as GameIo;
  ({ stop } = createGameServer({ io, store, words, tickMs: 50, joinLimitPerMinute: 1000, eventLimitPerSecond: 1000 }));
  await new Promise<void>((r) => http.listen(0, r));
  url = `http://localhost:${(http.address() as AddressInfo).port}`;
});

afterAll(async () => {
  for (const c of clients) c.socket.disconnect();
  stop();
  io.close();
  await new Promise((r) => http.close(r));
});

async function connect(): Promise<TestClient> {
  const socket: ClientSocket = ioClient(url, { transports: ['websocket'], forceNew: true });
  const client: TestClient = { socket, latest: null, raw: [], ended: [] };
  socket.on('game:stateUpdated', (env) => {
    client.latest = env;
    client.raw.push(JSON.stringify(env));
  });
  socket.on('session:ended', ({ reason }) => client.ended.push(reason));
  await new Promise<void>((r) => socket.on('connect', () => r()));
  clients.push(client);
  return client;
}

function emit<T = null>(c: TestClient, event: string, payload: unknown): Promise<Ack<T>> {
  return new Promise((resolve) => {
    (c.socket as unknown as { emit: (...a: unknown[]) => void }).emit(event, payload, (res: Ack<T>) => resolve(res));
  });
}

async function ok<T = null>(c: TestClient, event: string, payload: unknown = {}): Promise<T> {
  const res = await emit<T>(c, event, payload);
  if (!res.ok) throw new Error(`${event} failed: ${res.error.code} ${res.error.message}`);
  return res.data;
}

async function until(cond: () => boolean, ms = 3000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('timed out waiting for condition');
    await new Promise((r) => setTimeout(r, 15));
  }
}

/** A room screen creates an empty room; then n players join. The first to join is the host. */
async function setupRoom(n: number) {
  const screen = await connect();
  const display = await ok<DisplaySession>(screen, 'room:create', {});
  const players: TestClient[] = [];
  const sessions: SessionInfo[] = [];
  for (let i = 0; i < n; i++) {
    const c = await connect();
    sessions.push(await ok<SessionInfo>(c, 'room:join', { code: display.code, name: i === 0 ? 'Host' : `P${i}`, avatar: AVATARS[i] }));
    players.push(c);
  }
  await until(() => players.every((p) => p.latest?.room.players.length === n));
  return { host: players[0], players, sessions, code: display.code, screen, display };
}

describe('socket integration', () => {
  it('synchronises joins and keeps roles private over the wire', async () => {
    const { host, players, code } = await setupRoom(5);
    expect(code).toMatch(/^[A-Z0-9]{4}$/);
    await ok(host, 'room:updateSettings', { settings: { grinchCount: 2 } });
    await ok(host, 'game:start');
    await until(() => players.every((p) => p.latest?.room.phase === 'ROLE_REVEAL' && p.latest.me.role !== null));

    const elf = players.find((p) => p.latest!.me.role === 'ELF')!;
    const word = elf.latest!.me.word!;
    expect(word).toBeTruthy();
    const grinchClients = players.filter((p) => p.latest!.me.role === 'GRINCH');
    expect(grinchClients).toHaveLength(2);
    const grinchIds = grinchClients.map((g) => g.latest!.me.playerId);
    for (const g of grinchClients) {
      expect(g.latest!.me.word).toBeNull();
      expect(g.latest!.me.teammates.map((t) => t.id)).toEqual(grinchIds.filter((id) => id !== g.latest!.me.playerId));
      // The secret word never reached an Imposter's browser in ANY message.
      for (const msg of g.raw) expect(msg).not.toContain(word);
    }
    for (const p of players.filter((x) => x.latest!.me.role === 'ELF')) {
      expect(p.latest!.me.teammates).toEqual([]);
      expect(JSON.stringify(p.latest!.room)).not.toContain('GRINCH');
    }
  });

  it('rejects host-only actions from other players and forged ids', async () => {
    const { host, players, sessions } = await setupRoom(4);
    const res = await emit(players[1], 'game:start', {});
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('NOT_HOST');

    // A player cannot kick on behalf of the host by sending the host's id.
    const kick = await emit(players[1], 'room:kick', { playerId: sessions[2].playerId, hostId: sessions[0].playerId });
    expect(kick.ok).toBe(false);

    // A forged playerId in the payload is ignored: the action is taken as the real sender.
    await ok(players[2], 'player:ready', { ready: true, playerId: sessions[3].playerId });
    await until(() => !!host.latest?.room.players.find((p) => p.id === sessions[2].playerId)?.ready);
    expect(host.latest!.room.players.find((p) => p.id === sessions[3].playerId)!.ready).toBe(false);
  });

  it('validates malformed input and blocks duplicate joins', async () => {
    const c = await connect();
    const bad = await emit(c, 'room:join', { code: 12345, name: '', avatar: 'nope' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.code).toBe('INVALID_INPUT');
    const missing = await emit(c, 'room:join', { code: 'ZZZZ', name: 'Me', avatar: AVATARS[0] });
    expect(!missing.ok && missing.error.code).toBe('ROOM_NOT_FOUND');
    const notInRoom = await emit(c, 'game:submitVote', { voteId: 'x', picks: [], skip: true });
    expect(!notInRoom.ok && notInRoom.error.code).toBe('NOT_IN_ROOM');
    // No ack callback / garbage payload must not crash the server.
    (c.socket as unknown as { emit: (...a: unknown[]) => void }).emit('room:create', 'garbage');

    const { code } = await setupRoom(3);
    await ok(c, 'room:join', { code, name: 'Dup', avatar: AVATARS[16] });
    const again = await emit(c, 'room:join', { code, name: 'Dup', avatar: AVATARS[0] });
    expect(!again.ok && again.error.code).toBe('ALREADY_IN_ROOM');
  });

  it('blocks joining a game in progress', async () => {
    const { host, code } = await setupRoom(3);
    await ok(host, 'game:start');
    const late = await connect();
    const check = await ok<{ joinable: boolean; reason: string }>(late, 'room:check', { code });
    expect(check.joinable).toBe(false);
    const res = await emit(late, 'room:join', { code, name: 'Late', avatar: AVATARS[0] });
    expect(!res.ok && res.error.code).toBe('GAME_IN_PROGRESS');
  });

  it('restores identity and role after a refresh, and replaces the old connection', async () => {
    const { host, players, sessions, code } = await setupRoom(4);
    await ok(host, 'game:start');
    await until(() => players[2].latest?.me.role != null);
    const role = players[2].latest!.me.role;
    const word = players[2].latest!.me.word;

    // "Refresh": drop the socket and reconnect with the stored token.
    players[2].socket.disconnect();
    await until(() => host.latest!.room.players.find((p) => p.id === sessions[2].playerId)!.connected === false);
    const fresh = await connect();
    const restored = await ok<SessionInfo>(fresh, 'room:reconnect', { code, token: sessions[2].token });
    expect(restored.playerId).toBe(sessions[2].playerId);
    await until(() => fresh.latest?.me.role === role);
    expect(fresh.latest!.me.word).toBe(word);

    // Opening the game in a second tab ends the first tab's session.
    const second = await connect();
    await ok(second, 'room:reconnect', { code, token: sessions[2].token });
    await until(() => fresh.ended.includes('REPLACED'));
    const stale = await emit(fresh, 'game:roleAcknowledged', {});
    expect(stale.ok).toBe(false);

    // Wrong token → rejected.
    const thief = await connect();
    const bad = await emit(thief, 'room:reconnect', { code, token: 'x'.repeat(32) });
    expect(!bad.ok && bad.error.code).toBe('INVALID_SESSION');
  });

  it('kicked players lose their session and token', async () => {
    const { host, players, sessions, code } = await setupRoom(4);
    await ok(host, 'room:kick', { playerId: sessions[3].playerId });
    await until(() => players[3].ended.includes('KICKED'));
    await until(() => host.latest!.room.players.length === 3);
    const c = await connect();
    const res = await emit(c, 'room:reconnect', { code, token: sessions[3].token });
    expect(res.ok).toBe(false);
  });

  it('plays a full match over sockets with private votes', async () => {
    const { host, players, code } = await setupRoom(4);
    await ok(host, 'room:updateSettings', {
      settings: { finalGuessEnabled: true, discussionSeconds: 0, autoAdvance: false, allowSkipVote: false },
    });
    await ok(host, 'game:start');
    await until(() => players.every((p) => p.latest?.room.phase === 'ROLE_REVEAL'));
    for (const p of players) await ok(p, 'game:roleAcknowledged');
    await until(() => host.latest!.room.match!.acknowledgedIds.length === 4);
    await ok(host, 'game:beginClues', { phaseSeq: host.latest!.room.phaseSeq });

    // Double "start clues" with the same phaseSeq is rejected.
    await until(() => host.latest!.room.phase === 'CLUE');
    const dup = await emit(host, 'game:beginClues', { phaseSeq: host.latest!.room.phaseSeq - 1 });
    expect(dup.ok).toBe(false);

    const byId = new Map(players.map((p) => [p.latest!.me.playerId, p]));
    while (host.latest!.room.phase === 'CLUE') {
      const m = host.latest!.room.match!;
      const before = m.turnIndex;
      await ok(byId.get(m.currentSpeakerId!)!, 'game:advanceTurn', { turnIndex: m.turnIndex });
      await until(() => host.latest!.room.phase !== 'CLUE' || host.latest!.room.match!.turnIndex !== before);
    }
    expect(host.latest!.room.phase).toBe('DISCUSSION');
    await ok(host, 'game:startVoting', { phaseSeq: host.latest!.room.phaseSeq });
    await until(() => players.every((p) => p.latest?.room.phase === 'VOTING'));

    const grinch = players.find((p) => p.latest!.me.role === 'GRINCH')!;
    const grinchId = grinch.latest!.me.playerId;
    const voteId = host.latest!.room.match!.vote!.id;
    const word = players.find((p) => p.latest!.me.role === 'ELF')!.latest!.me.word!;
    for (const p of players) {
      const me = p.latest!.me.playerId;
      const target = me === grinchId ? players.find((x) => x !== grinch)!.latest!.me.playerId : grinchId;
      await ok(p, 'game:submitVote', { voteId, picks: [target], skip: false });
      if (p !== players[players.length - 1]) {
        // Mid-vote, nobody's state reveals who voted for whom.
        await until(() => host.latest!.room.match!.vote?.submittedIds.includes(me) ?? false);
        expect(JSON.stringify(host.latest!.room)).not.toContain('picks');
      }
    }
    const dupVote = await emit(players[0], 'game:submitVote', { voteId, picks: [grinchId], skip: false });
    expect(dupVote.ok).toBe(false);

    await until(() => host.latest!.room.phase === 'VOTE_RESULTS');
    expect(host.latest!.room.match!.resultRevealed).toBe(false);
    expect(host.latest!.room.match!.lastResult!.roles).toEqual({});
    await ok(host, 'game:revealResult', { phaseSeq: host.latest!.room.phaseSeq });
    await until(() => host.latest!.room.match!.resultRevealed);
    expect(host.latest!.room.match!.lastResult!.roles[grinchId]).toBe('GRINCH');
    await ok(host, 'game:continue', { phaseSeq: host.latest!.room.phaseSeq });
    await until(() => grinch.latest!.me.isGuessing);
    // The Imposter says the guess out loud. They can't confirm their own guess…
    const seq = grinch.latest!.room.phaseSeq;
    const forged = await emit(grinch, 'game:judgeGuess', { correct: true, phaseSeq: seq });
    expect(forged.ok).toBe(false);
    // …an Innocent (who knows the word) taps "Correct".
    const judge = players.find((p) => p.latest!.me.canJudge)!;
    await ok(judge, 'game:judgeGuess', { correct: true, phaseSeq: seq });
    await until(() => host.latest!.room.phase === 'ROUND_RESULTS');
    const results = host.latest!.room.match!.results!;
    expect(results.winner).toBe('GRINCHES');
    expect(results.word).toBe(word);
    expect(host.latest!.room.players.find((p) => p.id === grinchId)!.score).toBe(6);

    await ok(host, 'game:continue', { phaseSeq: host.latest!.room.phaseSeq });
    await until(() => host.latest!.room.phase === 'SCOREBOARD');
    await ok(host, 'game:nextMatch');
    await until(() => players.every((p) => p.latest?.room.phase === 'ROLE_REVEAL'));
    expect(host.latest!.room.match!.number).toBe(2);
    expect(host.latest!.room.players.find((p) => p.id === grinchId)!.score).toBe(6);
    expect(store.get(code)).toBeDefined();
  });

  it('the room screen sees public state only and survives a refresh', async () => {
    const { screen, display, players, code } = await setupRoom(4);
    await until(() => screen.latest?.room.players.length === 4);
    expect(screen.latest!.viewer).toBe('display');
    expect(screen.latest!.room.hostId).toBe(players[0].latest!.me.playerId);
    await ok(players[0], 'game:start', {});
    await until(() => screen.latest?.room.phase === 'ROLE_REVEAL');
    const word = players.find((p) => p.latest?.me.role === 'ELF')!.latest!.me.word!;
    for (const msg of screen.raw) expect(msg).not.toContain(word);
    expect(screen.latest!.me.role).toBeNull();
    // Screen refresh: reconnect with the display token.
    screen.socket.disconnect();
    const again = await connect();
    await ok(again, 'room:watch', { code, displayToken: display.displayToken });
    await until(() => again.latest?.room.phase === 'ROLE_REVEAL');
    const bad = await emit(await connect(), 'room:watch', { code, displayToken: 'x'.repeat(32) });
    expect(bad.ok).toBe(false);
  });
});
