import { describe, expect, it } from 'vitest';
import { SCORING, TIMING } from '@imposter/shared';
import { GameError } from '../src/game/Room';
import {
  continueResults,
  elves,
  finishClues,
  grinches,
  makeRoom,
  startToClues,
  toVoting,
  voteAll,
  words,
} from './helpers';

function expectError(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(GameError);
    expect((e as GameError).code).toBe(code);
    return;
  }
  throw new Error(`expected GameError ${code}`);
}

/** Vote so that `target` gets every vote (target votes for someone else). */
function everyoneVotes(t: ReturnType<typeof makeRoom>, target: string) {
  voteAll(t, (voter) => (voter === target ? t.room.aliveIds().find((id) => id !== target)! : target));
}

describe('word bank', () => {
  it('has 20+ words in every category, each with a hint that does not give the word away', () => {
    for (const c of words.categories()) {
      expect(words.count(c)).toBeGreaterThanOrEqual(20);
      for (const w of words.words(c)) {
        expect(w.hint, w.word).toBeTruthy();
        expect(w.word.toLowerCase().includes(w.hint.toLowerCase()), w.word).toBe(false);
      }
    }
    expect(words.practice().length).toBeGreaterThanOrEqual(10);
  });
});

describe('room setup', () => {
  it('gives duplicate names a suffix but unique ids', () => {
    const t = makeRoom(1);
    const a = t.room.addPlayer('Alex', 'baker');
    const b = t.room.addPlayer('alex', 'butler');
    expect(a.id).not.toBe(b.id);
    expect(b.name).toBe('alex 2');
  });

  it('each avatar can only be used by one player; it frees up when they leave', () => {
    const t = makeRoom(0);
    const a = t.room.addPlayer('Alex', 'baker');
    expectError(() => t.room.addPlayer('Jordan', 'baker'), 'AVATAR_TAKEN');
    expect(t.room.takenAvatars()).toEqual(['baker']);
    t.room.removePlayer(a.id);
    t.room.addPlayer('Jordan', 'baker');
  });

  it('only the host can start, needs 3 players, and cannot start twice', () => {
    const small = makeRoom(2);
    expectError(() => small.room.startMatch(small.host), 'NOT_ENOUGH_PLAYERS');
    const t = makeRoom(4);
    expectError(() => t.room.startMatch(t.ids[1]), 'NOT_HOST');
    t.room.startMatch(t.host);
    expectError(() => t.room.startMatch(t.host), 'GAME_IN_PROGRESS');
  });

  it('rejects Imposters making up half the room', () => {
    const t = makeRoom(4, { grinchCount: 2 });
    expectError(() => t.room.startMatch(t.host), 'INVALID_SETTINGS');
    expect(t.room.phase).toBe('LOBBY');
  });

  it('blocks joining while a match is in progress', () => {
    const t = makeRoom(3);
    t.room.startMatch(t.host);
    expectError(() => t.room.addPlayer('Late', 'gentleman'), 'GAME_IN_PROGRESS');
  });

  it('settings changed mid-match only apply to the next match', () => {
    const t = makeRoom(5, { votingSystem: 'ELIMINATION' });
    t.room.startMatch(t.host);
    t.room.updateSettings(t.host, { votingSystem: 'SINGLE' });
    expect(t.room.publicState().match!.votingSystem).toBe('ELIMINATION');
    expect(t.room.settings.votingSystem).toBe('SINGLE');
  });
});

