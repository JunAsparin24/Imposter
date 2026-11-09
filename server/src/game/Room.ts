import { timingSafeEqual } from 'node:crypto';
import {
  CUSTOM_PACK,
  DEFAULT_SETTINGS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  NAME_MAX_LENGTH,
  SCORING,
  TIMING,
  categoryName,
  parseCustomPackLines,
  maxGrinchCount,
  normalizeWord,
  resolveGrinchCount,
  sanitizeName,
  type DiscussionAction,
  type ErrorCode,
  type GameMode,
  type GameSettings,
  type LastGuessInfo,
  type MatchResults,
  type MatchSummary,
  type Phase,
  type PlayerStats,
  type PrivatePlayerState,
  type PublicMatchState,
  type PublicPlayer,
  type PublicRoomState,
  type Role,
  type Team,
  type VoteHistoryEntry,
  type VoteResult,
  type VoteTallyEntry,
  type WinReason,
} from '@imposter/shared';
import { generateId, generateToken, shuffle, type Rng } from './rng';
import type { WordBank, WordEntry } from './wordBank';

/** Error with a client-safe code + message. Never put secret info in the message. */
export class GameError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface RoomDeps {
  rng: Rng;
  words: WordBank;
  clock: () => number;
}

/** Server-only player record. Contains the session token, so it is never serialised directly. */
export interface PlayerRecord {
  id: string;
  token: string;
  name: string;
  avatar: string;
  connected: boolean;
  disconnectedAt: number | null;
  socketId: string | null;
  ready: boolean;
  joinedAt: number;
  score: number;
  stats: PlayerStats;
  /** Left/kicked mid-match: kept until the match ends so names still resolve. */
  left: boolean;
}

interface Ballot {
  picks: string[];
  skip: boolean;
}

interface VoteSession {
  id: string;
  round: number;
  slots: number;
  candidateIds: string[];
  lockedInIds: string[];
  allowSkip: boolean;
  isRevote: boolean;
  eligibleIds: string[];
  ballots: Map<string, Ballot>;
  result: VoteResult | null;
  /** Counted for "correct vote" points (tie votes that led to a revote are not). */
  counted: boolean;
}

interface PendingRevote {
  candidateIds: string[];
  slots: number;
  lockedInIds: string[];
}

/** Server-only match state. Holds the secret word and roles. */
interface Match {
  id: string;
  number: number;
  /** Settings snapshot: host edits during a match only affect the next match. */
  settings: GameSettings;
  word: WordEntry;
  /** Name of the custom pack at match start (for custom words' category label). */
  packName: string;
  participantIds: string[];
  roles: Map<string, Role>;
  grinchIds: string[];
  acknowledged: Set<string>;
  eliminatedIds: string[];
  departedIds: string[];
  round: number;
  speakingOrder: string[];
  turnIndex: number;
  turnStartedAt: number;
  spokenIds: Set<string>;
  vote: VoteSession | null;
  voteHistory: VoteSession[];
  lastResult: VoteResult | null;
  /** False while the voted-out player's role is still hidden (host taps "Reveal role"). */
  resultRevealed: boolean;
  pendingRevote: PendingRevote | null;
  finalGuess: { guesserIds: string[] } | null;
  allGuesses: { playerId: string; correct: boolean }[];
  /** Practice round: easy word, no points, not counted. */
  practice: boolean;
  /** Mode actually used for this match (practice rounds are always Classic). */
  mode: GameMode;
  /** Undercover: the imposters' related-but-different word. */
  imposterWord: WordEntry | null;
  /** Chaos: whether imposters get a hint this match (random). */
  hintGiven: boolean;
  lastGuess: LastGuessInfo | null;
  results: MatchResults | null;
}

const ABANDONED_EMPTY_MS = 10 * 60_000;
const ABANDONED_IDLE_MS = 6 * 60 * 60_000;
const RECENT_WORDS_LIMIT = 150;
const HISTORY_LIMIT = 30;
/** Chaos: chance (in %) that a match has no imposters at all. */
const CHAOS_ZERO_IMPOSTER_PERCENT = 15;

const emptyStats = (): PlayerStats => ({
  matchesPlayed: 0,
  wins: 0,
  grinchMatches: 0,
  correctVotes: 0,
  correctGuesses: 0,
  elfWins: 0,
  grinchWins: 0,
  timesVotedOut: 0,
});

export interface CustomPack {
  name: string;
  words: WordEntry[];
}

/**
 * One game room and its authoritative state machine.
 *
 * Phases: LOBBY → ROLE_REVEAL → CLUE → DISCUSSION → VOTING → VOTE_RESULTS
 *         → (FINAL_GUESS) → CLUE (next round) … → ROUND_RESULTS → SCOREBOARD → (next match)
 *
 * Every mutating method validates the actor and phase first and throws GameError
 * before changing anything, so a rejected action never leaves partial state.
 */
export class Room {
  readonly createdAt: number;
  lastActivity: number;
  hostId = '';
  readonly players = new Map<string, PlayerRecord>();
  settings: GameSettings = structuredClone(DEFAULT_SETTINGS);
  phase: Phase = 'LOBBY';
  phaseSeq = 0;
  deadline: number | null = null;
  pausedRemainingMs: number | null = null;
  match: Match | null = null;
  matchesPlayed = 0;
  history: MatchSummary[] = [];
  private recentWords: string[] = [];
  /** Host has locked the room: no new players can join. */
  locked = false;
  /** Host-made word pack, used when the "custom" category is selected. */
  customPack: CustomPack | null = null;
  /**
   * The device that created the room acts as the shared room screen (code, players, live game view).
   * It is not a player. This token lets it reconnect after a refresh.
   */
  readonly displayToken = generateToken();
  /** Socket ids of connected room screens. */
  readonly displaySockets = new Set<string>();

  constructor(
    readonly code: string,
    private readonly deps: RoomDeps,
  ) {
    this.createdAt = deps.clock();
    this.lastActivity = this.createdAt;
  }

  private now(): number {
    return this.deps.clock();
  }

  touch(): void {
    this.lastActivity = this.now();
  }

  // ───────────────────────────── players & sessions ─────────────────────────────

  activePlayers(): PlayerRecord[] {
    return [...this.players.values()].filter((p) => !p.left).sort((a, b) => a.joinedAt - b.joinedAt);
  }

