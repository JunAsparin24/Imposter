import type { Server, Socket } from 'socket.io';
import type { ZodTypeAny, z } from 'zod';
import type {
  ClientToServerEvents,
  GameSettings,
  RoomCheckResult,
  ServerToClientEvents,
  SessionInfo,
  StateEnvelope,
} from '@imposter/shared';
import { GameError, Room, type PlayerRecord } from '../game/Room';
import { cryptoRng, generateRoomCode, type Rng } from '../game/rng';
import type { WordBank } from '../game/wordBank';
import { RateLimiter } from './rateLimit';
import type { RoomStore } from './roomStore';
import { schemas } from './schemas';

interface SocketSession {
  code: string;
  playerId: string;
}
interface SocketData {
  session: SocketSession | null;
  /** Set when this socket is a room screen (not a player). */
  displayCode: string | null;
  ip: string;
}

export type GameIo = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export interface GameServerOptions {
  io: GameIo;
  store: RoomStore;
  words: WordBank;
  rng?: Rng;
  clock?: () => number;
  tickMs?: number;
  trustProxy?: boolean;
  /** Room create/join/reconnect/check attempts per IP per minute. */
  joinLimitPerMinute?: number;
  /** All events per socket per second. */
  eventLimitPerSecond?: number;
}

/**
 * Wires Socket.IO events to rooms. The server is authoritative:
 *  - a socket's identity comes ONLY from the session bound at create/join/reconnect,
 *    never from player ids in payloads;
 *  - each player gets their own private payload; everyone gets the same sanitised public state.
 */
