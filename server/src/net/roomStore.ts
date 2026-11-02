import type { Room } from '../game/Room';

/**
 * Storage for live rooms.
 *
 * The MVP keeps rooms in memory: ALL ROOMS ARE LOST WHEN THE SERVER RESTARTS.
 * To persist rooms (e.g. Redis), implement this interface and serialise Room state;
 * nothing else in the server talks to the Map directly.
 */
export interface RoomStore {
  get(code: string): Room | undefined;
  has(code: string): boolean;
  set(room: Room): void;
  delete(code: string): void;
  all(): Room[];
  size(): number;
}

export class InMemoryRoomStore implements RoomStore {
  private readonly rooms = new Map<string, Room>();

  get(code: string) {
    return this.rooms.get(code);
  }
  has(code: string) {
    return this.rooms.has(code);
  }
  set(room: Room) {
    this.rooms.set(room.code, room);
  }
  delete(code: string) {
    this.rooms.delete(code);
  }
  all() {
    return [...this.rooms.values()];
  }
  size() {
    return this.rooms.size;
  }
}
