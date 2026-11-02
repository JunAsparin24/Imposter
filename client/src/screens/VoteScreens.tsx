import { AnimatePresence, motion } from 'framer-motion';
import { Check, Lock, SkipForward } from 'lucide-react';
import { useEffect, useState } from 'react';
import { TIMING, type PublicPlayer, type VoteResult } from '@imposter/shared';
import { Avatar, TimerRing } from '../components/decor';
import { ActionBar, Button, ConfirmButton } from '../components/ui';
import { play, vibrate } from '../lib/sound';
import { formatSeconds, useCountdown } from '../lib/useCountdown';
import { useRoom } from '../state/GameProvider';
import { EliminatedNotice, PhaseTitle } from './RoundScreens';

// ───────────────────────────── VOTING ─────────────────────────────

export function VotingScreen() {
  const { room } = useRoom();
  // Keyed by vote id so a revote starts with a fresh, empty selection.
  return <VotingBallot key={room.match!.vote!.id} />;
}

function VotingBallot() {
  const { room, priv, isHost, send, playerById, session, clockOffset } = useRoom();
  const m = room.match!;
  const v = m.vote!;
  const myId = session?.playerId ?? '';
  const eligible = v.eligibleIds.includes(myId);
  const submitted = priv.submittedBallot;
  const need = Math.min(v.slots, v.candidateIds.filter((c) => c !== myId).length);
  const [picks, setPicks] = useState<string[]>([]);
  const [skip, setSkip] = useState(false);
  const [busy, setBusy] = useState(false);
  const left = useCountdown(room.deadline, clockOffset);
  const candidates = v.candidateIds.map((id) => playerById(id)!).filter(Boolean);
  const progress = v.eligibleIds.length ? v.submittedIds.length / v.eligibleIds.length : 0;

  const toggle = (id: string) => {
    if (id === myId) return;
    setSkip(false);
    setPicks((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (need <= 1) return [id];
      return cur.length < need ? [...cur, id] : [...cur.slice(1), id];
    });
  };

  const submit = async () => {
    setBusy(true);
    const res = await send('game:submitVote', { voteId: v.id, picks: skip ? [] : picks, skip });
    setBusy(false);
    if (res.ok) {
      play('vote');
      vibrate(30);
    }
  };

  const ready = skip || picks.length === need;
  const names = (ids: string[]) => ids.map((id) => playerById(id)?.name ?? '?').join(', ');

  return (
    <div className="flex flex-1 flex-col gap-4">
      <EliminatedNotice />
      <PhaseTitle
        kicker={`Round ${m.round}`}
        title={v.isRevote ? 'Revote!' : 'Voting'}
        tone="grinch"
        sub={
          v.isRevote
            ? 'It was a tie. Vote again — tied players only.'
            : need > 1
              ? `Pick ${need} players you think are Grinches.`
              : 'Who do you think is a Grinch?'
        }
      />

      <div className="card px-4 py-3">
        <div className="flex items-center justify-between text-sm font-bold">
          <span>
            {v.submittedIds.length} / {v.eligibleIds.length} votes submitted
          </span>
          {left !== null && <span className={`tabular-nums ${left <= 10_000 ? 'text-grinch' : 'text-night-300'}`}>{formatSeconds(left)}</span>}
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.06]">
          <motion.div className="h-full rounded-full bg-grinch" animate={{ width: `${progress * 100}%` }} />
        </div>
      </div>

      {v.lockedInIds.length > 0 && (
        <p className="text-center text-sm text-night-300">
          Already accused: <b className="text-snow">{names(v.lockedInIds)}</b>
        </p>
      )}

      {eligible && !submitted && (
        <>
          <ul className="grid grid-cols-2 gap-2.5">
            {candidates.map((p) => {
              const self = p.id === myId;
              const on = picks.includes(p.id);
              return (
                <li key={p.id}>
                  <motion.button
                    whileTap={self ? undefined : { scale: 0.95 }}
                    disabled={self}
                    onClick={() => toggle(p.id)}
                    aria-pressed={on}
                    className={`relative flex w-full flex-col items-center gap-2 rounded-2xl border-2 px-2 py-4 transition-colors ${
                      on
                        ? 'border-grinch bg-grinch/15 shadow-glow-red'
                        : self
                          ? 'border-transparent bg-white/[0.02] opacity-40'
                          : 'border-white/[0.06] bg-white/[0.04] hover:border-white/20'
                    }`}
                  >
                    {on && (
                      <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-grinch text-white">
                        <Check size={14} strokeWidth={3} />
                      </span>
                    )}
                    <Avatar emoji={p.avatar} size={52} dim={!p.connected} />
                    <span className="w-full truncate px-1 text-center text-sm font-bold">{self ? `${p.name} (you)` : p.name}</span>
                  </motion.button>
                </li>
              );
            })}
          </ul>
          {v.allowSkip && (
            <button
              onClick={() => {
                setSkip((s) => !s);
                setPicks([]);
              }}
              aria-pressed={skip}
              className={`flex h-14 items-center justify-center gap-2 rounded-2xl border-2 text-sm font-bold ${
                skip ? 'border-snow bg-white/10' : 'border-white/[0.06] bg-white/[0.03] text-night-300'
              }`}
            >
              <SkipForward size={17} /> Skip vote (not sure yet)
            </button>
          )}
        </>
      )}

      {submitted && (
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="card flex flex-col items-center gap-2 p-6 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-elf/15 text-elf">
            <Lock size={26} />
          </span>
          <p className="heading text-xl">Vote locked in</p>
          <p className="text-sm text-night-300">
            {submitted.skip ? 'You skipped.' : <>You voted for <b className="text-snow">{names(submitted.picks)}</b>.</>}
          </p>
          <p className="text-xs text-night-400">Waiting for everyone else… votes stay secret.</p>
        </motion.div>
      )}

      {!eligible && (
        <p className="card p-5 text-center text-sm text-night-300">
          You're watching this vote. Nobody can see who voted for whom until it's over.
        </p>
      )}

      <ActionBar>
        {eligible && !submitted && (
          <Button block size="lg" variant="grinch" disabled={!ready} loading={busy} onClick={submit}>
            {skip ? 'Lock in: skip' : ready ? `Lock in vote: ${names(picks)}` : need > 1 ? `Pick ${need - picks.length} more` : 'Pick a player'}
          </Button>
        )}
        {isHost && (
          <ConfirmButton
            block
            variant="ghost"
            onConfirm={() => void send('game:closeVoting', { phaseSeq: room.phaseSeq })}
            confirmLabel="Tap again — missing votes won't count"
          >
            End voting now
          </ConfirmButton>
        )}
      </ActionBar>
    </div>
  );
}

