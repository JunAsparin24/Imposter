/**
 * Shared types for IMPOSTER: Christmas Edition.
 *
 * Terminology used everywhere in the codebase:
 *  - ELF     = innocent player (knows the secret word)          -> green
 *  - GRINCH  = imposter (does NOT know the secret word)         -> red
 *  - Match   = one secret word, from role reveal until a team wins
 *  - Round   = one clue cycle inside a match (everyone speaks once, then discussion + vote)
 */

export type Phase =
  | 'LOBBY'
  | 'ROLE_REVEAL'
  | 'CLUE'
  | 'DISCUSSION'
  | 'VOTING'
  | 'VOTE_RESULTS'
  | 'FINAL_GUESS'
  | 'ROUND_RESULTS'
  | 'SCOREBOARD';

/** Only CLASSIC is implemented in Phase 1. UNDERCOVER / CHAOS are planned. */
export type GameMode = 'CLASSIC';
export type VotingSystem = 'ELIMINATION' | 'SINGLE';
export type Role = 'ELF' | 'GRINCH';
export type Team = 'ELVES' | 'GRINCHES';

export type CategoryId =
  | 'food'
  | 'animals'
  | 'places'
  | 'movies'
  | 'music'
  | 'activities'
  | 'toys'
  | 'gadgets'
  | 'decorations'
  | 'characters'
  | 'clothing'
  | 'weather'
  | 'custom'
  | 'random';

export interface GameSettings {
  mode: GameMode;
  /** 'auto' uses the recommended count for the current room size. */
  grinchCount: number | 'auto';
  categories: CategoryId[];
  votingSystem: VotingSystem;
  /** 0 = no discussion timer (host advances manually). */
  discussionSeconds: number;
  /** 0 = no per-turn timer. When set, a turn ends automatically when it expires. */
  turnSeconds: number;
  /** 0 = no voting timer. Voting still closes when every eligible voter submits. */
  votingSeconds: number;
  finalGuessEnabled: boolean;
  soundEnabled: boolean;
  /** Grinches all get the same hint word for the secret word. */
  grinchHint: boolean;
  allowSkipVote: boolean;
  /** Automatically move on when discussion / result timers expire. */
  autoAdvance: boolean;
  /** When false, the room avoids recently used words. */
  allowRepeatWords: boolean;
  /** 0 = play indefinitely. */
  totalMatches: number;
}

export type PlayerStatus = 'ACTIVE' | 'ELIMINATED' | 'SPECTATOR' | 'LEFT';

export interface PlayerStats {
  matchesPlayed: number;
  wins: number;
  grinchMatches: number;
  correctVotes: number;
  correctGuesses: number;
  elfWins: number;
  grinchWins: number;
  timesVotedOut: number;
}

export interface PublicPlayer {
  id: string;
  name: string;
  avatar: string;
  isHost: boolean;
  connected: boolean;
  ready: boolean;
  score: number;
  stats: PlayerStats;
  status: PlayerStatus;
  /** Only set once a role is public: after elimination, after leaving mid-match, or at match end. */
  revealedRole: Role | null;
}

export interface VoteTallyEntry {
  /** A player id, or 'SKIP'. */
  targetId: string;
  votes: number;
}

export type VoteResultKind =
  | 'ELIMINATED' // elimination mode: one player removed
  | 'ACCUSED' // single-vote mode: the group's final accusation
  | 'TIE' // tie -> a revote among the tied players follows
  | 'SKIPPED' // skip won outright
  | 'NO_DECISION' // the revote tied again
  | 'NO_VOTES'; // nobody voted

export interface VoteResult {
  kind: VoteResultKind;
  /** Eliminated / accused / tied players, depending on `kind`. */
  playerIds: string[];
  /** Roles of eliminated / accused players only. Never contains anyone else. */
  roles: Record<string, Role>;
  tally: VoteTallyEntry[];
  isRevote: boolean;
}

export interface PublicVoteSession {
  id: string;
  round: number;
  /** How many players each ballot must name. */
  slots: number;
  candidateIds: string[];
  /** Single-vote mode only: players already accused before a boundary-tie revote. */
  lockedInIds: string[];
  allowSkip: boolean;
  isRevote: boolean;
  eligibleIds: string[];
  /** Who has submitted (never what they voted). */
  submittedIds: string[];
}