describe('role privacy', () => {
  it('Imposters never get the word but always see every teammate', () => {
    const t = makeRoom(10, { grinchCount: 3 });
    t.room.startMatch(t.host);
    const g = grinches(t);
    expect(g).toHaveLength(3);
    const word = t.room.match!.word.word;
    for (const id of g) {
      const me = t.room.privateState(id);
      expect(me.role).toBe('GRINCH');
      expect(me.word).toBeNull();
      expect(me.category).toBeNull(); // category hint off by default
      expect(me.teammates.map((x) => x.id).sort()).toEqual(g.filter((x) => x !== id).sort());
      expect(JSON.stringify(me)).not.toContain(word);
    }
    for (const id of elves(t)) {
      const me = t.room.privateState(id);
      expect(me.role).toBe('ELF');
      expect(me.word).toBe(word);
      expect(me.teammates).toEqual([]);
    }
  });

  it('a lone Imposter has no teammates', () => {
    const t = makeRoom(4);
    t.room.startMatch(t.host);
    expect(t.room.privateState(grinches(t)[0]).teammates).toEqual([]);
  });

  it('every Imposter gets the same hint word; Innocents and the public never see it', () => {
    const t = makeRoom(10, { grinchCount: 3, grinchHint: true });
    t.room.startMatch(t.host);
    const hint = t.room.match!.word.hint;
    for (const id of grinches(t)) {
      expect(t.room.privateState(id).hint).toBe(hint);
      expect(t.room.privateState(id).word).toBeNull();
    }
    for (const id of elves(t)) expect(t.room.privateState(id).hint).toBeNull();
    expect(JSON.stringify(t.room.publicState())).not.toContain(`"${hint}"`);
    const off = makeRoom(4, { grinchHint: false });
    off.room.startMatch(off.host);
    expect(off.room.privateState(grinches(off)[0]).hint).toBeNull();
    const me = t.room.privateState(grinches(t)[0]);
    expect(me.category).toBeNull();
    expect(me.word).toBeNull();
  });

  it('the public snapshot never contains the word, roles, or ballots mid-match', () => {
    const t = makeRoom(6);
    startToClues(t);
    const word = t.room.match!.word.word;
    const g = grinches(t);
    toVoting(t);
    const v = t.room.publicState().match!.vote!;
    t.room.submitVote(elves(t)[0], v.id, [g[0]], false);
    const pub = t.room.publicState();
    const json = JSON.stringify(pub);
    expect(json).not.toContain(word);
    expect(json).not.toContain('GRINCH');
    expect(json).not.toContain('"ELF"');
    expect(pub.match!.vote!.submittedIds).toEqual([elves(t)[0]]);
    expect(json).not.toContain('picks');
  });
});

describe('clue phase', () => {
  it('only the speaker or host can advance, and stale turns are rejected', () => {
    const t = makeRoom(4);
    startToClues(t);
    const s = t.room.publicState().match!;
    const notSpeaker = t.ids.find((id) => id !== s.currentSpeakerId && id !== t.host)!;
    expectError(() => t.room.advanceTurn(notSpeaker, s.turnIndex), 'NOT_ALLOWED');
    t.room.advanceTurn(s.currentSpeakerId!, s.turnIndex);
    // Host clicking "skip" for the same turn at the same time is rejected as stale.
    expectError(() => t.room.advanceTurn(t.host, s.turnIndex), 'STALE_ACTION');
    expect(t.room.publicState().match!.turnIndex).toBe(1);
  });

  it('requires role acknowledgement from connected players before clues', () => {
    const t = makeRoom(3);
    t.room.startMatch(t.host);
    expectError(() => t.room.beginClues(t.host, t.room.phaseSeq), 'NOT_ALLOWED');
    for (const id of t.ids) t.room.acknowledgeRole(id);
    expectError(() => t.room.beginClues(t.host, t.room.phaseSeq - 1), 'STALE_ACTION');
    t.room.beginClues(t.host, t.room.phaseSeq);
    expect(t.room.phase).toBe('CLUE');
  });

  it('moves to discussion once everyone has spoken and rotates the first speaker', () => {
    const t = makeRoom(5, { allowSkipVote: true });
    startToClues(t);
    const firstOrder = t.room.publicState().match!.speakingOrder;
    expect(new Set(firstOrder).size).toBe(5);
    finishClues(t);
    expect(t.room.phase).toBe('DISCUSSION');
    t.room.startVoting(t.host, t.room.phaseSeq);
    voteAll(t, () => 'SKIP');
    continueResults(t);
    const second = t.room.publicState().match!;
    expect(second.round).toBe(2);
    expect(second.speakingOrder[0]).not.toBe(firstOrder[0]);
  });

  it('skips a disconnected speaker after the grace period', () => {
    const t = makeRoom(4);
    startToClues(t);
    const speaker = t.room.publicState().match!.currentSpeakerId!;
    t.room.disconnect(speaker, `socket-${speaker}`);
    t.clock.t += TIMING.SPEAKER_DISCONNECT_GRACE_MS - 1;
    expect(t.room.tick()).toBe(false);
    t.clock.t += 2;
    expect(t.room.tick()).toBe(true);
    expect(t.room.publicState().match!.turnIndex).toBe(1);
  });
});

