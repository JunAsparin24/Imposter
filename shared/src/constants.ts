import type { CategoryId, GameSettings } from './types';

export const MIN_PLAYERS = 3;
/** Hard cap on room size (one avatar each). The host picks the actual limit, up to this. */
export const MAX_PLAYERS = 20;
export const DEFAULT_MAX_PLAYERS = 16;
export const NAME_MAX_LENGTH = 16;

export const ROOM_CODE_LENGTH = 4;
/** No 0/O, 1/I/L to keep codes easy to read aloud and type. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * Which set of characters players pick from. Change this one line to swap back:
 * 'noir' = the newer characters (files in client/public/avatars/noir/),
 * 'classic' = the original characters (files in client/public/avatars/).
 */
export const AVATAR_SET = 'noir' as 'noir' | 'classic';

export const NOIR_AVATARS = [
  'mobster',
  'agent',
  'sleuth',
  'ghost',
  'robot',
  'slime',
  'pawn',
  'black-cat',
  'monocle',
  'diamond',
  'moon',
  'shadow',
  'gear',
  'crystal',
  'case-file',
  'lantern',
  'alien',
  'reaper',
  'oracle',
  'puzzle',
] as const;

const NOIR_LABELS: Record<(typeof NOIR_AVATARS)[number], string> = {
  'mobster': 'Mobster',
  'agent': 'Agent',
  'sleuth': 'Sleuth',
  'ghost': 'Ghost',
  'robot': 'Robot',
  'slime': 'Slime',
  'pawn': 'Pawn',
  'black-cat': 'Black Cat',
  'monocle': 'Monocle',
  'diamond': 'Diamond',
  'moon': 'Moon',
  'shadow': 'Shadow',
  'gear': 'Gear',
  'crystal': 'Crystal',
  'case-file': 'Case File',
  'lantern': 'Lantern',
  'alien': 'Alien',
  'reaper': 'Reaper',
  'oracle': 'Crystal Ball',
  'puzzle': 'Puzzle',
};

export const CLASSIC_AVATARS = [
  'gentleman',
  'artist',
  'detective',
  'maid',
  'scholar',
  'socialite',
  'newsboy',
  'lady-in-red',
  'butler',
  'diva',
  'cabbie',
  'librarian',
  'captain',
  'explorer',
  'professor',
  'stable-hand',
  'baker',
  'heir',
  'hooded-stranger',
  'doctor',
] as const;

const CLASSIC_LABELS: Record<(typeof CLASSIC_AVATARS)[number], string> = {
  'gentleman': 'Gentleman',
  'artist': 'Artist',
  'detective': 'Detective',
  'maid': 'Maid',
  'scholar': 'Scholar',
  'socialite': 'Socialite',
  'newsboy': 'Newsboy',
  'lady-in-red': 'Lady in Red',
  'butler': 'Butler',
  'diva': 'Diva',
  'cabbie': 'Cabbie',
  'librarian': 'Librarian',
  'captain': 'Captain',
  'explorer': 'Explorer',
  'professor': 'Professor',
  'stable-hand': 'Stable Hand',
  'baker': 'Baker',
  'heir': 'Heir',
  'hooded-stranger': 'Hooded Stranger',
  'doctor': 'Doctor',
};

/** The characters players can pick right now. */
export const AVATARS: readonly string[] = AVATAR_SET === 'noir' ? NOIR_AVATARS : CLASSIC_AVATARS;

export type AvatarId = string;

/** Image path for each avatar, under client/public/avatars/ (without .webp). */
export const AVATAR_IMAGES: Record<AvatarId, string> = Object.fromEntries(
  AVATARS.map((a) => [a, AVATAR_SET === 'noir' ? `noir/${a}` : a]),
);

export const AVATAR_LABELS: Record<AvatarId, string> = AVATAR_SET === 'noir' ? NOIR_LABELS : CLASSIC_LABELS;

export interface CategoryMeta {
  id: CategoryId;
  name: string;
  emoji: string;
}

export const CATEGORIES: CategoryMeta[] = [
  { id: 'food', name: 'Food & Drinks', emoji: '🍪' },
  { id: 'animals', name: 'Animals', emoji: '🐧' },
  { id: 'places', name: 'Places', emoji: '🏠' },
  { id: 'movies', name: 'Movies & Shows', emoji: '🎬' },
  { id: 'music', name: 'Songs', emoji: '🎶' },
  { id: 'activities', name: 'Fun Activities', emoji: '⛸️' },
  { id: 'toys', name: 'Toys & Games', emoji: '🧸' },
  { id: 'gadgets', name: 'Gifts', emoji: '🎁' },
  { id: 'decorations', name: 'Christmas Decorations', emoji: '🎄' },
  { id: 'characters', name: 'Characters', emoji: '🎅' },
  { id: 'clothing', name: 'Clothes', emoji: '🧣' },
  { id: 'weather', name: 'Weather', emoji: '🌨️' },
  { id: 'random', name: 'Random Mix', emoji: '🎲' },
  { id: 'custom', name: 'Custom Pack', emoji: '✏️' },
];

/** Limits for host-made word packs. */
export const CUSTOM_PACK = {
  MAX_WORDS: 300,
  MAX_WORD_LENGTH: 40,
  MAX_NAME_LENGTH: 30,
  MIN_WORDS: 3,
} as const;

