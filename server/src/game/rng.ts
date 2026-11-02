import { randomBytes, randomInt } from 'node:crypto';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@imposter/shared';

/** Random source. Production uses crypto; tests can inject a deterministic one. */
export interface Rng {
  /** Uniform integer in [0, max). */
  int(max: number): number;
}

export const cryptoRng: Rng = {
  int: (max: number) => randomInt(max),
};

/** Fisher–Yates shuffle (returns a new array). */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function generateRoomCode(rng: Rng = cryptoRng): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[rng.int(ROOM_CODE_ALPHABET.length)];
  return code;
}

/** Opaque, unguessable token used to authenticate a player's session. */
export function generateToken(): string {
  return randomBytes(24).toString('base64url');
}

export function generateId(prefix: string): string {
  return `${prefix}_${randomBytes(9).toString('base64url')}`;
}