  joinBlocker(): ErrorCode | null {
    if (this.locked) return 'ROOM_LOCKED';
    if (this.phase !== 'LOBBY' && this.phase !== 'SCOREBOARD') return 'GAME_IN_PROGRESS';
    if (this.activePlayers().length >= this.settings.maxPlayers) return 'ROOM_FULL';
    return null;
  }

  addPlayer(rawName: string, avatar: string): PlayerRecord {
    const blocker = this.joinBlocker();
    if (blocker === 'GAME_IN_PROGRESS') {
      throw new GameError(blocker, 'A game is already in progress in this room. Ask the host to let you in after this match.');
    }
    if (blocker === 'ROOM_FULL') throw new GameError(blocker, `This room is full (${this.settings.maxPlayers} players max).`);
    if (blocker === 'ROOM_LOCKED') throw new GameError(blocker, 'The host has locked this room.');
    const base = sanitizeName(rawName);
    if (!base) throw new GameError('INVALID_INPUT', 'Please enter a display name.');
    // Each avatar can only be used by one player in a room.
    if (this.takenAvatars().includes(avatar)) {
      throw new GameError('AVATAR_TAKEN', 'Someone already picked that avatar. Choose another one.');
    }
    const now = this.now();
    const player: PlayerRecord = {
      id: generateId('p'),
      token: generateToken(),
      name: this.uniqueName(base),
      avatar,
      connected: false,
      disconnectedAt: now,
      socketId: null,
      ready: false,
      // Guarantee a strict join order even within the same millisecond.
      joinedAt: Math.max(now, ...[...this.players.values()].map((p) => p.joinedAt + 1)),
      score: 0,
      stats: emptyStats(),
      left: false,
    };
    this.players.set(player.id, player);
    if (!this.hostId || !this.players.get(this.hostId) || this.players.get(this.hostId)!.left) {
      this.hostId = player.id;
    }
    this.touch();
    return player;
  }

  takenAvatars(): string[] {
    return this.activePlayers().map((p) => p.avatar);
  }