/**
 * Parses custom pack lines. Each line is a word, optionally followed by "|" and a hint word
 * that every Imposter will see: "Hot Chocolate | Mug". Blank lines, duplicates and over-long
 * entries are dropped.
 */
export function parseCustomPackLines(lines: string[]): { word: string; hint: string }[] {
  const clean = (s: string) =>
    s
      .normalize('NFKC')
      .replace(/[\u0000-\u001f\u007f<>]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  const seen = new Set<string>();
  const out: { word: string; hint: string }[] = [];
  for (const line of lines) {
    const [rawWord, ...rest] = line.split('|');
    const word = clean(rawWord ?? '');
    if (!word || word.length > CUSTOM_PACK.MAX_WORD_LENGTH) continue;
    const key = normalizeWord(word);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const hint = clean(rest.join(' ')).slice(0, CUSTOM_PACK.MAX_WORD_LENGTH);
    out.push({ word, hint });
    if (out.length >= CUSTOM_PACK.MAX_WORDS) break;
  }
  return out;
}

export const MODES: { id: import('./types').GameMode; name: string; description: string }[] = [
  {
    id: 'CLASSIC',
    name: 'Classic',
    description: 'Innocents get the secret word. Imposters only get a hint word and know who the other Imposters are.',
  },
  {
    id: 'CHAOS',
    name: 'Chaos',
    description:
      "A secret, random number of Imposters every match, maybe none. Imposters don't know each other, and only sometimes get a hint. If there are no Imposters, skip the vote to win.",
  },
];

/** Optional roles the host can add. minPlayers = smallest room where the role is dealt in. */
export const SPECIAL_ROLES: { id: import('./types').SpecialRole; name: string; description: string; minPlayers: number }[] = [
  {
    id: 'JESTER',
    name: 'Jester',
    description:
      "One non-Imposter secretly becomes the Jester. They know the word but win alone if the group votes them out, so they act suspicious on purpose.",
    minPlayers: 4,
  },
  {
    id: 'EXECUTIONER',
    name: 'Executioner',
    description:
      'On nobody\'s team. Knows the word and is secretly given one Innocent as a target. Wins (+3) if the group votes that player out at any point.',
    minPlayers: 5,
  },
  {
    id: 'DRIFTER',
    name: 'Drifter',
    description:
      'On nobody\'s team. Gets no word and no hint, but is not an Imposter. Wins (+3) by secretly typing the right word once per match.',
    minPlayers: 5,
  },
  {
    id: 'TWINS',
    name: 'Twins',
    description:
      'Two players, on any team, who know each other. If one is voted out, the other leaves too. Both get +2 if they both make it to the end.',
    minPlayers: 5,
  },
  {
    id: 'DETECTIVE',
    name: 'Detective',
    description:
      'An Innocent who, once per match, can secretly check one player during clues or discussion and learn if they are an Imposter. Only the Detective sees the answer.',
    minPlayers: 5,
  },
  {
    id: 'SABOTEUR',
    name: 'Saboteur',
    description:
      "An Imposter who, once per match, can skip the current speaker's turn or cut the discussion to 10 seconds. Everyone hears that a Saboteur struck, but not who.",
    minPlayers: 5,
  },
  {
    id: 'MAYOR',
    name: 'Mayor',
    description:
      "An Innocent whose vote secretly counts twice. Votes are private, so the Mayor can never prove who they are (and an Imposter can claim to be them).",
    minPlayers: 5,
  },
  {
    id: 'BODYGUARD',
    name: 'Bodyguard',
    description:
      'An Innocent who, once per match, secretly protects one player for that round. If the vote would remove them, nobody leaves. Everyone sees the save, but not who made it.',
    minPlayers: 5,
  },
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
  grinchHint: true,
  allowSkipVote: true,
  autoAdvance: true,
  allowRepeatWords: false,
  totalMatches: 0,
  maxPlayers: DEFAULT_MAX_PLAYERS,
  specialRoles: [],
};

export const SCORING = {
  ELF_WIN: 2,
  GRINCH_WIN: 3,
  CORRECT_VOTE: 1,
  FINAL_GUESS_BONUS: 3,
  JESTER_WIN: 4,
  EXECUTIONER_WIN: 3,
  DRIFTER_WIN: 3,
  TWINS_WIN: 2,
} as const;

export const TIMING = {
  /** Host keeps the crown this long after disconnecting. */
  HOST_GRACE_MS: 30_000,
  /** A disconnected speaker's turn is skipped after this long. */
  SPEAKER_DISCONNECT_GRACE_MS: 20_000,
  /** Voting closes early once every missing voter has been offline this long. */
  VOTER_DISCONNECT_GRACE_MS: 20_000,
  /** Time for the caught Imposter to say a guess and an Innocent to confirm it. */
  FINAL_GUESS_MS: 60_000,
  /** Saboteur: discussion is cut to this. */
  SABOTAGE_CUT_MS: 10_000,
  VOTE_RESULTS_AUTO_MS: 9_000,
  DISCUSSION_EXTEND_MS: 30_000,
} as const;

/** Recommended Imposter count by player count. */
export function recommendedGrinchCount(players: number): number {
  if (players >= 18) return 5;
  if (players >= 14) return 4;
  if (players >= 10) return 3;
  if (players >= 6) return 2;
  return 1;
}

/** Imposters must always be strictly fewer than half the players. */
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