describe('discussion', () => {
  it('host can pause, resume and extend the timer; auto-advances to voting', () => {
    const t = makeRoom(4, { discussionSeconds: 60, autoAdvance: true });
    startToClues(t);
    finishClues(t);
    const seq = t.room.phaseSeq;
    expect(t.room.deadline).toBe(t.clock.t + 60_000);
    t.clock.t += 10_000;
    t.room.discussionControl(t.host, 'pause', seq);
    expect(t.room.pausedRemainingMs).toBe(50_000);
    t.clock.t += 100_000;
    expect(t.room.tick()).toBe(false); // paused: no auto-advance
    t.room.discussionControl(t.host, 'extend', seq);
    t.room.discussionControl(t.host, 'resume', seq);
    expect(t.room.deadline).toBe(t.clock.t + 80_000);
    expectError(() => t.room.discussionControl(t.ids[1], 'pause', seq), 'NOT_HOST');
    t.clock.t += 80_000;
    expect(t.room.tick()).toBe(true);
    expect(t.room.phase).toBe('VOTING');
  });
});

describe('voting', () => {
  it('rejects self votes, double votes, non-candidates and eliminated voters', () => {
    const t = makeRoom(5);
    startToClues(t);
    toVoting(t);
    const v = t.room.publicState().match!.vote!;
    const [a, b] = t.ids;
    expectError(() => t.room.submitVote(a, v.id, [a], false), 'NOT_ALLOWED');
    expectError(() => t.room.submitVote(a, v.id, ['p_forged'], false), 'INVALID_INPUT');
    expectError(() => t.room.submitVote(a, v.id, [b, b], false), 'INVALID_INPUT');
    expectError(() => t.room.submitVote(a, 'v_old', [b], false), 'STALE_ACTION');
    t.room.submitVote(a, v.id, [b], false);
    expectError(() => t.room.submitVote(a, v.id, [t.ids[2]], false), 'ALREADY_SUBMITTED');
    expect(t.room.privateState(a).submittedBallot).toEqual({ picks: [b], skip: false });
  });

  it('a tie triggers a revote among the tied; a second tie eliminates nobody', () => {
    const t = makeRoom(4, { allowSkipVote: false });
    startToClues(t);
    toVoting(t);
    const [a, b, c, d] = t.ids;
    // a,c vote b ; b,d vote a  → 2–2 tie between a and b
    voteAll(t, (voter) => (voter === a || voter === c ? b : a));
    let r = t.room.publicState().match!.lastResult!;
    expect(r.kind).toBe('TIE');
    expect(r.playerIds.sort()).toEqual([a, b].sort());
    continueResults(t);
    const revote = t.room.publicState().match!.vote!;
    expect(revote.isRevote).toBe(true);
    expect(revote.candidateIds.sort()).toEqual([a, b].sort());
    // c votes a, d votes b, a must vote b, b must vote a → tie again
    voteAll(t, (voter) => (voter === c ? a : voter === d ? b : voter === a ? b : a));
    r = t.room.publicState().match!.lastResult!;
    expect(r.kind).toBe('NO_DECISION');
    expect(t.room.match!.eliminatedIds).toEqual([]);
    continueResults(t);
    expect(t.room.phase).toBe('CLUE');
    expect(t.room.publicState().match!.round).toBe(2);
  });

  it('when everyone skips, nobody is eliminated', () => {
    const t = makeRoom(4, { allowSkipVote: true });
    startToClues(t);
    toVoting(t);
    voteAll(t, () => 'SKIP');
    expect(t.room.publicState().match!.lastResult!.kind).toBe('SKIPPED');
    expect(t.room.match!.eliminatedIds).toEqual([]);
  });

  it('rejects skip when skipping is disabled', () => {
    const t = makeRoom(4, { allowSkipVote: false });
    startToClues(t);
    toVoting(t);
    const v = t.room.publicState().match!.vote!;
    expectError(() => t.room.submitVote(t.ids[0], v.id, [], true), 'NOT_ALLOWED');
  });

  it('closes voting once missing voters have been offline past the grace period', () => {
    const t = makeRoom(4);
    startToClues(t);
    toVoting(t);
    const v = t.room.publicState().match!.vote!;
    const [a, b, c, d] = t.ids;
    t.room.submitVote(a, v.id, [b], false);
    t.room.submitVote(b, v.id, [a], false);
    t.room.submitVote(c, v.id, [b], false);
    t.room.disconnect(d, `socket-${d}`);
    t.clock.t += TIMING.VOTER_DISCONNECT_GRACE_MS;
    expect(t.room.tick()).toBe(true);
    expect(t.room.phase).toBe('VOTE_RESULTS');
    expect(t.room.publicState().match!.lastResult!.playerIds).toEqual([b]);
  });

  it('eliminated players cannot vote or speak afterwards', () => {
    const t = makeRoom(6, { grinchCount: 1, finalGuessEnabled: false });
    startToClues(t);
    toVoting(t);
    const elf = elves(t)[0];
    everyoneVotes(t, elf);
    // Hidden until the host taps Reveal, then public.
    expect(t.room.publicState().players.find((p) => p.id === elf)!.revealedRole).toBeNull();
    expectError(() => t.room.continueFromResults(t.host, t.room.phaseSeq), 'NOT_ALLOWED');
    expectError(() => t.room.revealResult(t.ids.find((x) => x !== t.host)!, t.room.phaseSeq), 'NOT_HOST');
    t.room.revealResult(t.host, t.room.phaseSeq);
    expect(t.room.publicState().players.find((p) => p.id === elf)!.revealedRole).toBe('ELF');
    continueResults(t);
    expect(t.room.publicState().match!.speakingOrder).not.toContain(elf);
    toVoting(t);
    const v = t.room.publicState().match!.vote!;
    expect(v.eligibleIds).not.toContain(elf);
    expectError(() => t.room.submitVote(elf, v.id, [t.ids.find((x) => x !== elf)!], false), 'NOT_ALLOWED');
  });
});

