import type { CategoryId, GameSettings } from './types';

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 16;
export const NAME_MAX_LENGTH = 16;
export const GUESS_MAX_LENGTH = 60;

export const ROOM_CODE_LENGTH = 6;
/** No 0/O, 1/I/L to keep codes easy to read aloud and type. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const AVATARS = [
  '🎅', '🤶', '🦌', '⛄', '🎄', '🎁', '🍪', '🔔',
  '⭐', '🧦', '🍭', '❄️', '🐧', '🐻‍❄️', '🦊', '🦉',
  '🧸', '🎿', '🕯️', '☕',
] as const;

export interface CategoryMeta {
  id: CategoryId;
  name: string;
  emoji: string;
}

export const CATEGORIES: CategoryMeta[] = [
  { id: 'food', name: 'Christmas Food & Drinks', emoji: '🍪' },
  { id: 'animals', name: 'Winter Animals', emoji: '🦌' },
  { id: 'places', name: 'Christmas Around the World', emoji: '🌍' },
  { id: 'movies', name: 'Christmas Movies & TV', emoji: '🎬' },
  { id: 'music', name: 'Christmas Songs', emoji: '🎶' },
  { id: 'activities', name: 'Winter Sports & Activities', emoji: '⛸️' },
  { id: 'toys', name: 'Toys & Games', emoji: '🧸' },
  { id: 'gadgets', name: 'Gadgets & Gifts', emoji: '🎁' },
  { id: 'decorations', name: 'Decorations & Holiday Things', emoji: '🎄' },
  { id: 'characters', name: 'Christmas Characters', emoji: '🎅' },
  { id: 'random', name: 'Random Mix', emoji: '🎲' },
];

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as CategoryId[];

export function categoryName(id: CategoryId): string {
  return CATEGORIES.find((c) => c.id === id)?.name ?? id;
}

export const DISCUSSION_PRESETS = [0, 30, 60, 90, 120];
export const TURN_PRESETS = [0, 15, 20, 30, 45];
export const VOTING_PRESETS = [0, 30, 45, 60, 90];
export const DISCUSSION_MAX_SECONDS = 600;

export const DEFAULT_SETTINGS: GameSettings = {
  mode: 'CLASSIC',
  grinchCount: 'auto',
  categories: ['random'],
  votingSystem: 'ELIMINATION',
  discussionSeconds: 90,
  turnSeconds: 0,
  votingSeconds: 60,
  finalGuessEnabled: true,
  soundEnabled: true,
  categoryHintForGrinch: false,
  allowSkipVote: true,
  autoAdvance: true,
  allowRepeatWords: false,
  totalMatches: 0,
};

export const SCORING = {
  ELF_WIN: 2,
  GRINCH_WIN: 3,
  CORRECT_VOTE: 1,
  FINAL_GUESS_BONUS: 3,
} as const;

export const TIMING = {
  /** Host keeps the crown this long after disconnecting. */
  HOST_GRACE_MS: 30_000,
  /** A disconnected speaker's turn is skipped after this long. */
  SPEAKER_DISCONNECT_GRACE_MS: 20_000,
  /** Voting closes early once every missing voter has been offline this long. */
  VOTER_DISCONNECT_GRACE_MS: 20_000,
  FINAL_GUESS_MS: 45_000,
  VOTE_RESULTS_AUTO_MS: 9_000,
  DISCUSSION_EXTEND_MS: 30_000,
} as const;

/** Recommended Grinch count by player count. */
export function recommendedGrinchCount(players: number): number {
  if (players >= 14) return 4;
  if (players >= 10) return 3;
  if (players >= 6) return 2;
  return 1;
}

/** Grinches must always be strictly fewer than half the players. */
export function maxGrinchCount(players: number): number {
  return Math.max(1, Math.floor((players - 1) / 2));
}

export function resolveGrinchCount(settings: GameSettings, players: number): number {
  return settings.grinchCount === 'auto' ? recommendedGrinchCount(players) : settings.grinchCount;
}

/**
 * Normalises a word for comparison: case-insensitive, trims, collapses whitespace,
 * unifies apostrophes/dashes and drops surrounding punctuation. Not fuzzy.
 */
export function normalizeWord(input: string): string {
  return input
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/[-_–—]/g, ' ')
    .replace(/[.!?,"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sanitizeName(input: string): string {
  return input
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX_LENGTH);
}