export interface PublicFinalGuess {
  guesserIds: string[];
  submittedIds: string[];
}

export interface LastGuessInfo {
  playerId: string;
  correct: boolean;
}

export type WinReason =
  | 'GRINCHES_CAUGHT'
  | 'GRINCHES_OUTNUMBER'
  | 'FINAL_GUESS'
  | 'INNOCENT_ACCUSED'
  | 'GRINCHES_LEFT';

export interface ResultPlayer {
  id: string;
  name: string;
  avatar: string;
  role: Role;
  eliminated: boolean;
  left: boolean;
}

export interface BallotRecord {
  voterId: string;
  picks: string[];
  skip: boolean;
}

export interface VoteHistoryEntry {
  round: number;
  isRevote: boolean;
  kind: VoteResultKind;
  playerIds: string[];
  tally: VoteTallyEntry[];
  ballots: BallotRecord[];
}

export interface MatchResults {
  matchNumber: number;
  winner: Team;
  reason: WinReason;
  word: string;
  category: CategoryId | 'practice';
  categoryName: string;
  players: ResultPlayer[];
  /** Points earned this match, per player id. */
  pointsEarned: Record<string, number>;
  /** Human-readable reasons for points, per player id. */
  pointBreakdown: Record<string, string[]>;
  votes: VoteHistoryEntry[];
  guesses: { playerId: string; correct: boolean }[];
  /** Practice rounds award no points and don't count towards stats. */
  practice: boolean;
}

export interface MatchSummary {
  matchNumber: number;
  winner: Team;
  reason: WinReason;
  word: string;
  grinchNames: string[];
  pointsEarned: Record<string, number>;
  endedAt: number;
}

export interface PublicMatchState {
  id: string;
  number: number;
  round: number;
  mode: GameMode;
  votingSystem: VotingSystem;
  grinchCount: number;
  finalGuessEnabled: boolean;
  allowSkipVote: boolean;
  /** Practice round: easy everyday word, no points. */
  practice: boolean;
  participantIds: string[];
  acknowledgedIds: string[];
  speakingOrder: string[];
  turnIndex: number;
  currentSpeakerId: string | null;
  nextSpeakerId: string | null;
  spokenIds: string[];
  vote: PublicVoteSession | null;
  lastResult: VoteResult | null;
  finalGuess: PublicFinalGuess | null;
  lastGuess: LastGuessInfo | null;
  /** Only present once the match is over. */
  results: MatchResults | null;
}

export interface PublicRoomState {
  code: string;
  hostId: string;
  phase: Phase;
  /** Increments on every phase change. Host actions must echo it back. */
  phaseSeq: number;
  /** Epoch ms (server clock) when the current timer ends, or null. */
  deadline: number | null;
  /** Set while the host has paused the discussion timer. */
  pausedRemainingMs: number | null;
  settings: GameSettings;
  players: PublicPlayer[];
  match: PublicMatchState | null;
  matchesPlayed: number;
  seriesComplete: boolean;
  history: MatchSummary[];
  /** Host has locked the room: nobody new can join. */
  locked: boolean;
  /** The host's custom word pack (never the words themselves - those would help Grinches). */
  customPack: { name: string; count: number } | null;
}

/** Sent only to the one player it belongs to. */
export interface PrivatePlayerState {
  playerId: string;
  role: Role | 'SPECTATOR' | null;
  /** Only ever set for ELF players. */
  word: string | null;
  /** Elves only. */
  category: CategoryId | null;
  categoryName: string | null;
  /** Grinches only (when the hint setting is on): the same hint word every Grinch gets. */
  hint: string | null;
  /** Grinch only: the other Grinches this match. */
  teammates: { id: string; name: string; avatar: string }[];
  submittedBallot: { picks: string[]; skip: boolean } | null;
  /** I'm the caught Grinch who gets to say a final guess out loud. */
  isGuessing: boolean;
  /** I'm an Elf (I know the word), so I can confirm whether the spoken guess was right. */
  canJudge: boolean;
  /** Host only: the room's custom word pack, one entry per line ("Word | hint"). */
  customPackLines: string[] | null;
}