describe('win conditions and final guess', () => {
  it('catching the only Imposter → final guess; wrong guess → Innocents win and score once', () => {
    const t = makeRoom(4, { finalGuessEnabled: true });
    startToClues(t);
    toVoting(t);
    const [g] = grinches(t);
    everyoneVotes(t, g);
    expect(t.room.publicState().match!.lastResult!.roles).toEqual({});
    expect(JSON.stringify(t.room.publicState())).not.toContain('GRINCH');
    t.room.revealResult(t.host, t.room.phaseSeq);
    const res = t.room.publicState().match!.lastResult!;
    expect(res.kind).toBe('ELIMINATED');
    expect(res.roles[g]).toBe('GRINCH');
    continueResults(t);
    expect(t.room.phase).toBe('FINAL_GUESS');
    expect(t.room.privateState(g).isGuessing).toBe(true);
    expect(t.room.privateState(g).canJudge).toBe(false);
    const elf = elves(t)[0];
    expect(t.room.privateState(elf).canJudge).toBe(true);
    const seq0 = t.room.phaseSeq;
    // The Imposter said their guess out loud; only an Innocent may judge it.
    expectError(() => t.room.judgeGuess(g, seq0, true), 'NOT_ALLOWED');
    t.room.judgeGuess(elf, seq0, false);
    // A second Innocent tapping at the same moment doesn't count twice.
    expectError(() => t.room.judgeGuess(elves(t)[1], seq0, true), 'WRONG_PHASE');
    const pub = t.room.publicState();
    expect(pub.phase).toBe('ROUND_RESULTS');
    expect(pub.match!.results!.winner).toBe('ELVES');
    // Each elf: +2 win, +1 for voting the Imposter.
    for (const id of elves(t)) expect(pub.players.find((p) => p.id === id)!.score).toBe(SCORING.ELF_WIN + SCORING.CORRECT_VOTE);
    expect(pub.players.find((p) => p.id === g)!.score).toBe(0);
    // Continuing twice with the same phaseSeq is rejected: no double phase advance.
    const seq = t.room.phaseSeq;
    t.room.continueFromResults(t.host, seq);
    expectError(() => t.room.continueFromResults(t.host, seq), 'WRONG_PHASE');
    expect(t.room.phase).toBe('SCOREBOARD');
  });

  it('a correct final guess wins for the whole Imposter team', () => {
    const t = makeRoom(8, { grinchCount: 2, finalGuessEnabled: true });
    startToClues(t);
    toVoting(t);
    const [g1, g2] = grinches(t);
    everyoneVotes(t, g1);
    continueResults(t);
    t.room.judgeGuess(elves(t)[0], t.room.phaseSeq, true);
    const pub = t.room.publicState();
    expect(pub.match!.results!.winner).toBe('GRINCHES');
    expect(pub.match!.results!.reason).toBe('FINAL_GUESS');
    expect(pub.players.find((p) => p.id === g1)!.score).toBe(SCORING.GRINCH_WIN + SCORING.FINAL_GUESS_BONUS);
    expect(pub.players.find((p) => p.id === g2)!.score).toBe(SCORING.GRINCH_WIN);
  });

  it('final guess timeout counts as wrong; with Imposters left the match continues', () => {
    const t = makeRoom(8, { grinchCount: 2, finalGuessEnabled: true });
    startToClues(t);
    toVoting(t);
    const [g1, g2] = grinches(t);
    everyoneVotes(t, g1);
    continueResults(t);
    t.clock.t += TIMING.FINAL_GUESS_MS;
    expect(t.room.tick()).toBe(true);
    expect(t.room.phase).toBe('CLUE');
    expect(t.room.aliveIds()).toContain(g2);
    expect(t.room.publicState().match!.lastGuess).toEqual({ playerId: g1, correct: false });
    // Only g1's role is public; g2 stays secret.
    const pub = t.room.publicState();
    expect(pub.players.find((p) => p.id === g1)!.revealedRole).toBe('GRINCH');
    expect(pub.players.find((p) => p.id === g2)!.revealedRole).toBeNull();
  });

  it('Imposters win once they equal the Innocents', () => {
    const t = makeRoom(4, { finalGuessEnabled: false });
    startToClues(t);
    // 1 Imposter vs 3 Innocents. Eliminate two Innocents.
    for (let i = 0; i < 2; i++) {
      toVoting(t);
      const target = elves(t).find((id) => t.room.aliveIds().includes(id))!;
      everyoneVotes(t, target);
      continueResults(t);
    }
    const pub = t.room.publicState();
    expect(pub.phase).toBe('ROUND_RESULTS');
    expect(pub.match!.results!.winner).toBe('GRINCHES');
    expect(pub.match!.results!.reason).toBe('GRINCHES_OUTNUMBER');
  });

  it('single-vote mode: naming every Imposter wins for the Innocents, a miss wins for the Imposters', () => {
    const win = makeRoom(7, { grinchCount: 2, votingSystem: 'SINGLE', finalGuessEnabled: false, allowSkipVote: false });
    startToClues(win);
    toVoting(win);
    const g = grinches(win);
    expect(win.room.publicState().match!.vote!.slots).toBe(2);
    voteAll(win, (voter) => {
      const others = g.filter((x) => x !== voter);
      if (others.length === 2) return others;
      return [...others, elves(win).find((e) => e !== voter)!];
    });
    // Innocents (5 voters) named both Imposters; Imposters split their spare votes → both Imposters top the tally.
    expect(win.room.publicState().match!.lastResult!.kind).toBe('ACCUSED');
    continueResults(win);
    expect(win.room.publicState().match!.results!.winner).toBe('ELVES');

    const lose = makeRoom(5, { grinchCount: 1, votingSystem: 'SINGLE', finalGuessEnabled: false });
    startToClues(lose);
    toVoting(lose);
    const elf = elves(lose)[0];
    everyoneVotes(lose, elf);
    continueResults(lose);
    expect(lose.room.publicState().match!.results!.winner).toBe('GRINCHES');
    expect(lose.room.publicState().match!.results!.reason).toBe('INNOCENT_ACCUSED');
  });

  it('an Imposter leaving mid-match ends it for the Innocents and reveals the role', () => {
    const t = makeRoom(4);
    startToClues(t);
    const [g] = grinches(t);
    t.room.removePlayer(g);
    const pub = t.room.publicState();
    expect(pub.match!.results!.winner).toBe('ELVES');
    expect(pub.match!.results!.reason).toBe('GRINCHES_LEFT');
  });
});