// ───────────────────────────── VOTE RESULTS ─────────────────────────────

export function VoteResultsScreen() {
  const { room, isHost, send, playerById, clockOffset } = useRoom();
  const m = room.match!;
  const r = m.lastResult!;
  const [revealed, setRevealed] = useState(false);
  const left = useCountdown(room.deadline, clockOffset);

  useEffect(() => {
    play('drumroll');
    const t = setTimeout(() => {
      setRevealed(true);
      const roles = Object.values(r.roles);
      if (roles.includes('GRINCH')) play('grinch');
      else if (roles.includes('ELF')) play('elf');
    }, 1600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pendingFinalGuess =
    r.kind === 'ELIMINATED' && r.roles[r.playerIds[0]] === 'GRINCH' && m.finalGuessEnabled;
  const continueLabel =
    r.kind === 'TIE' ? 'Start the revote' : pendingFinalGuess ? 'Final guess' : 'Continue';

  return (
    <div className="flex flex-1 flex-col gap-5">
      <PhaseTitle kicker={r.isRevote ? 'Revote result' : `Round ${m.round} vote`} title="The group has decided…" />
      <div className="flex min-h-[260px] items-center justify-center">
        <AnimatePresence mode="wait">
          {!revealed ? (
            <motion.div key="wait" exit={{ opacity: 0, scale: 0.8 }} className="flex gap-2" aria-label="Revealing">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="h-4 w-4 rounded-full bg-gold"
                  animate={{ y: [0, -14, 0], opacity: [0.4, 1, 0.4] }}
                  transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.15 }}
                />
              ))}
            </motion.div>
          ) : (
            <motion.div
              key="result"
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', damping: 14, stiffness: 180 }}
              className="w-full"
            >
              <ResultBody result={r} playerById={playerById} pendingFinalGuess={pendingFinalGuess} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {revealed && r.tally.some((t) => t.votes > 0) && (
        <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="card p-4">
          <p className="label mb-3">Vote count</p>
          <ul className="space-y-2">
            {r.tally
              .filter((t) => t.votes > 0)
              .map((t) => {
                const p = playerById(t.targetId);
                const max = Math.max(...r.tally.map((x) => x.votes), 1);
                return (
                  <li key={t.targetId} className="flex items-center gap-3 text-sm">
                    <span className="w-24 shrink-0 truncate font-semibold">{t.targetId === 'SKIP' ? '⏭️ Skip' : `${p?.avatar} ${p?.name}`}</span>
                    <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                      <motion.span
                        className="block h-full rounded-full bg-gold"
                        initial={{ width: 0 }}
                        animate={{ width: `${(t.votes / max) * 100}%` }}
                        transition={{ duration: 0.6, delay: 0.5 }}
                      />
                    </span>
                    <span className="w-6 text-right font-display tabular-nums">{t.votes}</span>
                  </li>
                );
              })}
          </ul>
        </motion.section>
      )}

      <ActionBar>
        {isHost ? (
          <Button block size="lg" variant="gold" disabled={!revealed} onClick={() => void send('game:continue', { phaseSeq: room.phaseSeq })}>
            {continueLabel}
            {left !== null && revealed ? ` (${formatSeconds(left)})` : ''}
          </Button>
        ) : (
          <p className="py-2 text-center text-sm text-night-300">
            {left !== null ? `Continuing in ${formatSeconds(left)}…` : 'Waiting for the host…'}
          </p>
        )}
      </ActionBar>
    </div>
  );
}