  /** Duplicate display names get a numeric suffix ("Alex", "Alex 2"). IDs, not names, identify players. */
  private uniqueName(base: string): string {
    const taken = new Set(this.activePlayers().map((p) => p.name.toLowerCase()));
    if (!taken.has(base.toLowerCase())) return base;
    for (let n = 2; ; n++) {
      const suffix = ` ${n}`;
      const candidate = base.slice(0, NAME_MAX_LENGTH - suffix.length).trimEnd() + suffix;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
  }

  findByToken(token: string): PlayerRecord | undefined {
    const given = Buffer.from(token);
    for (const p of this.players.values()) {
      if (p.left || !p.token) continue;
      const own = Buffer.from(p.token);
      if (own.length === given.length && timingSafeEqual(own, given)) return p;
    }
    return undefined;
  }

  connect(playerId: string, socketId: string): void {
    const p = this.players.get(playerId);
    if (!p) return;
    p.connected = true;
    p.disconnectedAt = null;
    p.socketId = socketId;
    this.touch();
  }

  /** Returns true if this socket was the player's live connection. */
  disconnect(playerId: string, socketId: string): boolean {
    const p = this.players.get(playerId);
    if (!p || p.socketId !== socketId) return false;
    p.connected = false;
    p.disconnectedAt = this.now();
    p.socketId = null;
    this.touch();
    return true;
  }

  setReady(playerId: string, ready: boolean): void {
    if (this.phase !== 'LOBBY' && this.phase !== 'SCOREBOARD') {
      throw new GameError('WRONG_PHASE', 'You can only ready up between matches.');
    }
    const p = this.requirePlayer(playerId);
    p.ready = ready;
  }

  kick(actorId: string, targetId: string): void {
    this.requireHost(actorId);
    if (actorId === targetId) throw new GameError('NOT_ALLOWED', "You can't kick yourself. Use Leave instead.");
    const target = this.players.get(targetId);
    if (!target || target.left) throw new GameError('INVALID_INPUT', 'That player is not in the room.');
    this.removePlayer(targetId);
  }

  /** Leave or kick. Mid-match, the player is treated as out of the game and their role is revealed. */
  removePlayer(playerId: string): void {
    const p = this.players.get(playerId);
    if (!p || p.left) return;
    p.left = true;
    p.token = '';
    p.connected = false;
    p.socketId = null;
    p.disconnectedAt = this.now();
    const m = this.match;
    const inLiveMatch = !!m && !m.results && m.participantIds.includes(playerId);
    if (!inLiveMatch) this.players.delete(playerId);
    if (this.hostId === playerId) this.hostId = this.pickNewHost(playerId) ?? '';
    if (inLiveMatch) this.handleDeparture(playerId);
    this.touch();
  }

  /** No players and no room screen: safe to delete. */
  isEmpty(): boolean {
    return this.activePlayers().length === 0 && this.displaySockets.size === 0;
  }

  isDisplayToken(token: string): boolean {
    const a = Buffer.from(token);
    const b = Buffer.from(this.displayToken);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private pickNewHost(excludeId?: string): string | null {
    const candidates = this.activePlayers().filter((p) => p.id !== excludeId);
    return (candidates.find((p) => p.connected) ?? candidates[0])?.id ?? null;
  }

  private purgeLeft(): void {
    for (const [id, p] of this.players) if (p.left) this.players.delete(id);
  }

  // ───────────────────────────── settings ─────────────────────────────

  updateSettings(actorId: string, patch: Partial<GameSettings>): void {
    this.requireHost(actorId);
    const next: GameSettings = { ...this.settings, ...patch };
    if (next.categories.length === 0) throw new GameError('INVALID_SETTINGS', 'Pick at least one category.');
    next.categories = [...new Set(next.categories)];
    if (next.grinchCount !== 'auto' && (next.grinchCount < 1 || next.grinchCount > maxGrinchCount(MAX_PLAYERS))) {
      throw new GameError('INVALID_SETTINGS', 'Invalid number of Imposters.');
    }
    const count = this.activePlayers().length;
    if (next.maxPlayers < MIN_PLAYERS || next.maxPlayers > MAX_PLAYERS) {
      throw new GameError('INVALID_SETTINGS', `The player limit must be between ${MIN_PLAYERS} and ${MAX_PLAYERS}.`);
    }
    if (next.maxPlayers < count) {
      throw new GameError('INVALID_SETTINGS', `There are already ${count} players in the room. Kick someone first or pick a bigger limit.`);
    }
    // Settings are snapshotted when a match starts, so editing mid-match only affects the next match.
    this.settings = next;
  }

  /**
   * Saves (or clears, with no valid lines) the host's custom word pack. The words are only
   * ever sent back to the host — players see just the pack name and size.
   */
  setCustomPack(actorId: string, rawName: string, lines: string[]): { count: number } {
    this.requireHost(actorId);
    const entries = parseCustomPackLines(lines);
    if (entries.length === 0) {
      this.customPack = null;
      this.settings.categories = this.settings.categories.filter((c) => c !== 'custom');
      if (this.settings.categories.length === 0) this.settings.categories = ['random'];
      return { count: 0 };
    }
    if (entries.length < CUSTOM_PACK.MIN_WORDS) {
      throw new GameError('INVALID_INPUT', `Add at least ${CUSTOM_PACK.MIN_WORDS} words to your pack.`);
    }
    const name = sanitizeName(rawName).slice(0, CUSTOM_PACK.MAX_NAME_LENGTH) || 'Custom Pack';
    this.customPack = {
      name,
      words: entries.map((e) => ({ word: e.word, hint: e.hint, category: 'custom' as const })),
    };
    return { count: entries.length };
  }

  transferHost(actorId: string, targetId: string): void {
    this.requireHost(actorId);
    const target = this.players.get(targetId);
    if (!target || target.left) throw new GameError('INVALID_INPUT', 'That player is not in the room.');
    if (!target.connected) throw new GameError('NOT_ALLOWED', `${target.name} is offline right now.`);
    this.hostId = targetId;
  }

  setLocked(actorId: string, locked: boolean): void {
    this.requireHost(actorId);
    this.locked = locked;
  }

  /** Display name for a word's category (custom words show the pack's name). */
  private categoryLabel(m: Match): string {
    if (m.word.category === 'practice') return 'Practice round';
    return m.word.category === 'custom' ? m.packName : categoryName(m.word.category);
  }

  // ───────────────────────────── match lifecycle ─────────────────────────────

  /** Starts a match. `practice` = a trial round with an easy everyday word and no points. */
  startMatch(actorId: string, practice = false): void {
    this.requireHost(actorId);
    if (this.phase !== 'LOBBY' && this.phase !== 'SCOREBOARD') {
      throw new GameError('GAME_IN_PROGRESS', 'The game has already started.');
    }
    const present = this.activePlayers().filter((p) => p.connected);
    if (present.length < MIN_PLAYERS) {
      throw new GameError('NOT_ENOUGH_PLAYERS', `You need at least ${MIN_PLAYERS} connected players to start.`);
    }
    const settings = structuredClone(this.settings);
    if (!practice && settings.categories.includes('custom') && !this.customPack) {
      throw new GameError('INVALID_SETTINGS', 'Your custom word pack is empty. Add words or untick "Custom Pack".');
    }
    const mode: GameMode = practice ? 'CLASSIC' : settings.mode;
    const max = maxGrinchCount(present.length);
    const chosenCount = resolveGrinchCount(settings, present.length);
    if (mode !== 'CHAOS' && (chosenCount < 1 || chosenCount > max)) {
      throw new GameError(
        'INVALID_SETTINGS',
        `With ${present.length} players you can have at most ${max} Imposter${max === 1 ? '' : 's'}.`,
      );
    }
    if (mode === 'CHAOS') {
      // Chaos rules: elimination voting with Skip, so the vote itself never reveals the imposter count.
      settings.votingSystem = 'ELIMINATION';
      settings.allowSkipVote = true;
    }

    // Validation passed — from here on we mutate.
    this.purgeLeft();
    if (!practice && this.isSeriesComplete()) this.resetScoresInternal();

    const recent = settings.allowRepeatWords ? [] : this.recentWords;
    let word: WordEntry;
    let imposterWord: WordEntry | null = null;
    if (practice) {
      word = this.deps.words.pickPractice(recent, this.deps.rng);
    } else if (mode === 'UNDERCOVER') {
      const pair = this.deps.words.pickPair(settings.categories, recent, this.deps.rng);
      word = pair.innocent;
      imposterWord = pair.imposter;
    } else {
      word = this.deps.words.pick(settings.categories, recent, this.deps.rng, this.customPack?.words ?? []);
    }
    for (const w of [word, imposterWord]) if (w) this.recentWords.push(normalizeWord(w.word));
    while (this.recentWords.length > RECENT_WORDS_LIMIT) this.recentWords.shift();

    // Chaos: a secret, random number of imposters, sometimes none at all.
    const grinchCount =
      mode === 'CHAOS' ? (this.deps.rng.int(100) < CHAOS_ZERO_IMPOSTER_PERCENT ? 0 : 1 + this.deps.rng.int(max)) : chosenCount;
    const hintGiven = mode === 'CHAOS' ? this.deps.rng.int(2) === 1 : true;

    const ids = present.map((p) => p.id);
    const grinchIds = shuffle(ids, this.deps.rng).slice(0, grinchCount);
    const roles = new Map<string, Role>(ids.map((id) => [id, grinchIds.includes(id) ? 'GRINCH' : 'ELF']));

    this.match = {
      id: generateId('m'),
      number: practice ? 0 : this.matchesPlayed + 1,
      settings,
      word,
      packName: this.customPack?.name ?? 'Custom Pack',
      participantIds: ids,
      roles,
      grinchIds,
      acknowledged: new Set(),
      eliminatedIds: [],
      departedIds: [],
      round: 0,
      speakingOrder: [],
      turnIndex: 0,
      turnStartedAt: this.now(),
      spokenIds: new Set(),
      vote: null,
      voteHistory: [],
      lastResult: null,
      resultRevealed: true,
      pendingRevote: null,
      finalGuess: null,
      allGuesses: [],
      practice,
      mode,
      imposterWord,
      hintGiven,
      lastGuess: null,
      results: null,
    };
    this.setPhase('ROLE_REVEAL', null);
  }

  acknowledgeRole(playerId: string): void {
    const m = this.requireMatch();
    if (!m.participantIds.includes(playerId)) throw new GameError('NOT_ALLOWED', 'You are not playing this match.');
    m.acknowledged.add(playerId);
  }

  beginClues(actorId: string, phaseSeq: number): void {
    this.requireHost(actorId);
    this.requirePhase('ROLE_REVEAL', phaseSeq);
    const m = this.match!;
    // Disconnected players are not waited for — they can still view their role when they return.
    const waiting = this.aliveIds().filter((id) => this.players.get(id)?.connected && !m.acknowledged.has(id));
    if (waiting.length > 0) {
      const names = waiting.map((id) => this.players.get(id)?.name).join(', ');
      throw new GameError('NOT_ALLOWED', `Still waiting for: ${names}`);
    }
    this.beginRound();
  }

  advanceTurn(actorId: string, turnIndex: number): void {
    this.requirePhase('CLUE');
    const m = this.match!;
    if (turnIndex !== m.turnIndex) throw new GameError('STALE_ACTION', 'That turn has already ended.');
    const speaker = this.currentSpeakerId();
    if (actorId !== speaker && actorId !== this.hostId) {
      throw new GameError('NOT_ALLOWED', 'Only the current speaker or the host can end this turn.');
    }
    this.nextTurn(true);
  }

  discussionControl(actorId: string, action: DiscussionAction, phaseSeq: number): void {
    this.requireHost(actorId);
    this.requirePhase('DISCUSSION', phaseSeq);
    const now = this.now();
    if (action === 'pause') {
      if (this.deadline === null) throw new GameError('NOT_ALLOWED', 'The timer is not running.');
      this.pausedRemainingMs = Math.max(0, this.deadline - now);
      this.deadline = null;
    } else if (action === 'resume') {
      if (this.pausedRemainingMs === null) throw new GameError('NOT_ALLOWED', 'The timer is not paused.');
      this.deadline = now + this.pausedRemainingMs;
      this.pausedRemainingMs = null;
    } else {
      const ext = TIMING.DISCUSSION_EXTEND_MS;
      if (this.pausedRemainingMs !== null) this.pausedRemainingMs += ext;
      else this.deadline = Math.max(this.deadline ?? now, now) + ext;
    }
  }

  startVoting(actorId: string, phaseSeq: number): void {
    this.requireHost(actorId);
    this.requirePhase('DISCUSSION', phaseSeq);
    this.openVote();
  }

  submitVote(voterId: string, voteId: string, picks: string[], skip: boolean): void {
    this.requirePhase('VOTING');
    const v = this.match!.vote!;
    if (v.id !== voteId) throw new GameError('STALE_ACTION', 'That vote has already closed.');
    if (!v.eligibleIds.includes(voterId)) throw new GameError('NOT_ALLOWED', "You can't vote in this round.");
    if (v.ballots.has(voterId)) throw new GameError('ALREADY_SUBMITTED', 'Your vote is already locked in.');
    if (skip) {
      if (!v.allowSkip) throw new GameError('NOT_ALLOWED', 'Skipping is disabled.');
      if (picks.length > 0) throw new GameError('INVALID_INPUT', 'A skip vote cannot name players.');
    } else {
      if (new Set(picks).size !== picks.length) throw new GameError('INVALID_INPUT', 'You picked the same player twice.');
      if (picks.includes(voterId)) throw new GameError('NOT_ALLOWED', "You can't vote for yourself.");
      if (picks.some((id) => !v.candidateIds.includes(id))) throw new GameError('INVALID_INPUT', 'That player is not on the ballot.');
      const need = this.requiredPicks(v, voterId);
      if (picks.length !== need) throw new GameError('INVALID_INPUT', `Pick exactly ${need} player${need === 1 ? '' : 's'}.`);
    }
    v.ballots.set(voterId, { picks: [...picks], skip });
    if (v.eligibleIds.every((id) => v.ballots.has(id))) this.resolveVote();
  }

  /** Host reveals the voted-out player's role to everyone at once. */
  revealResult(actorId: string, phaseSeq: number): void {
    this.requireHost(actorId);
    this.requirePhase('VOTE_RESULTS', phaseSeq);
    const m = this.match!;
    if (m.resultRevealed) throw new GameError('STALE_ACTION', 'Already revealed.');
    m.resultRevealed = true;
    if (m.settings.autoAdvance) this.deadline = this.now() + TIMING.VOTE_RESULTS_AUTO_MS;
  }

  closeVoting(actorId: string, phaseSeq: number): void {
    this.requireHost(actorId);
    this.requirePhase('VOTING', phaseSeq);
    this.resolveVote();
  }

  /** Host "Continue" from the vote results or round results screens. */
  continueFromResults(actorId: string, phaseSeq: number): void {
    this.requireHost(actorId);
    if (this.phase === 'VOTE_RESULTS') {
      this.requirePhase('VOTE_RESULTS', phaseSeq);
      if (!this.match!.resultRevealed) throw new GameError('NOT_ALLOWED', 'Reveal their role first.');
      this.afterVoteResults();
    } else if (this.phase === 'ROUND_RESULTS') {
      this.requirePhase('ROUND_RESULTS', phaseSeq);
      // Practice rounds don't count, so they go straight back to the lobby.
      if (this.match!.practice) this.returnToLobby(actorId);
      else this.setPhase('SCOREBOARD', null);
    } else {
      throw new GameError('WRONG_PHASE', 'There is nothing to continue right now.');
    }
  }

  /**
   * The caught Imposter says their guess OUT LOUD; any Innocent (they know the word) taps whether
   * it was right. The first Innocent to answer decides. phaseSeq stops double taps counting twice.
   */
  judgeGuess(judgeId: string, phaseSeq: number, correct: boolean): void {
    this.requirePhase('FINAL_GUESS', phaseSeq);
    const m = this.match!;
    const fg = m.finalGuess!;
    if (m.roles.get(judgeId) !== 'ELF' || m.departedIds.includes(judgeId)) {
      throw new GameError('NOT_ALLOWED', 'Only Innocents (who know the word) can judge the guess.');
    }
    for (const id of fg.guesserIds) m.allGuesses.push({ playerId: id, correct });
    m.lastGuess = { playerId: fg.guesserIds[0], correct };
    if (correct) {
      // A correct final guess wins the match for the whole Imposter team.
      this.endMatch('GRINCHES', 'FINAL_GUESS');
    } else {
      this.resolveFinalGuessFailure();
    }
  }

  returnToLobby(actorId: string): void {
    this.requireHost(actorId);
    this.match = null;
    this.purgeLeft();
    for (const p of this.players.values()) p.ready = false;
    this.setPhase('LOBBY', null);
  }

  resetScores(actorId: string): void {
    this.requireHost(actorId);
    if (this.match && !this.match.results) throw new GameError('WRONG_PHASE', 'Wait until the match is over.');
    this.resetScoresInternal();
  }

  isSeriesComplete(): boolean {
    return this.settings.totalMatches > 0 && this.matchesPlayed >= this.settings.totalMatches;
  }

  private resetScoresInternal(): void {
    for (const p of this.players.values()) {
      p.score = 0;
      p.stats = emptyStats();
    }
    this.matchesPlayed = 0;
    this.history = [];
  }

  // ───────────────────────────── internal transitions ─────────────────────────────

  private setPhase(phase: Phase, deadline: number | null): void {
    this.phase = phase;
    this.phaseSeq++;
    this.deadline = deadline;
    this.pausedRemainingMs = null;
  }

  private beginRound(): void {
    const m = this.match!;
    m.round++;
    // The order is shuffled once, in round 1. Later rounds keep that same order and just
    // skip anyone who has been voted out or left.
    m.speakingOrder =
      m.speakingOrder.length === 0
        ? shuffle(this.aliveIds(), this.deps.rng)
        : m.speakingOrder.filter((id) => this.isAlive(id));
    m.turnIndex = 0;
    m.spokenIds = new Set();
    m.turnStartedAt = this.now();
    m.vote = null;
    m.lastResult = null;
    this.setPhase('CLUE', this.turnDeadline());
  }

  private turnDeadline(): number | null {
    const s = this.match!.settings.turnSeconds;
    return s > 0 ? this.now() + s * 1000 : null;
  }

  private nextTurn(markSpoken: boolean): void {
    const m = this.match!;
    const current = this.currentSpeakerId();
    if (markSpoken && current) m.spokenIds.add(current);
    m.turnIndex++;
    while (m.turnIndex < m.speakingOrder.length && !this.isAlive(m.speakingOrder[m.turnIndex])) m.turnIndex++;
    if (m.turnIndex >= m.speakingOrder.length) {
      const s = m.settings.discussionSeconds;
      this.setPhase('DISCUSSION', s > 0 ? this.now() + s * 1000 : null);
      return;
    }
    m.turnStartedAt = this.now();
    this.deadline = this.turnDeadline();
  }

  private openVote(revote?: PendingRevote): void {
    const m = this.match!;
    const alive = this.aliveIds();
    const candidateIds = revote ? revote.candidateIds : alive;
    const slots = revote
      ? revote.slots
      : m.settings.votingSystem === 'ELIMINATION'
        ? 1
        : alive.filter((id) => m.roles.get(id) === 'GRINCH').length;
    m.vote = {
      id: generateId('v'),
      round: m.round,
      slots,
      candidateIds,
      lockedInIds: revote ? revote.lockedInIds : [],
      allowSkip: m.settings.allowSkipVote,
      isRevote: !!revote,
      // Everyone alive votes, as long as there is someone on the ballot besides themselves.
      eligibleIds: alive.filter((voter) => candidateIds.some((c) => c !== voter)),
      ballots: new Map(),
      result: null,
      counted: false,
    };
    const s = m.settings.votingSeconds;
    this.setPhase('VOTING', s > 0 ? this.now() + s * 1000 : null);
  }

  private requiredPicks(v: VoteSession, voterId: string): number {
    return Math.min(v.slots, v.candidateIds.filter((c) => c !== voterId).length);
  }

  /**
   * Tallies the current vote.
   *  - Skip wins outright        → nobody is eliminated.
   *  - Clear winner(s)           → eliminated (elimination mode) / accused (single-vote mode).
   *  - Tie on the deciding spot  → revote among the tied players.
   *  - Tie again on the revote   → nobody is eliminated; a new clue round starts.
   * Missing ballots (timeout / disconnected) count as abstentions.
   */
  private resolveVote(): void {
    const m = this.match!;
    const v = m.vote!;
    const counts = new Map<string, number>(v.candidateIds.map((c) => [c, 0]));
    let skips = 0;
    for (const b of v.ballots.values()) {
      if (b.skip) skips++;
      else for (const pick of b.picks) counts.set(pick, (counts.get(pick) ?? 0) + 1);
    }
    const ranked: VoteTallyEntry[] = [...counts]
      .map(([targetId, votes]) => ({ targetId, votes }))
      .sort((a, b) => b.votes - a.votes);
    const tally = v.allowSkip
      ? [...ranked, { targetId: 'SKIP', votes: skips }].sort((a, b) => b.votes - a.votes)
      : ranked;
    const topVotes = ranked[0]?.votes ?? 0;
    const base = { tally, isRevote: v.isRevote, roles: {} as Record<string, Role> };
    let result: VoteResult;
    m.pendingRevote = null;

    const tieOrGiveUp = (tied: string[], above: string[]): VoteResult => {
      if (v.isRevote) return { ...base, kind: 'NO_DECISION', playerIds: tied };
      m.pendingRevote = {
        candidateIds: tied,
        slots: v.slots - above.length,
        lockedInIds: [...v.lockedInIds, ...above],
      };
      return { ...base, kind: 'TIE', playerIds: tied };
    };

    if (v.ballots.size === 0) {
      result = { ...base, kind: 'NO_VOTES', playerIds: [] };
    } else if (skips > 0 && skips > topVotes) {
      result = { ...base, kind: 'SKIPPED', playerIds: [] };
    } else if (skips > 0 && skips === topVotes) {
      result = tieOrGiveUp(
        ranked.filter((r) => r.votes === topVotes).map((r) => r.targetId),
        [],
      );
    } else {
      const threshold = ranked[Math.min(v.slots, ranked.length) - 1]?.votes ?? 0;
      const above = ranked.filter((r) => r.votes > threshold).map((r) => r.targetId);
      const atThreshold = ranked.filter((r) => r.votes === threshold).map((r) => r.targetId);
      if (above.length + atThreshold.length <= v.slots) {
        const decided = [...v.lockedInIds, ...above, ...atThreshold];
        const roles: Record<string, Role> = {};
        for (const id of decided) roles[id] = m.roles.get(id)!;
        if (m.settings.votingSystem === 'ELIMINATION') {
          m.eliminatedIds.push(decided[0]);
          result = { ...base, roles, kind: 'ELIMINATED', playerIds: [decided[0]] };
        } else {
          result = { ...base, roles, kind: 'ACCUSED', playerIds: decided };
        }
      } else {
        result = tieOrGiveUp(atThreshold, above);
      }
    }

    v.result = result;
    v.counted = result.kind !== 'TIE';
    m.voteHistory.push(v);
    m.vote = null;
    m.lastResult = result;
    // When someone is voted out, their role stays hidden until the host taps "Reveal role".
    m.resultRevealed = !(result.kind === 'ELIMINATED' || result.kind === 'ACCUSED');
    this.setPhase('VOTE_RESULTS', m.resultRevealed && m.settings.autoAdvance ? this.now() + TIMING.VOTE_RESULTS_AUTO_MS : null);
  }

  private afterVoteResults(): void {
    const m = this.match!;
    const r = m.lastResult!;
    if (r.kind === 'TIE' && m.pendingRevote) {
      const pending = m.pendingRevote;
      m.pendingRevote = null;
      const candidateIds = pending.candidateIds.filter((id) => this.isAlive(id));
      if (candidateIds.length > 0) {
        this.openVote({ ...pending, candidateIds, slots: Math.min(pending.slots, candidateIds.length) });
        return;
      }
    }
    if (m.grinchIds.length === 0) {
      if (r.kind === 'SKIPPED') return this.endMatch('ELVES', 'NO_IMPOSTERS');
      if (r.kind === 'ELIMINATED' || r.kind === 'ACCUSED') return this.endMatch('NONE', 'PARANOIA');
    }
    if (r.kind === 'ELIMINATED') {
      const id = r.playerIds[0];
      if (m.roles.get(id) === 'GRINCH' && m.settings.finalGuessEnabled) {
        this.startFinalGuess([id]);
        return;
      }
      this.afterElimination();
      return;
    }
    if (r.kind === 'ACCUSED') {
      const caughtAll = r.playerIds.length > 0 && r.playerIds.every((id) => m.roles.get(id) === 'GRINCH');
      if (!caughtAll) {
        this.endMatch('GRINCHES', 'INNOCENT_ACCUSED');
      } else if (m.settings.finalGuessEnabled) {
        this.startFinalGuess(r.playerIds.filter((id) => this.isAlive(id)));
      } else {
        this.endMatch('ELVES', 'GRINCHES_CAUGHT');
      }
      return;
    }
    // Skip / no decision / no votes: nobody leaves, play another clue round.
    this.afterElimination();
  }

  private afterElimination(): void {
    const win = this.checkWin();
    if (win) this.endMatch(win.winner, win.reason);
    else this.beginRound();
  }

  private startFinalGuess(guesserIds: string[]): void {
    if (guesserIds.length === 0) {
      this.resolveFinalGuessFailure();
      return;
    }
    this.match!.finalGuess = { guesserIds };
    this.setPhase('FINAL_GUESS', this.now() + TIMING.FINAL_GUESS_MS);
  }

  /** The guess was judged wrong, or time ran out, or the guesser left. */
  private resolveFinalGuessFailure(): void {
    const m = this.match!;
    if (m.finalGuess) m.lastGuess = { playerId: m.finalGuess.guesserIds[0], correct: false };
    m.finalGuess = null;
    if (m.settings.votingSystem === 'SINGLE') this.endMatch('ELVES', 'GRINCHES_CAUGHT');
    else this.afterElimination();
  }

  private checkWin(): { winner: Team; reason: WinReason } | null {
    const m = this.match!;
    const alive = this.aliveIds();
    const grinches = alive.filter((id) => m.roles.get(id) === 'GRINCH').length;
    const elves = alive.length - grinches;
    // Chaos with no imposters at all: only the vote decides (Skip = win, voting someone out = Paranoia).
    if (m.grinchIds.length === 0) return null;
    if (grinches === 0) {
      const anyCaught = m.eliminatedIds.some((id) => m.roles.get(id) === 'GRINCH');
      return { winner: 'ELVES', reason: anyCaught ? 'GRINCHES_CAUGHT' : 'GRINCHES_LEFT' };
    }
    if (grinches >= elves) return { winner: 'GRINCHES', reason: 'GRINCHES_OUTNUMBER' };
    return null;
  }

  /** A participant left or was kicked during a live match. */
  private handleDeparture(playerId: string): void {
    const m = this.match!;
    if (this.phase === 'FINAL_GUESS') {
      if (!m.departedIds.includes(playerId)) m.departedIds.push(playerId);
      // If every caught Imposter who was guessing has left, the guess is lost.
      const fg = m.finalGuess!;
      if (fg.guesserIds.every((id) => m.departedIds.includes(id))) this.resolveFinalGuessFailure();
      return;
    }
    const wasAlive = !m.eliminatedIds.includes(playerId) && !m.departedIds.includes(playerId);
    if (!wasAlive) return;
    m.departedIds.push(playerId);

    const win = this.checkWin();
    if (win) {
      this.endMatch(win.winner, win.reason);
      return;
    }
    if (this.phase === 'CLUE' && m.speakingOrder[m.turnIndex] === playerId) {
      this.nextTurn(false);
    } else if (this.phase === 'VOTING') {
      // Someone on the ballot vanished: restart the vote cleanly with the remaining players.
      this.openVote();
    }
  }

  private endMatch(winner: Team, reason: WinReason): void {
    const m = this.match!;
    if (m.results) return; // scores are only ever awarded once per match

    const points: Record<string, number> = {};
    const breakdown: Record<string, string[]> = {};
    const add = (id: string, pts: number, why: string) => {
      points[id] = (points[id] ?? 0) + pts;
      (breakdown[id] ??= []).push(`+${pts} ${why}`);
    };
    const stillHere = (id: string) => !m.departedIds.includes(id);

    for (const id of m.participantIds) {
      if (!stillHere(id)) continue;
      const role = m.roles.get(id);
      if (winner === 'ELVES' && role === 'ELF') add(id, SCORING.ELF_WIN, 'Innocents won');
      if (winner === 'GRINCHES' && role === 'GRINCH') add(id, SCORING.GRINCH_WIN, 'Imposters won');
    }
    const correctVotes: Record<string, number> = {};
    for (const v of m.voteHistory) {
      if (!v.counted) continue;
      for (const [voterId, ballot] of v.ballots) {
        if (m.roles.get(voterId) !== 'ELF' || !stillHere(voterId)) continue;
        for (const pick of ballot.picks) {
          if (m.roles.get(pick) === 'GRINCH') {
            add(voterId, SCORING.CORRECT_VOTE, 'Voted for an Imposter');
            correctVotes[voterId] = (correctVotes[voterId] ?? 0) + 1;
          }
        }
      }
    }
    for (const g of m.allGuesses) {
      if (g.correct && stillHere(g.playerId)) add(g.playerId, SCORING.FINAL_GUESS_BONUS, 'Guessed the secret word');
    }

    // Practice rounds: show who was who, but award nothing and record nothing.
    if (m.practice) {
      for (const k of Object.keys(points)) delete points[k];
      for (const k of Object.keys(breakdown)) delete breakdown[k];
    }
    for (const id of m.practice ? [] : m.participantIds) {
      const p = this.players.get(id);
      if (!p || p.left) continue;
      p.score += points[id] ?? 0;
      p.stats.matchesPlayed++;
      const role = m.roles.get(id);
      if (role === 'GRINCH') p.stats.grinchMatches++;
      if (winner === 'ELVES' && role === 'ELF') {
        p.stats.wins++;
        p.stats.elfWins++;
      }
      if (winner === 'GRINCHES' && role === 'GRINCH') {
        p.stats.wins++;
        p.stats.grinchWins++;
      }
      if (m.eliminatedIds.includes(id)) p.stats.timesVotedOut++;
      p.stats.correctVotes += correctVotes[id] ?? 0;
      if (m.allGuesses.some((g) => g.correct && g.playerId === id)) p.stats.correctGuesses++;
    }

    const nameOf = (id: string) => this.players.get(id)?.name ?? 'Unknown';
    const votes: VoteHistoryEntry[] = m.voteHistory.map((v) => ({
      round: v.round,
      isRevote: v.isRevote,
      kind: v.result!.kind,
      playerIds: v.result!.playerIds,
      tally: v.result!.tally,
      ballots: [...v.ballots].map(([voterId, b]) => ({ voterId, picks: b.picks, skip: b.skip })),
    }));

    m.results = {
      matchNumber: m.number,
      winner,
      reason,
      word: m.word.word,
      imposterWord: m.imposterWord?.word ?? null,
      category: m.word.category,
      categoryName: this.categoryLabel(m),
      players: m.participantIds.map((id) => ({
        id,
        name: nameOf(id),
        avatar: this.players.get(id)?.avatar ?? 'gentleman',
        role: m.roles.get(id)!,
        eliminated: m.eliminatedIds.includes(id),
        left: m.departedIds.includes(id),
      })),
      pointsEarned: points,
      pointBreakdown: breakdown,
      votes,
      guesses: m.allGuesses,
      practice: m.practice,
    };
    if (!m.practice) this.history.unshift({
      matchNumber: m.number,
      winner,
      reason,
      word: m.word.word,
      grinchNames: m.grinchIds.map(nameOf),
      pointsEarned: points,
      endedAt: this.now(),
    });
    if (this.history.length > HISTORY_LIMIT) this.history.length = HISTORY_LIMIT;
    if (!m.practice) this.matchesPlayed++;
    m.vote = null;
    m.finalGuess = null;
    m.pendingRevote = null;
    this.setPhase('ROUND_RESULTS', null);
  }

  // ───────────────────────────── timers ─────────────────────────────

  /** Called periodically by the server. Returns true when state changed and clients need an update. */
  tick(): boolean {
    const now = this.now();
    let changed = false;

    // Host grace period: after HOST_GRACE_MS offline, the crown passes to a connected player.
    const host = this.players.get(this.hostId);
    if (!host || host.left) {
      const next = this.pickNewHost();
      if (next && next !== this.hostId) {
        this.hostId = next;
        changed = true;
      }
    } else if (!host.connected && host.disconnectedAt !== null && now - host.disconnectedAt >= TIMING.HOST_GRACE_MS) {
      const next = this.activePlayers().find((p) => p.connected && p.id !== host.id);
      if (next) {
        this.hostId = next.id;
        changed = true;
      }
    }

    const m = this.match;
    if (!m || m.results) return changed;
    const expired = this.deadline !== null && now >= this.deadline;

    switch (this.phase) {
      case 'CLUE': {
        if (expired) {
          this.nextTurn(true);
          return true;
        }
        const speaker = this.players.get(this.currentSpeakerId() ?? '');
        if (
          speaker &&
          !speaker.connected &&
          now - Math.max(speaker.disconnectedAt ?? 0, m.turnStartedAt) >= TIMING.SPEAKER_DISCONNECT_GRACE_MS
        ) {
          this.nextTurn(false);
          return true;
        }
        break;
      }
      case 'DISCUSSION':
        if (expired && m.settings.autoAdvance) {
          this.openVote();
          return true;
        }
        break;
      case 'VOTING': {
        const v = m.vote!;
        const missing = v.eligibleIds.filter((id) => !v.ballots.has(id));
        const allMissingAreGone = missing.every((id) => {
          const p = this.players.get(id);
          return !p || (!p.connected && p.disconnectedAt !== null && now - p.disconnectedAt >= TIMING.VOTER_DISCONNECT_GRACE_MS);
        });
        if (expired || allMissingAreGone) {
          this.resolveVote();
          return true;
        }
        break;
      }
      case 'VOTE_RESULTS':
        if (expired) {
          this.afterVoteResults();
          return true;
        }
        break;
      case 'FINAL_GUESS':
        if (expired) {
          this.resolveFinalGuessFailure();
          return true;
        }
        break;
      default:
        break;
    }
    return changed;
  }

  isAbandoned(): boolean {
    const idle = this.now() - this.lastActivity;
    const anyoneConnected = this.displaySockets.size > 0 || this.activePlayers().some((p) => p.connected);
    return (!anyoneConnected && idle >= ABANDONED_EMPTY_MS) || idle >= ABANDONED_IDLE_MS;
  }

  // ───────────────────────────── helpers ─────────────────────────────

  private requirePlayer(playerId: string): PlayerRecord {
    const p = this.players.get(playerId);
    if (!p || p.left) throw new GameError('NOT_IN_ROOM', 'You are not in this room.');
    return p;
  }

  private requireHost(actorId: string): void {
    this.requirePlayer(actorId);
    if (actorId !== this.hostId) throw new GameError('NOT_HOST', 'Only the host can do that.');
  }

  private requireMatch(): Match {
    if (!this.match || this.match.results) throw new GameError('WRONG_PHASE', 'No match is running.');
    return this.match;
  }

  private requirePhase(phase: Phase, phaseSeq?: number): void {
    if (this.phase !== phase || !this.match) throw new GameError('WRONG_PHASE', 'The game has moved on.');
    if (phaseSeq !== undefined && phaseSeq !== this.phaseSeq) {
      throw new GameError('STALE_ACTION', 'Someone already did that.');
    }
  }

  private isAlive(id: string): boolean {
    const m = this.match;
    return !!m && m.participantIds.includes(id) && !m.eliminatedIds.includes(id) && !m.departedIds.includes(id);
  }

  aliveIds(): string[] {
    return this.match ? this.match.participantIds.filter((id) => this.isAlive(id)) : [];
  }

  private currentSpeakerId(): string | null {
    const m = this.match;
    if (!m || this.phase !== 'CLUE') return null;
    return m.speakingOrder[m.turnIndex] ?? null;
  }

  private nextSpeakerId(): string | null {
    const m = this.match;
    if (!m || this.phase !== 'CLUE') return null;
    for (let i = m.turnIndex + 1; i < m.speakingOrder.length; i++) {
      if (this.isAlive(m.speakingOrder[i])) return m.speakingOrder[i];
    }
    return null;
  }

  // ───────────────────────────── serialisation ─────────────────────────────

  /**
   * The public snapshot sent to everyone. It must never contain the secret word, roles of
   * players still in the game, or individual ballots before a match ends.
   */
  publicState(): PublicRoomState {
    const m = this.match;
    const players: PublicPlayer[] = [...this.players.values()]
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((p) => {
        const participant = !!m && m.participantIds.includes(p.id);
        const eliminated = !!m && m.eliminatedIds.includes(p.id);
        const departed = !!m && m.departedIds.includes(p.id);
        // A just-voted-out player's role stays secret until the host reveals it.
        const hiddenForReveal =
          this.phase === 'VOTE_RESULTS' && !m!.resultRevealed && !!m!.lastResult?.playerIds.includes(p.id);
        const roleIsPublic = participant && !hiddenForReveal && (!!m!.results || eliminated || departed);
        return {
          id: p.id,
          name: p.name,
          avatar: p.avatar,
          isHost: p.id === this.hostId,
          connected: p.connected,
          ready: p.ready,
          score: p.score,
          stats: { ...p.stats },
          status: p.left ? 'LEFT' : !m ? 'ACTIVE' : !participant ? 'SPECTATOR' : eliminated ? 'ELIMINATED' : 'ACTIVE',
          revealedRole: roleIsPublic ? m!.roles.get(p.id)! : null,
        };
      });

    let match: PublicMatchState | null = null;
    if (m) {
      const v = m.vote;
      match = {
        id: m.id,
        number: m.number,
        round: m.round,
        mode: m.mode,
        votingSystem: m.settings.votingSystem,
        grinchCount: m.mode === 'CHAOS' ? null : m.grinchIds.length,
        finalGuessEnabled: m.settings.finalGuessEnabled,
        allowSkipVote: m.settings.allowSkipVote,
        practice: m.practice,
        participantIds: [...m.participantIds],
        acknowledgedIds: [...m.acknowledged],
        speakingOrder: [...m.speakingOrder],
        turnIndex: m.turnIndex,
        currentSpeakerId: this.currentSpeakerId(),
        nextSpeakerId: this.nextSpeakerId(),
        spokenIds: [...m.spokenIds],
        vote: v
          ? {
              id: v.id,
              round: v.round,
              slots: v.slots,
              candidateIds: [...v.candidateIds],
              lockedInIds: [...v.lockedInIds],
              allowSkip: v.allowSkip,
              isRevote: v.isRevote,
              eligibleIds: [...v.eligibleIds],
              submittedIds: [...v.ballots.keys()],
            }
          : null,
        lastResult: m.lastResult && !m.resultRevealed ? { ...m.lastResult, roles: {} } : m.lastResult,
        resultRevealed: m.resultRevealed,
        finalGuess: m.finalGuess
          ? { guesserIds: [...m.finalGuess.guesserIds], submittedIds: [] }
          : null,
        lastGuess: m.lastGuess,
        results: m.results,
      };
    }

    return {
      code: this.code,
      hostId: this.hostId,
      phase: this.phase,
      phaseSeq: this.phaseSeq,
      deadline: this.deadline,
      pausedRemainingMs: this.pausedRemainingMs,
      settings: structuredClone(this.settings),
      players,
      match,
      matchesPlayed: this.matchesPlayed,
      seriesComplete: this.isSeriesComplete(),
      history: this.history,
      locked: this.locked,
      customPack: this.customPack ? { name: this.customPack.name, count: this.customPack.words.length } : null,
    };
  }

  /** The private payload for ONE player. Imposters never receive the word. */
  privateState(playerId: string): PrivatePlayerState {
    const base: PrivatePlayerState = {
      playerId,
      role: null,
      word: null,
      category: null,
      categoryName: null,
      teammates: [],
      submittedBallot: null,
      hint: null,
      isGuessing: false,
      canJudge: false,
      // The host wrote these words, so sending them back to the host leaks nothing new.
      customPackLines:
        playerId === this.hostId && this.customPack
          ? this.customPack.words.map((w) => (w.hint ? `${w.word} | ${w.hint}` : w.word))
          : null,
    };
    const m = this.match;
    if (!m) return base;
    const role = m.roles.get(playerId);
    // '' = the room screen: no role at all. Anyone else not dealt in is spectating.
    if (!role) return { ...base, role: playerId ? 'SPECTATOR' : null };

    const out: PrivatePlayerState = { ...base, role };
    if (role === 'ELF') {
      out.word = m.word.word;
      out.category = m.word.category === 'practice' ? null : m.word.category;
      out.categoryName = this.categoryLabel(m);
    } else {
      if (m.mode === 'UNDERCOVER') {
        // Undercover: imposters get their own related word (never the innocents' word).
        out.word = m.imposterWord!.word;
      } else if (m.settings.grinchHint && m.hintGiven) {
        // Every Imposter gets the SAME hint word (never the secret word itself).
        out.hint = m.word.hint || 'No hint for this one';
      }
      // Chaos: imposters don't know who the other imposters are (or how many there are).
      if (m.mode !== 'CHAOS') out.teammates = m.grinchIds
        .filter((id) => id !== playerId)
        .map((id) => ({ id, name: this.players.get(id)?.name ?? 'Unknown', avatar: this.players.get(id)?.avatar ?? 'gentleman' }));
    }
    const ballot = m.vote?.ballots.get(playerId);
    if (ballot) out.submittedBallot = { picks: [...ballot.picks], skip: ballot.skip };
    if (this.phase === 'FINAL_GUESS' && m.finalGuess) {
      out.isGuessing = m.finalGuess.guesserIds.includes(playerId);
      out.canJudge = role === 'ELF' && !m.departedIds.includes(playerId);
    }
    return out;
  }
}