export interface StateEnvelope {
  serverNow: number;
  room: PublicRoomState;
  me: PrivatePlayerState;
  /** 'display' = the shared room screen (the device that created the room). It has no role. */
  viewer: 'player' | 'display';
}

/** The device that created the room shows it on screen; this token lets it reconnect. */
export interface DisplaySession {
  code: string;
  displayToken: string;
}

export interface SessionInfo {
  code: string;
  playerId: string;
  token: string;
}

export type ErrorCode =
  | 'INVALID_INPUT'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'GAME_IN_PROGRESS'
  | 'ALREADY_IN_ROOM'
  | 'NOT_IN_ROOM'
  | 'INVALID_SESSION'
  | 'NOT_HOST'
  | 'WRONG_PHASE'
  | 'STALE_ACTION'
  | 'NOT_ALLOWED'
  | 'NOT_ENOUGH_PLAYERS'
  | 'INVALID_SETTINGS'
  | 'ALREADY_SUBMITTED'
  | 'RATE_LIMITED'
  | 'ROOM_LOCKED'
  | 'INTERNAL';

export interface GameErrorPayload {
  code: ErrorCode;
  message: string;
}

export type Ack<T = null> = { ok: true; data: T } | { ok: false; error: GameErrorPayload };
export type AckFn<T = null> = (res: Ack<T>) => void;

export interface RoomCheckResult {
  exists: boolean;
  joinable: boolean;
  reason: ErrorCode | null;
}

export type DiscussionAction = 'pause' | 'resume' | 'extend';

export interface ClientToServerEvents {
  'room:create': (p: Record<string, never>, ack: AckFn<DisplaySession>) => void;
  'room:watch': (p: { code: string; displayToken: string }, ack: AckFn<DisplaySession>) => void;
  'room:unwatch': (p: Record<string, never>, ack: AckFn) => void;
  'room:check': (p: { code: string }, ack: AckFn<RoomCheckResult>) => void;
  'room:join': (p: { code: string; name: string; avatar: string }, ack: AckFn<SessionInfo>) => void;
  'room:reconnect': (p: { code: string; token: string }, ack: AckFn<SessionInfo>) => void;
  'room:leave': (p: Record<string, never>, ack: AckFn) => void;
  'room:kick': (p: { playerId: string }, ack: AckFn) => void;
  'room:updateSettings': (p: { settings: Partial<GameSettings> }, ack: AckFn) => void;
  'player:ready': (p: { ready: boolean }, ack: AckFn) => void;
  'game:start': (p: { practice?: boolean }, ack: AckFn) => void;
  'game:nextMatch': (p: Record<string, never>, ack: AckFn) => void;
  'game:roleAcknowledged': (p: Record<string, never>, ack: AckFn) => void;
  'game:beginClues': (p: { phaseSeq: number }, ack: AckFn) => void;
  'game:advanceTurn': (p: { turnIndex: number }, ack: AckFn) => void;
  'game:discussionControl': (p: { action: DiscussionAction; phaseSeq: number }, ack: AckFn) => void;
  'game:startVoting': (p: { phaseSeq: number }, ack: AckFn) => void;
  'game:submitVote': (p: { voteId: string; picks: string[]; skip: boolean }, ack: AckFn) => void;
  'game:closeVoting': (p: { phaseSeq: number }, ack: AckFn) => void;
  'game:continue': (p: { phaseSeq: number }, ack: AckFn) => void;
  'game:judgeGuess': (p: { correct: boolean; phaseSeq: number }, ack: AckFn) => void;
  'game:returnToLobby': (p: Record<string, never>, ack: AckFn) => void;
  'game:resetScores': (p: Record<string, never>, ack: AckFn) => void;
  'room:setCustomPack': (p: { name: string; lines: string[] }, ack: AckFn<{ count: number }>) => void;
  'room:transferHost': (p: { playerId: string }, ack: AckFn) => void;
  'room:setLocked': (p: { locked: boolean }, ack: AckFn) => void;
}

export interface ServerToClientEvents {
  'game:stateUpdated': (envelope: StateEnvelope) => void;
  'game:error': (err: GameErrorPayload) => void;
  'session:ended': (p: { reason: 'KICKED' | 'REPLACED' | 'ROOM_CLOSED' }) => void;
}
