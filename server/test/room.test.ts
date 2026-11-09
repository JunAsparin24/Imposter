import { describe, expect, it } from 'vitest';
import { AVATARS, SCORING, TIMING } from '@imposter/shared';
import { GameError, Room } from '../src/game/Room';
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

  it('keeps the first round speaking order every round, skipping voted-out players', () => {
    const t = makeRoom(6, { allowSkipVote: true, grinchCount: 1, finalGuessEnabled: false });
    startToClues(t);
    const firstOrder = t.room.publicState().match!.speakingOrder;
    expect(new Set(firstOrder).size).toBe(6);
    finishClues(t);
    expect(t.room.phase).toBe('DISCUSSION');
    t.room.startVoting(t.host, t.room.phaseSeq);
    voteAll(t, () => 'SKIP');
    continueResults(t);
    // Nobody out: round 2 has the exact same order.
    expect(t.room.publicState().match!.round).toBe(2);
    expect(t.room.publicState().match!.speakingOrder).toEqual(firstOrder);
    // Vote out an Elf: round 3 keeps the order, just without them.
    toVoting(t);
    const out = elves(t)[0];
    voteAll(t, (voter) => (voter === out ? t.room.aliveIds().find((id) => id !== out)! : out));
    continueResults(t);
    expect(t.room.publicState().match!.round).toBe(3);
    expect(t.room.publicState().match!.speakingOrder).toEqual(firstOrder.filter((id) => id !== out));
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

describe('player limit', () => {
  it('the host sets how many can join (3 to 20) and joins stop at that limit', () => {
    const t = makeRoom(4);
    expectError(() => t.room.updateSettings(t.ids[1], { maxPlayers: 5 }), 'NOT_HOST');
    expectError(() => t.room.updateSettings(t.host, { maxPlayers: 21 }), 'INVALID_SETTINGS');
    expectError(() => t.room.updateSettings(t.host, { maxPlayers: 3 }), 'INVALID_SETTINGS'); // 4 already here
    t.room.updateSettings(t.host, { maxPlayers: 5 });
    t.room.addPlayer('Fifth', 'baker');
    expectError(() => t.room.addPlayer('Sixth', 'butler'), 'ROOM_FULL');
    t.room.updateSettings(t.host, { maxPlayers: 20 });
    for (let i = 0; i < 15; i++) t.room.addPlayer(`P${i}`, AVATARS.filter((a) => !t.room.takenAvatars().includes(a))[0]);
    expect(t.room.activePlayers().length).toBe(20);
    expectError(() => t.room.addPlayer('TooMany', 'baker'), 'ROOM_FULL');
  });
});


describe('chaos mode', () => {
  /** A Room whose dice always roll `n` (or n capped to the range). */
  function chaosRoom(players: number, roll: number) {
    const clock = { t: 1_000_000 };
    const rng = { int: (max: number) => Math.min(roll, max - 1) };
    const room = new Room('CHAOS1', { rng, words, clock: () => clock.t });
    const ids: string[] = [];
    for (let i = 0; i < players; i++) {
      const p = room.addPlayer(`P${i}`, AVATARS[i]);
      room.connect(p.id, `s-${p.id}`);
      ids.push(p.id);
    }
    room.updateSettings(ids[0], { mode: 'CHAOS', votingSystem: 'SINGLE', allowSkipVote: false, discussionSeconds: 0, votingSeconds: 0, autoAdvance: false, finalGuessEnabled: false });
    return { room, clock, ids, host: ids[0] };
  }

  it('hides the imposter count and teammates, and forces elimination voting with skip', () => {
    const t = chaosRoom(8, 50); // 50 → not a zero-imposter match; 1 + min(50, max-1) imposters
    t.room.startMatch(t.host);
    const m = t.room.match!;
    expect(m.grinchIds.length).toBeGreaterThanOrEqual(1);
    expect(t.room.publicState().match!.grinchCount).toBeNull();
    expect(m.settings.votingSystem).toBe('ELIMINATION');
    expect(m.settings.allowSkipVote).toBe(true);
    for (const id of m.grinchIds) expect(t.room.privateState(id).teammates).toEqual([]);
  });

  it('zero imposters: skipping wins for the innocents, voting someone out is paranoia', () => {
    const peaceful = chaosRoom(4, 0); // roll 0 → zero-imposter match, everyone innocent
    startToClues(peaceful as never);
    expect(peaceful.room.match!.grinchIds).toEqual([]);
    toVoting(peaceful as never);
    voteAll(peaceful as never, () => 'SKIP');
    continueResults(peaceful as never);
    let res = peaceful.room.publicState().match!.results!;
    expect(res.winner).toBe('ELVES');
    expect(res.reason).toBe('NO_IMPOSTERS');
    expect(peaceful.room.publicState().players.every((p) => p.score === SCORING.ELF_WIN)).toBe(true);

    const paranoid = chaosRoom(4, 0);
    startToClues(paranoid as never);
    toVoting(paranoid as never);
    const target = paranoid.ids[1];
    voteAll(paranoid as never, (v) => (v === target ? paranoid.ids[2] : target));
    continueResults(paranoid as never);
    res = paranoid.room.publicState().match!.results!;
    expect(res.winner).toBe('NONE');
    expect(res.reason).toBe('PARANOIA');
    expect(paranoid.room.publicState().players.every((p) => p.score === 0)).toBe(true);
  });
});

describe('jester', () => {
  function withJester(players: number) {
    const t = makeRoom(players, { specialRoles: ['JESTER'], grinchCount: 1, finalGuessEnabled: false, allowSkipVote: false });
    startToClues(t);
    const m = t.room.match!;
    return { t, m, jester: m.jesterId };
  }

  it('is dealt to a non-imposter, sees the word, and is hidden from everyone', () => {
    const { t, m, jester } = withJester(5);
    expect(jester).not.toBeNull();
    expect(m.grinchIds).not.toContain(jester);
    const me = t.room.privateState(jester!);
    expect(me.role).toBe('JESTER');
    expect(me.word).toBe(m.word.word);
    expect(t.room.privateState(m.grinchIds[0]).teammates.map((x) => x.id)).not.toContain(jester);
    const pub = t.room.publicState();
    expect(pub.match!.specialRoles).toEqual(['JESTER']);
    // Everyone knows a Jester is in play, but nobody's role (the Jester's included) is public.
    expect(pub.players.every((p) => p.revealedRole === null)).toBe(true);
  });

  it('wins alone when voted out, and nobody else scores', () => {
    const { t, jester } = withJester(5);
    toVoting(t);
    voteAll(t, (v) => (v === jester ? t.room.aliveIds().find((id) => id !== jester)! : jester!));
    continueResults(t);
    const pub = t.room.publicState();
    expect(pub.match!.results!.winner).toBe('JESTER');
    expect(pub.match!.results!.reason).toBe('JESTER_VOTED_OUT');
    for (const p of pub.players) expect(p.score).toBe(p.id === jester ? SCORING.JESTER_WIN : 0);
  });

  it('loses with no points if the imposter is caught instead', () => {
    const { t, m, jester } = withJester(5);
    toVoting(t);
    everyoneVotes(t, m.grinchIds[0]);
    continueResults(t);
    const pub = t.room.publicState();
    expect(pub.match!.results!.winner).toBe('ELVES');
    expect(pub.players.find((p) => p.id === jester)!.score).toBe(0);
  });

  it('is not dealt when the room is too small or in practice rounds', () => {
    expect(withJester(4).jester).not.toBeNull(); // 1 imposter + jester + 2 innocents
    expect(withJester(3).jester).toBeNull();
    const t = makeRoom(6, { specialRoles: ['JESTER'] });
    t.room.startMatch(t.host, true);
    expect(t.room.match!.jesterId).toBeNull();
  });
});

describe('changing character', () => {
  it('works in the lobby, only to a free character, and not mid-match', () => {
    const t = makeRoom(4);
    const [a, b] = t.ids;
    const bAvatar = t.room.players.get(b)!.avatar;
    expectError(() => t.room.setAvatar(a, bAvatar), 'AVATAR_TAKEN');
    const free = AVATARS.find((x) => !t.room.takenAvatars().includes(x))!;
    t.room.setAvatar(a, free);
    expect(t.room.players.get(a)!.avatar).toBe(free);
    startToClues(t);
    const free2 = AVATARS.find((x) => !t.room.takenAvatars().includes(x))!;
    expectError(() => t.room.setAvatar(a, free2), 'WRONG_PHASE');
  });
});

describe('powers: detective, saboteur, mayor', () => {
  const holder = (t: ReturnType<typeof makeRoom>, power: string) => [...t.room.match!.powers].find(([, p]) => p === power)?.[0];

  it('the detective checks one player once per MATCH and only they see the answer', () => {
    const t = makeRoom(6, { specialRoles: ['DETECTIVE'], grinchCount: 1, finalGuessEnabled: false, allowSkipVote: true });
    startToClues(t);
    const det = holder(t, 'DETECTIVE')!;
    expect(det).toBeTruthy();
    expect(t.room.match!.roles.get(det)).toBe('ELF');
    expect(t.room.privateState(det).powerActions).toEqual(['INVESTIGATE']);
    const g = grinches(t)[0];
    expectError(() => t.room.usePower(g, 'INVESTIGATE', det, t.room.phaseSeq), 'NOT_ALLOWED'); // not a detective
    t.room.usePower(det, 'INVESTIGATE', g, t.room.phaseSeq);
    expect(t.room.privateState(det).detectiveResult).toEqual({ targetId: g, isImposter: true });
    expect(t.room.privateState(g).detectiveResult).toBeNull();
    expectError(() => t.room.usePower(det, 'INVESTIGATE', g, t.room.phaseSeq), 'NOT_ALLOWED');
    // Next round: still used up.
    toVoting(t);
    voteAll(t, () => 'SKIP');
    continueResults(t);
    expect(t.room.publicState().match!.round).toBe(2);
    expect(t.room.privateState(det).powerActions).toEqual([]);
    expect(t.room.privateState(det).detectiveResult).toEqual({ targetId: g, isImposter: true });
  });

  it('the saboteur can skip a turn once, announced without naming them', () => {
    const t = makeRoom(6, { specialRoles: ['SABOTEUR'], grinchCount: 1 });
    startToClues(t);
    const sab = holder(t, 'SABOTEUR')!;
    expect(grinches(t)).toContain(sab);
    // Move on until someone else is speaking.
    while (t.room.publicState().match!.currentSpeakerId === sab) {
      const s = t.room.publicState().match!;
      t.room.advanceTurn(s.currentSpeakerId!, s.turnIndex);
    }
    const victim = t.room.publicState().match!.currentSpeakerId!;
    const before = t.room.publicState().match!.turnIndex;
    t.room.usePower(sab, 'SKIP_TURN', null, t.room.phaseSeq);
    const pub = t.room.publicState();
    expect(pub.match!.sabotage).toMatchObject({ kind: 'SKIP_TURN', targetId: victim });
    expect(JSON.stringify(pub.match!.sabotage)).not.toContain(sab);
    expect(pub.match!.turnIndex).toBeGreaterThan(before);
    expectError(() => t.room.usePower(sab, 'SKIP_TURN', null, t.room.phaseSeq), 'NOT_ALLOWED');
  });

  it('the saboteur can cut discussion to 10 seconds, even with auto-advance off', () => {
    const t = makeRoom(6, { specialRoles: ['SABOTEUR'], grinchCount: 1, discussionSeconds: 120, autoAdvance: false });
    startToClues(t);
    finishClues(t);
    const sab = holder(t, 'SABOTEUR')!;
    t.room.usePower(sab, 'CUT_DISCUSSION', null, t.room.phaseSeq);
    expect(t.room.deadline).toBe(t.clock.t + TIMING.SABOTAGE_CUT_MS);
    expectError(() => t.room.discussionControl(t.host, 'extend', t.room.phaseSeq), 'NOT_ALLOWED');
    t.clock.t += TIMING.SABOTAGE_CUT_MS;
    t.room.tick();
    expect(t.room.phase).toBe('VOTING');
  });

  it("the mayor's vote secretly counts twice", () => {
    const t = makeRoom(6, { specialRoles: ['MAYOR'], grinchCount: 1, allowSkipVote: false, finalGuessEnabled: false });
    startToClues(t);
    const mayor = holder(t, 'MAYOR')!;
    toVoting(t);
    const others = t.room.aliveIds().filter((id) => id !== mayor);
    const [a, b] = others;
    // Mayor and A vote for B; everyone else votes for A.
    voteAll(t, (v) => (v === mayor || v === a ? b : v === b ? a : a));
    const tally = t.room.publicState().match!.lastResult!.tally;
    expect(tally.find((x) => x.targetId === b)!.votes).toBe(3); // mayor (2) + A (1)
    // The mayor's identity is not in the public state.
    expect(t.room.privateState(others[2]).power).toBeNull();
  });

  it('the bodyguard saves the voted player once per match, without revealing themselves', () => {
    const t = makeRoom(6, { specialRoles: ['BODYGUARD'], grinchCount: 1, votingSystem: 'ELIMINATION', allowSkipVote: true, finalGuessEnabled: false });
    startToClues(t);
    const bg = holder(t, 'BODYGUARD')!;
    expect(t.room.match!.roles.get(bg)).toBe('ELF');
    const target = elves(t).find((id) => id !== bg)!;
    expectError(() => t.room.usePower(bg, 'PROTECT', bg, t.room.phaseSeq), 'INVALID_INPUT');
    t.room.usePower(bg, 'PROTECT', target, t.room.phaseSeq);
    expect(t.room.privateState(bg).protection).toEqual({ targetId: target, round: 1 });
    expect(t.room.privateState(target).protection).toBeNull();
    expect(JSON.stringify(t.room.publicState())).not.toContain('"protection"');
    toVoting(t);
    everyoneVotes(t, target);
    const r = t.room.publicState().match!.lastResult!;
    expect(r.kind).toBe('PROTECTED');
    expect(r.playerIds).toEqual([target]);
    expect(t.room.aliveIds()).toContain(target);
    continueResults(t);
    // Round 2: the protection has worn off and can't be used again.
    expect(t.room.publicState().match!.round).toBe(2);
    expect(t.room.privateState(bg).powerActions).toEqual([]);
    toVoting(t);
    everyoneVotes(t, target);
    expect(t.room.publicState().match!.lastResult!.kind).toBe('ELIMINATED');
  });

  it('the executioner knows the word and wins when their target is voted out', () => {
    const t = makeRoom(7, { specialRoles: ['EXECUTIONER'], grinchCount: 1, votingSystem: 'ELIMINATION', finalGuessEnabled: false, allowSkipVote: true });
    startToClues(t);
    const m = t.room.match!;
    const exec = [...m.roles].find(([, r]) => r === 'EXECUTIONER')![0];
    const target = m.executionerTargetId!;
    expect(m.roles.get(target)).toBe('ELF');
    const p = t.room.privateState(exec);
    expect(p.word).toBe(m.word.word);
    expect(p.executionerTargetId).toBe(target);
    expect(t.room.privateState(target).executionerTargetId).toBeNull();
    toVoting(t);
    everyoneVotes(t, target);
    continueResults(t);
    toVoting(t);
    everyoneVotes(t, grinches(t)[0]);
    continueResults(t);
    const res = t.room.match!.results!;
    expect(res.winner).toBe('ELVES');
    expect(res.bonusWins).toEqual([{ kind: 'EXECUTIONER', playerIds: [exec] }]);
    expect(res.pointsEarned[exec]).toBe(SCORING.EXECUTIONER_WIN);
  });

  it('the drifter gets no word or hint and has one secret guess', () => {
    const t = makeRoom(7, { specialRoles: ['DRIFTER'], grinchCount: 1, votingSystem: 'ELIMINATION', finalGuessEnabled: false });
    startToClues(t);
    const m = t.room.match!;
    const drifter = [...m.roles].find(([, r]) => r === 'DRIFTER')![0];
    const p = t.room.privateState(drifter);
    expect(p.word).toBeNull();
    expect(p.hint).toBeNull();
    expect(p.teammates).toEqual([]);
    expect(p.powerActions).toEqual(['GUESS_WORD']);
    t.room.usePower(drifter, 'GUESS_WORD', null, t.room.phaseSeq, `  ${m.word.word.toUpperCase()} `);
    expect(t.room.privateState(drifter).drifterGuess?.correct).toBe(true);
    expectError(() => t.room.usePower(drifter, 'GUESS_WORD', null, t.room.phaseSeq, 'again'), 'NOT_ALLOWED');
    toVoting(t);
    everyoneVotes(t, grinches(t)[0]);
    continueResults(t);
    const res = t.room.match!.results!;
    expect(res.bonusWins).toEqual([{ kind: 'DRIFTER', playerIds: [drifter] }]);
    expect(res.pointsEarned[drifter]).toBe(SCORING.DRIFTER_WIN);
  });

  it('a wrong drifter guess wins nothing', () => {
    const t = makeRoom(7, { specialRoles: ['DRIFTER'], grinchCount: 1, finalGuessEnabled: false });
    startToClues(t);
    const drifter = [...t.room.match!.roles].find(([, r]) => r === 'DRIFTER')![0];
    t.room.usePower(drifter, 'GUESS_WORD', null, t.room.phaseSeq, 'zzzz');
    expect(t.room.privateState(drifter).drifterGuess).toEqual({ guess: 'zzzz', correct: false });
    expect(t.room.privateState(drifter).powerActions).toEqual([]);
  });

  it('twins leave together, and both surviving earns a bonus', () => {
    const t = makeRoom(8, { specialRoles: ['TWINS'], grinchCount: 1, votingSystem: 'ELIMINATION', finalGuessEnabled: false });
    startToClues(t);
    const [a, b] = t.room.match!.twinIds;
    expect(a && b).toBeTruthy();
    expect(t.room.privateState(a).twinId).toBe(b);
    expect(t.room.privateState(b).twinId).toBe(a);
    // Vote out an innocent twin whose partner is also innocent? Pick whichever twin is an Innocent.
    const innocentTwin = t.room.match!.roles.get(a) === 'ELF' ? a : b;
    const partner = innocentTwin === a ? b : a;
    toVoting(t);
    everyoneVotes(t, innocentTwin);
    const r = t.room.publicState().match!.lastResult!;
    expect(r.playerIds).toEqual([innocentTwin, partner]);
    expect(r.twinOutId).toBe(partner);
    expect(t.room.aliveIds()).not.toContain(partner);
  });

  it('twins who both make it get the bonus', () => {
    const t = makeRoom(8, { specialRoles: ['TWINS'], grinchCount: 1, votingSystem: 'ELIMINATION', finalGuessEnabled: false });
    startToClues(t);
    const twins = t.room.match!.twinIds;
    const g = grinches(t)[0];
    if (twins.includes(g)) return; // an Imposter twin would leave with the vote below
    toVoting(t);
    everyoneVotes(t, g);
    continueResults(t);
    const res = t.room.match!.results!;
    expect(res.bonusWins).toContainEqual({ kind: 'TWINS', playerIds: twins });
    for (const id of twins) expect(res.pointBreakdown[id]).toContain(`+${SCORING.TWINS_WIN} Both Twins made it to the end`);
  });

  it('powers are not dealt below 5 players', () => {
    const t = makeRoom(4, { specialRoles: ['DETECTIVE', 'SABOTEUR', 'MAYOR'] });
    startToClues(t);
    expect(t.room.match!.powers.size).toBe(0);
  });
});
