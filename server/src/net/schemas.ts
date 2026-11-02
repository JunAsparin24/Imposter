import { z } from 'zod';
import {
  AVATARS,
  CATEGORY_IDS,
  DISCUSSION_MAX_SECONDS,
  GUESS_MAX_LENGTH,
  MAX_PLAYERS,
  ROOM_CODE_LENGTH,
  maxGrinchCount,
  type CategoryId,
} from '@imposter/shared';

/** Every incoming Socket.IO payload is parsed with one of these. Unknown keys are stripped. */

const name = z.string().min(1).max(64);
const avatar = z.enum(AVATARS as unknown as [string, ...string[]]);
const code = z
  .string()
  .trim()
  .toUpperCase()
  .length(ROOM_CODE_LENGTH)
  .regex(/^[A-Z0-9]+$/);
const id = z.string().min(1).max(64);
const phaseSeq = z.number().int().min(0);
const empty = z.object({}).strip();

export const schemas = {
  create: z.object({ name, avatar }),
  check: z.object({ code }),
  join: z.object({ code, name, avatar }),
  reconnect: z.object({ code, token: z.string().min(16).max(128) }),
  empty,
  kick: z.object({ playerId: id }),
  ready: z.object({ ready: z.boolean() }),
  phaseSeq: z.object({ phaseSeq }),
  advanceTurn: z.object({ turnIndex: z.number().int().min(0).max(MAX_PLAYERS) }),
  discussion: z.object({ action: z.enum(['pause', 'resume', 'extend']), phaseSeq }),
  vote: z.object({
    voteId: id,
    picks: z.array(id).max(MAX_PLAYERS),
    skip: z.boolean(),
  }),
  guess: z.object({ guess: z.string().max(GUESS_MAX_LENGTH * 2) }),
  settings: z.object({
    settings: z
      .object({
        mode: z.literal('CLASSIC'),
        grinchCount: z.union([z.literal('auto'), z.number().int().min(1).max(maxGrinchCount(MAX_PLAYERS))]),
        categories: z
          .array(z.enum(CATEGORY_IDS as [CategoryId, ...CategoryId[]]))
          .min(1)
          .max(CATEGORY_IDS.length),
        votingSystem: z.enum(['ELIMINATION', 'SINGLE']),
        discussionSeconds: z.number().int().min(0).max(DISCUSSION_MAX_SECONDS),
        turnSeconds: z.number().int().min(0).max(120),
        votingSeconds: z.number().int().min(0).max(300),
        finalGuessEnabled: z.boolean(),
        soundEnabled: z.boolean(),
        categoryHintForGrinch: z.boolean(),
        allowSkipVote: z.boolean(),
        autoAdvance: z.boolean(),
        allowRepeatWords: z.boolean(),
        totalMatches: z.number().int().min(0).max(50),
      })
      .partial()
      .strip(),
  }),
};
