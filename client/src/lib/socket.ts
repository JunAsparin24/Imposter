import { io, type Socket } from 'socket.io-client';
import type { Ack, ClientToServerEvents, ServerToClientEvents } from '@imposter/shared';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * One socket for the whole app. In dev, Vite proxies /socket.io to the game server;
 * in production the server hosts this page, so same-origin just works.
 * Set VITE_SERVER_URL only if the frontend and backend are hosted separately.
 */
export const socket: GameSocket = io(import.meta.env.VITE_SERVER_URL || undefined, {
  autoConnect: true,
  reconnection: true,
  reconnectionDelay: 500,
  reconnectionDelayMax: 3000,
  transports: ['websocket', 'polling'],
});

type EventName = keyof ClientToServerEvents;

/** Emits an event and resolves with the server's acknowledgement (never rejects). */
export function emitAck<T = null>(event: EventName, payload: unknown = {}, timeoutMs = 8000): Promise<Ack<T>> {
  if (!socket.connected) {
    return Promise.resolve({
      ok: false,
      error: { code: 'INTERNAL', message: "You're offline. Check your internet connection." },
    });
  }
  return new Promise((resolve) => {
    (socket.timeout(timeoutMs) as unknown as { emit: (...args: unknown[]) => void }).emit(
      event,
      payload,
      (err: unknown, res: Ack<T>) => {
        if (err) {
          resolve({ ok: false, error: { code: 'INTERNAL', message: 'The server did not respond. Check your connection.' } });
        } else {
          resolve(res);
        }
      },
    );
  });
}