describe('across matches', () => {
  it('play again keeps players and scores; reset clears them', () => {
    const t = makeRoom(4, { finalGuessEnabled: false });
    startToClues(t);
    toVoting(t);
    everyoneVotes(t, grinches(t)[0]);
    continueResults(t);
    continueResults(t); // → SCOREBOARD
    const before = t.room.publicState().players.map((p) => p.score);
    expect(before.some((s) => s > 0)).toBe(true);
    const firstWord = t.room.match!.word.word;
    t.room.startMatch(t.host);
    expect(t.room.publicState().match!.number).toBe(2);
    expect(t.room.match!.word.word).not.toBe(firstWord); // recent words avoided
    expect(t.room.publicState().players.map((p) => p.score)).toEqual(before);
    t.room.returnToLobby(t.host);
    t.room.resetScores(t.host);
    expect(t.room.publicState().players.every((p) => p.score === 0)).toBe(true);
  });

  it('host passes to a connected player after the grace period', () => {
    const t = makeRoom(3);
    t.room.disconnect(t.host, `socket-${t.host}`);
    t.clock.t += TIMING.HOST_GRACE_MS - 1;
    t.room.tick();
    expect(t.room.hostId).toBe(t.host);
    t.clock.t += 1;
    t.room.tick();
    expect(t.room.hostId).toBe(t.ids[1]);
  });

  it('host leaving hands hosting over immediately', () => {
    const t = makeRoom(3);
    t.room.removePlayer(t.host);
    expect(t.room.hostId).toBe(t.ids[1]);
  });
});