export function createGameServer(opts: GameServerOptions) {
  const { io, store, words } = opts;
  const rng = opts.rng ?? cryptoRng;
  const clock = opts.clock ?? Date.now;
  const joinLimiter = new RateLimiter(opts.joinLimitPerMinute ?? 30, 60_000, clock);
  const eventLimiter = new RateLimiter(opts.eventLimitPerSecond ?? 20, 1_000, clock);

  function broadcast(room: Room): void {
    const publicState = room.publicState();
    const serverNow = clock();
    for (const p of room.players.values()) {
      if (!p.socketId) continue;
      const envelope: StateEnvelope = { serverNow, room: publicState, me: room.privateState(p.id), viewer: 'player' };
      io.to(p.socketId).emit('game:stateUpdated', envelope);
    }
    // Room screens only ever get public info: their private part is empty.
    if (room.displaySockets.size > 0) {
      const envelope: StateEnvelope = { serverNow, room: publicState, me: room.privateState(''), viewer: 'display' };
      for (const id of room.displaySockets) io.to(id).emit('game:stateUpdated', envelope);
    }
  }

  function unbindDisplay(socket: GameSocket): void {
    const code = socket.data.displayCode;
    if (!code) return;
    socket.data.displayCode = null;
    const room = store.get(code);
    if (!room) return;
    room.displaySockets.delete(socket.id);
    socket.leave(code);
    if (room.isEmpty()) store.delete(code);
    else broadcast(room);
  }

  function bindDisplay(socket: GameSocket, room: Room) {
    room.displaySockets.add(socket.id);
    room.touch();
    socket.data.displayCode = room.code;
    socket.join(room.code);
    return { code: room.code, displayToken: room.displayToken };
  }

  function endSession(socketId: string, reason: 'KICKED' | 'REPLACED' | 'ROOM_CLOSED', code: string): void {
    const s = io.sockets.sockets.get(socketId);
    if (!s) return;
    s.data.session = null;
    s.leave(code);
    s.emit('session:ended', { reason });
  }

  function bind(socket: GameSocket, room: Room, player: PlayerRecord): SessionInfo {
    if (player.socketId && player.socketId !== socket.id) {
      // The same player opened the game somewhere else (new tab / phone): the newest connection wins.
      endSession(player.socketId, 'REPLACED', room.code);
    }
    room.connect(player.id, socket.id);
    socket.data.session = { code: room.code, playerId: player.id };
    socket.join(room.code);
    return { code: room.code, playerId: player.id, token: player.token };
  }

  function newRoomCode(): string {
    for (let i = 0; i < 50; i++) {
      const code = generateRoomCode(rng);
      if (!store.has(code)) return code;
    }
    throw new GameError('INTERNAL', 'Could not create a room right now. Please try again.');
  }

  io.on('connection', (rawSocket) => {
    const socket = rawSocket as GameSocket;
    const forwarded = socket.handshake.headers['x-forwarded-for'];
    socket.data.ip =
      opts.trustProxy && typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : socket.handshake.address;
    socket.data.session = null;
    socket.data.displayCode = null;

    /** Registers a validated, rate-limited, error-safe handler. */
    function handle<S extends ZodTypeAny>(
      event: keyof ClientToServerEvents,
      schema: S,
      fn: (payload: z.infer<S>) => unknown,
      options: { joinLimited?: boolean } = {},
    ): void {
      (socket as unknown as Socket).on(event, (payload: unknown, ack: unknown) => {
        const reply = typeof ack === 'function' ? (ack as (r: unknown) => void) : () => {};
        try {
          if (!eventLimiter.allow(socket.id)) throw new GameError('RATE_LIMITED', 'Slow down a little!');
          if (options.joinLimited && !joinLimiter.allow(socket.data.ip)) {
            throw new GameError('RATE_LIMITED', 'Too many attempts. Wait a minute and try again.');
          }
          const parsed = schema.safeParse(payload ?? {});
          if (!parsed.success) throw new GameError('INVALID_INPUT', 'That request was not valid.');
          const data = fn(parsed.data);
          reply({ ok: true, data: data ?? null });
        } catch (err) {
          if (err instanceof GameError) {
            reply({ ok: false, error: { code: err.code, message: err.message } });
          } else {
            console.error(`[${event}]`, err);
            reply({ ok: false, error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' } });
          }
        }
      });
    }

    /** Resolves the caller's room + player from the server-side session only. */
    function session(): { room: Room; playerId: string } {
      const s = socket.data.session;
      if (!s) throw new GameError('NOT_IN_ROOM', 'You are not in a room.');
      const room = store.get(s.code);
      const player = room?.players.get(s.playerId);
      if (!room || !player || player.left || player.socketId !== socket.id) {
        socket.data.session = null;
        throw new GameError('INVALID_SESSION', 'Your session has ended. Please rejoin.');
      }
      return { room, playerId: s.playerId };
    }

    /** Runs a room action as the authenticated player, then pushes fresh state to everyone. */
    function act<T>(fn: (room: Room, playerId: string) => T): T {
      const { room, playerId } = session();
      const result = fn(room, playerId);
      room.touch();
      broadcast(room);
      return result;
    }

    function ensureNotInRoom(): void {
      if (socket.data.session && store.get(socket.data.session.code)) {
        throw new GameError('ALREADY_IN_ROOM', 'You are already in a room. Leave it first.');
      }
    }

    // Creating a room makes an EMPTY room. This device becomes the room screen;
    // the first person to join becomes the host.
    handle(
      'room:create',
      schemas.empty,
      () => {
        ensureNotInRoom();
        unbindDisplay(socket);
        const room = new Room(newRoomCode(), { rng, words, clock });
        store.set(room);
        const info = bindDisplay(socket, room);
        broadcast(room);
        return info;
      },
      { joinLimited: true },
    );

    handle(
      'room:watch',
      schemas.watch,
      ({ code, displayToken }) => {
        const room = store.get(code);
        if (!room) throw new GameError('ROOM_NOT_FOUND', 'That room has closed.');
        if (!room.isDisplayToken(displayToken)) throw new GameError('INVALID_SESSION', 'This screen is no longer linked to that room.');
        if (socket.data.displayCode !== code) unbindDisplay(socket);
        const info = bindDisplay(socket, room);
        broadcast(room);
        return info;
      },
      { joinLimited: true },
    );

    handle('room:unwatch', schemas.empty, () => {
      unbindDisplay(socket);
    });

    handle(
      'room:check',
      schemas.check,
      ({ code }): RoomCheckResult => {
        const room = store.get(code);
        if (!room) return { exists: false, joinable: false, reason: 'ROOM_NOT_FOUND', takenAvatars: [] };
        const blocker = room.joinBlocker();
        return { exists: true, joinable: !blocker, reason: blocker, takenAvatars: room.takenAvatars() };
      },
      { joinLimited: true },
    );

    handle(
      'room:join',
      schemas.join,
      ({ code, name, avatar }) => {
        ensureNotInRoom();
        const room = store.get(code);
        if (!room) throw new GameError('ROOM_NOT_FOUND', 'No room found with that code. Check it and try again.');
        const player = room.addPlayer(name, avatar);
        // A room screen that joins as a player stops being a room screen.
        if (socket.data.displayCode) {
          room.displaySockets.delete(socket.id);
          socket.data.displayCode = null;
        }
        const info = bind(socket, room, player);
        broadcast(room);
        return info;
      },
      { joinLimited: true },
    );

    handle(
      'room:reconnect',
      schemas.reconnect,
      ({ code, token }) => {
        const room = store.get(code);
        if (!room) throw new GameError('ROOM_NOT_FOUND', 'That room has closed.');
        const player = room.findByToken(token);
        if (!player) throw new GameError('INVALID_SESSION', 'Your spot in this room is no longer available.');
        const current = socket.data.session;
        if (current && (current.code !== code || current.playerId !== player.id) && store.get(current.code)) {
          throw new GameError('ALREADY_IN_ROOM', 'You are already in a different room.');
        }
        const info = bind(socket, room, player);
        broadcast(room);
        return info;
      },
      { joinLimited: true },
    );

    handle('room:leave', schemas.empty, () => {
      const { room, playerId } = session();
      room.removePlayer(playerId);
      socket.data.session = null;
      socket.leave(room.code);
      if (room.isEmpty()) store.delete(room.code);
      else broadcast(room);
    });

    handle('room:kick', schemas.kick, ({ playerId: targetId }) => {
      const { room, playerId } = session();
      const target = room.players.get(targetId);
      const targetSocket = target?.socketId ?? null;
      room.kick(playerId, targetId);
      if (targetSocket) endSession(targetSocket, 'KICKED', room.code);
      room.touch();
      broadcast(room);
    });

    handle('room:updateSettings', schemas.settings, ({ settings }) =>
      act((room, id) => room.updateSettings(id, settings as Partial<GameSettings>)),
    );
    handle('room:setCustomPack', schemas.customPack, ({ name, lines }) =>
      act((room, id) => room.setCustomPack(id, name, lines)),
    );
    handle('room:transferHost', schemas.kick, ({ playerId: targetId }) =>
      act((room, id) => room.transferHost(id, targetId)),
    );
    handle('room:setLocked', schemas.locked, ({ locked }) => act((room, id) => room.setLocked(id, locked)));
    handle('player:ready', schemas.ready, ({ ready }) => act((room, id) => room.setReady(id, ready)));
    handle('player:setAvatar', schemas.setAvatar, ({ avatar }) => act((room, id) => room.setAvatar(id, avatar)));
    handle('game:start', schemas.start, ({ practice }) => act((room, id) => room.startMatch(id, !!practice)));
    handle('game:nextMatch', schemas.empty, () => act((room, id) => room.startMatch(id)));
    handle('game:roleAcknowledged', schemas.empty, () => act((room, id) => room.acknowledgeRole(id)));
    handle('game:beginClues', schemas.phaseSeq, ({ phaseSeq }) => act((room, id) => room.beginClues(id, phaseSeq)));
    handle('game:advanceTurn', schemas.advanceTurn, ({ turnIndex }) =>
      act((room, id) => room.advanceTurn(id, turnIndex)),
    );
    handle('game:discussionControl', schemas.discussion, ({ action, phaseSeq }) =>
      act((room, id) => room.discussionControl(id, action, phaseSeq)),
    );
    handle('game:startVoting', schemas.phaseSeq, ({ phaseSeq }) => act((room, id) => room.startVoting(id, phaseSeq)));
    handle('game:submitVote', schemas.vote, ({ voteId, picks, skip }) =>
      act((room, id) => room.submitVote(id, voteId, picks, skip)),
    );
    handle('game:revealResult', schemas.phaseSeq, ({ phaseSeq }) => act((room, id) => room.revealResult(id, phaseSeq)));
    handle('game:usePower', schemas.power, ({ action, targetId, guess, phaseSeq }) =>
      act((room, id) => room.usePower(id, action, targetId ?? null, phaseSeq, guess ?? null)),
    );
    handle('game:closeVoting', schemas.phaseSeq, ({ phaseSeq }) => act((room, id) => room.closeVoting(id, phaseSeq)));
    handle('game:continue', schemas.phaseSeq, ({ phaseSeq }) =>
      act((room, id) => room.continueFromResults(id, phaseSeq)),
    );
    handle('game:judgeGuess', schemas.judge, ({ correct, phaseSeq }) =>
      act((room, id) => room.judgeGuess(id, phaseSeq, correct)),
    );
    handle('game:returnToLobby', schemas.empty, () => act((room, id) => room.returnToLobby(id)));
    handle('game:resetScores', schemas.empty, () => act((room, id) => room.resetScores(id)));

    socket.on('disconnect', () => {
      const dc = socket.data.displayCode;
      if (dc) {
        // Keep the room: the screen may just be refreshing. Abandoned-room cleanup handles the rest.
        const room = store.get(dc);
        room?.displaySockets.delete(socket.id);
        room?.touch();
      }
      const s = socket.data.session;
      if (!s) return;
      const room = store.get(s.code);
      if (room && room.disconnect(s.playerId, socket.id)) broadcast(room);
    });
  });

  // Timers (turns, discussion, voting, final guess, host grace) and abandoned-room cleanup.
  const ticker = setInterval(() => {
    for (const room of store.all()) {
      try {
        if (room.isAbandoned()) {
          for (const p of room.players.values()) if (p.socketId) endSession(p.socketId, 'ROOM_CLOSED', room.code);
          store.delete(room.code);
          continue;
        }
        if (room.tick()) broadcast(room);
      } catch (err) {
        console.error(`[tick ${room.code}]`, err);
      }
    }
    joinLimiter.sweep();
    eventLimiter.sweep();
  }, opts.tickMs ?? 500);

  return {
    broadcast,
    stop: () => clearInterval(ticker),
  };
}