function ResultBody({
  result: r,
  playerById,
  pendingFinalGuess,
}: {
  result: VoteResult;
  playerById: (id: string) => PublicPlayer | undefined;
  pendingFinalGuess: boolean;
}) {
  if (r.kind === 'ELIMINATED' || r.kind === 'ACCUSED') {
    return (
      <div className="space-y-4">
        {r.playerIds.map((id) => {
          const p = playerById(id);
          const grinch = r.roles[id] === 'GRINCH';
          return (
            <div
              key={id}
              className={`flex flex-col items-center gap-2 rounded-[28px] border-2 px-4 py-6 text-center ${
                grinch ? 'border-grinch/60 bg-grinch/10 shadow-glow-red' : 'border-elf/60 bg-elf/10 shadow-glow-green'
              }`}
            >
              <Avatar emoji={p?.avatar ?? '❓'} size={80} ring={grinch ? 'grinch' : 'elf'} />
              <h2 className="heading break-all text-[clamp(1.8rem,9vw,2.6rem)]">{p?.name ?? 'Someone'}</h2>
              <p className={`heading text-[clamp(1.3rem,6.5vw,1.9rem)] ${grinch ? 'text-grinch' : 'text-elf'}`}>
                {grinch ? 'was a Grinch! 😈' : 'was an Elf! 🧝'}
              </p>
            </div>
          );
        })}
        {pendingFinalGuess && <p className="text-center text-sm font-semibold text-gold">…but they get one last chance to guess the word!</p>}
      </div>
    );
  }
  const names = r.playerIds.map((id) => playerById(id)?.name ?? '?').join(' vs ');
  const copy: Record<string, { title: string; sub: string }> = {
    TIE: { title: "It's a tie!", sub: `${names} — time for a revote.` },
    NO_DECISION: { title: 'Tied again!', sub: 'Nobody is eliminated. On to the next round of clues.' },
    SKIPPED: { title: 'Skipped!', sub: 'The group chose to skip. Nobody is eliminated.' },
    NO_VOTES: { title: 'No votes', sub: 'Nobody voted, so nobody is eliminated.' },
  };
  const c = copy[r.kind];
  return (
    <div className="card px-4 py-8 text-center">
      <h2 className="heading text-4xl text-gold">{c.title}</h2>
      <p className="mt-2 text-night-300">{c.sub}</p>
    </div>
  );
}

// ───────────────────────────── FINAL GUESS ─────────────────────────────

export function FinalGuessScreen() {
  const { room, priv, send, playerById, clockOffset } = useRoom();
  const m = room.match!;
  const fg = m.finalGuess!;
  const left = useCountdown(room.deadline, clockOffset);
  const [guess, setGuess] = useState('');
  const [busy, setBusy] = useState(false);
  const guessers = fg.guesserIds.map((id) => playerById(id)?.name ?? '?').join(' & ');

  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="flex justify-center pt-2">
        {left !== null && <TimerRing msLeft={left} totalMs={TIMING.FINAL_GUESS_MS} size={104} label={formatSeconds(left)} />}
      </div>
      {priv.canGuess ? (
        <form
          className="flex flex-1 flex-col gap-5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!guess.trim()) return;
            setBusy(true);
            await send('game:submitGuess', { guess });
            setBusy(false);
          }}
        >
          <PhaseTitle kicker="You've been caught" title="One last chance" tone="grinch" sub="What was the secret word?" />
          <input
            value={guess}
            onChange={(e) => setGuess(e.target.value.slice(0, 60))}
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Type your guess…"
            className="h-16 w-full rounded-2xl border-2 border-grinch/50 bg-night-800 px-4 text-center text-2xl font-bold placeholder:text-night-500 focus:border-grinch focus:outline-none"
            aria-label="Your guess for the secret word"
          />
          <p className="text-center text-xs text-night-400">One guess only. Capitalisation doesn't matter.</p>
          <ActionBar>
            <Button type="submit" block size="lg" variant="grinch" loading={busy} disabled={!guess.trim()}>
              Submit final guess
            </Button>
          </ActionBar>
        </form>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <PhaseTitle
            kicker="Final guess"
            title={priv.guessSubmitted ? 'Guess submitted' : 'One last chance…'}
            tone="grinch"
            sub={priv.guessSubmitted ? 'Fingers crossed… 🤞' : `${guessers} is trying to guess the secret word!`}
          />
          <motion.span className="text-6xl" animate={{ rotate: [0, -8, 8, 0] }} transition={{ repeat: Infinity, duration: 1.4 }} aria-hidden>
            😈
          </motion.span>
          <p className="text-sm text-night-300">If they get it right, the Grinches steal Christmas.</p>
        </div>
      )}
    </div>
  );
}