describe('phase 2: custom packs, host controls, stats', () => {
  const lines = ['Tinsel Toast', 'Candy Volcano | volcano', 'Snow Taco', 'snow taco', '', 'Jingle Pizza'];

  it('custom words are used, labelled with the pack name, and never made public', () => {
    const t = makeRoom(4, { categories: ['custom'] });
    expectError(() => t.room.setCustomPack(t.ids[1], 'Nope', lines), 'NOT_HOST');
    expect(t.room.setCustomPack(t.host, 'Family Jokes', lines)).toEqual({ count: 4 }); // duplicate + blank dropped
    t.room.startMatch(t.host);
    const word = t.room.match!.word.word;
    expect(['Tinsel Toast', 'Candy Volcano', 'Snow Taco', 'Jingle Pizza']).toContain(word);
    const elf = elves(t).find((id) => id !== t.host) ?? elves(t)[0];
    expect(t.room.privateState(elf).categoryName).toBe('Family Jokes');
    const pub = JSON.stringify(t.room.publicState());
    for (const w of ['Tinsel Toast', 'Candy Volcano', 'Snow Taco', 'Jingle Pizza']) expect(pub).not.toContain(w);
    expect(t.room.publicState().customPack).toEqual({ name: 'Family Jokes', count: 4 });
    // Only the host gets the pack back (for editing).
    expect(t.room.privateState(t.host).customPackLines).toContain('Candy Volcano | volcano');
    expect(t.room.privateState(t.ids[1]).customPackLines).toBeNull();
  });

  it('rejects tiny packs and starting with an empty custom category', () => {
    const t = makeRoom(4, { categories: ['custom'] });
    expectError(() => t.room.setCustomPack(t.host, 'x', ['One', 'Two']), 'INVALID_INPUT');
    expectError(() => t.room.startMatch(t.host), 'INVALID_SETTINGS');
    t.room.setCustomPack(t.host, 'x', lines);
    t.room.setCustomPack(t.host, 'x', []); // clearing removes the custom category too
    expect(t.room.settings.categories).toEqual(['random']);
  });

  it('a locked room blocks new players; the host can hand over hosting', () => {
    const t = makeRoom(3);
    expectError(() => t.room.setLocked(t.ids[1], true), 'NOT_HOST');
    t.room.setLocked(t.host, true);
    expectError(() => t.room.addPlayer('Late', 'gentleman'), 'ROOM_LOCKED');
    t.room.setLocked(t.host, false);
    t.room.addPlayer('Late', 'baker');
    t.room.transferHost(t.host, t.ids[2]);
    expect(t.room.hostId).toBe(t.ids[2]);
    expectError(() => t.room.startMatch(t.host), 'NOT_HOST');
  });

  it('tracks elf/grinch wins and times voted out', () => {
    const t = makeRoom(4, { finalGuessEnabled: false });
    startToClues(t);
    toVoting(t);
    const [g] = grinches(t);
    everyoneVotes(t, g);
    continueResults(t);
    const pub = t.room.publicState();
    const gs = pub.players.find((p) => p.id === g)!.stats;
    expect(gs).toMatchObject({ matchesPlayed: 1, grinchMatches: 1, grinchWins: 0, timesVotedOut: 1 });
    const es = pub.players.find((p) => p.id === elves(t)[0])!.stats;
    expect(es).toMatchObject({ wins: 1, elfWins: 1, correctVotes: 1, timesVotedOut: 0 });
  });
});

