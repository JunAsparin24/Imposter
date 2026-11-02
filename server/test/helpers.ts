import type { GameSettings } from '@imposter/shared';
import { Room } from '../src/game/Room';
import { cryptoRng } from '../src/game/rng';
import { WordBank } from '../src/game/wordBank';

export const words = new WordBank();

export interface TestRoom {
  room: Room;
  clock: { t: number };
  ids: string[];
  host: string;
}

export function makeRoom(playerCount: number, settings: Partial<GameSettings> = {}): TestRoom {
  const clock = { t: 1_000_000 };
  const room = new Room('TESTAB', { rng: cryptoRng, words, clock: () => clock.t });
  const ids: string[] = [];
  for (let i = 0; i < playerCount; i++) {
    const p = room.addPlayer(`Player${i + 1}`, '🎅');
    room.connect(p.id, `socket-${p.id}`);
    ids.push(p.id);
  }
  const host = ids[0];
  room.updateSettings(host, { discussionSeconds: 0, votingSeconds: 0, autoAdvance: false, ...settings });
  return { room, clock, ids, host };
}

export function grinches(t: TestRoom): string[] {
  return [...t.room.match!.grinchIds];
}
export function elves(t: TestRoom): string[] {
  return t.room.match!.participantIds.filter((id) => !t.room.match!.grinchIds.includes(id));
}

/** Start a match, have everyone acknowledge, and begin the first clue round. */
export function startToClues(t: TestRoom): void {
  t.room.startMatch(t.host);
  for (const id of t.room.match!.participantIds) t.room.acknowledgeRole(id);
  t.room.beginClues(t.host, t.room.phaseSeq);
}

export function finishClues(t: TestRoom): void {
  while (t.room.phase === 'CLUE') {
    const s = t.room.publicState().match!;
    t.room.advanceTurn(s.currentSpeakerId!, s.turnIndex);
  }
}

export function toVoting(t: TestRoom): void {
  finishClues(t);
  t.room.startVoting(t.host, t.room.phaseSeq);
}

/** Every eligible voter votes using `choose` (return 'SKIP' to skip). */
export function voteAll(t: TestRoom, choose: (voterId: string) => string | string[] | 'SKIP'): void {
  const v = t.room.publicState().match!.vote!;
  for (const voter of v.eligibleIds) {
    if (t.room.phase !== 'VOTING') break;
    const c = choose(voter);
    if (c === 'SKIP') t.room.submitVote(voter, v.id, [], true);
    else t.room.submitVote(voter, v.id, Array.isArray(c) ? c : [c], false);
  }
}

export function continueResults(t: TestRoom): void {
  t.room.continueFromResults(t.host, t.room.phaseSeq);
}