describe('room screen and practice round', () => {
  it('a new room starts empty; the first player to join is the host', () => {
    const t = makeRoom(0);
    expect(t.room.players.size).toBe(0);
    expect(t.room.isEmpty()).toBe(true);
    t.room.displaySockets.add('screen');
    expect(t.room.isEmpty()).toBe(false);
    const first = t.room.addPlayer('First', 'gentleman');
    t.room.addPlayer('Second', 'detective');
    expect(t.room.hostId).toBe(first.id);
    // The room screen gets public info only.
    expect(t.room.privateState('')).toMatchObject({ role: null, word: null, hint: null, canJudge: false });
  });

  it('practice rounds use easy words and award no points or stats', () => {
    const t = makeRoom(4, { finalGuessEnabled: false });
    t.room.startMatch(t.host, true);
    expect(t.room.publicState().match!.practice).toBe(true);
    const practiceWords = words.practice().map((w) => w.word);
    expect(practiceWords).toContain(t.room.match!.word.word);
    for (const id of t.room.match!.participantIds) t.room.acknowledgeRole(id);
    t.room.beginClues(t.host, t.room.phaseSeq);
    toVoting(t);
    everyoneVotes(t, grinches(t)[0]);
    continueResults(t);
    const pub = t.room.publicState();
    expect(pub.match!.results!.practice).toBe(true);
    expect(pub.players.every((p) => p.score === 0 && p.stats.matchesPlayed === 0)).toBe(true);
    expect(pub.history).toEqual([]);
    expect(pub.matchesPlayed).toBe(0);
    continueResults(t); // practice → straight back to the lobby
    expect(t.room.phase).toBe('LOBBY');
  });
});
