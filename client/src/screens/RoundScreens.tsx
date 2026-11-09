import { AnimatePresence, motion } from 'framer-motion';
import { Check, FastForward, Mic, Pause, Play, Plus, Vote } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Avatar, AvatarImg, TimerRing } from '../components/decor';
import { RoleCard } from '../components/RoleCard';
import { ActionBar, Button } from '../components/ui';
import { play } from '../lib/sound';
import { useFinalSecondsTick } from '../lib/hooks';
import { formatSeconds, useCountdown } from '../lib/useCountdown';
import { useRoom } from '../state/GameProvider';

function PhaseTitle({ kicker, title, sub, tone }: { kicker?: string; title: string; sub?: React.ReactNode; tone?: 'grinch' | 'elf' | 'gold' }) {
  const color = tone === 'grinch' ? 'text-grinch' : tone === 'elf' ? 'text-elf' : tone === 'gold' ? 'text-gold' : 'text-snow';
  return (
    <div className="text-center">
      {kicker && <p className="label">{kicker}</p>}
      <h1 className={`heading mt-1 text-[clamp(1.9rem,9vw,2.75rem)] ${color}`}>{title}</h1>
      {sub && <p className="mt-1.5 text-sm text-night-300">{sub}</p>}
    </div>
  );
}
export { PhaseTitle };

/** Small banner shown when a player has been eliminated and is now a spectator. */
export function EliminatedNotice() {
  const { me } = useRoom();
  if (me?.status !== 'ELIMINATED') return null;
  return (
    <p className="rounded-2xl bg-white/[0.04] px-4 py-3 text-center text-sm text-night-300">
      You're out. Keep watching, but no more clues or votes this match.
    </p>
  );
}

// ───────────────────────────── ROLE REVEAL ─────────────────────────────

export function RoleRevealScreen() {
  const { room, priv, isHost, send, playerById, session } = useRoom();
  const m = room.match!;
  const [busy, setBusy] = useState(false);
  const myId = session?.playerId ?? '';
  const acked = m.acknowledgedIds.includes(myId);
  const participants = m.participantIds.map((id) => playerById(id)!).filter(Boolean);
  const waiting = participants.filter((p) => p.status === 'ACTIVE' && p.connected && !m.acknowledgedIds.includes(p.id));

  return (
    <div className="flex flex-1 flex-col gap-5">
      <PhaseTitle
        kicker={m.practice ? "Practice round · no points" : `Match ${m.number}`}
        title="Your secret role"
        sub={
          <>
            <b className="text-grinch">
              {m.grinchCount === null ? 'A secret number of Imposters' : `${m.grinchCount} Imposter${m.grinchCount === 1 ? '' : 's'}`}
            </b>{' '}
            hiding among {participants.length} players
          </>
        }
      />
      <RoleCard priv={priv} />

      <div className="flex flex-wrap justify-center gap-1.5" aria-label="Who has seen their role">
        {participants.map((p) => {
          const ok = m.acknowledgedIds.includes(p.id);
          return (
            <span
              key={p.id}
              className={`flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-semibold ${
                ok ? 'bg-elf/15 text-elf-light' : 'bg-white/[0.05] text-night-400'
              }`}
            >
              <AvatarImg id={p.avatar} size={18} /> {p.name} {ok && <Check size={12} strokeWidth={3} />}
            </span>
          );
        })}
      </div>

      <ActionBar>
        {priv.role !== 'SPECTATOR' && !acked && (
          <Button block size="lg" variant="elf" onClick={() => void send('game:roleAcknowledged')}>
            I've seen my role
          </Button>
        )}
        {acked && !isHost && (
          <p className="py-2 text-center text-sm text-night-300">
            Got it. Waiting for {waiting.length ? waiting.map((p) => p.name).join(', ') : 'the host'}…
          </p>
        )}
        {isHost && (
          <Button
            block
            size="lg"
            variant="gold"
            icon={<Mic size={18} />}
            disabled={waiting.length > 0}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              await send('game:beginClues', { phaseSeq: room.phaseSeq });
              setBusy(false);
            }}
          >
            {waiting.length > 0 ? `Waiting for ${waiting.length} player${waiting.length === 1 ? '' : 's'}…` : 'Start the clues'}
          </Button>
        )}
      </ActionBar>
    </div>
  );
}

// ───────────────────────────── CLUE ─────────────────────────────

export function ClueScreen() {
  const { room, isHost, send, playerById, session, clockOffset } = useRoom();
  const m = room.match!;
  const current = playerById(m.currentSpeakerId);
  const next = playerById(m.nextSpeakerId);
  const isMe = !!current && current.id === session?.playerId;
  const left = useCountdown(room.deadline, clockOffset);
  useFinalSecondsTick(left);
  const lastGuesser = playerById(m.lastGuess?.playerId);

  return (
    <div className="flex flex-1 flex-col gap-5">
      {m.round > 1 && m.lastGuess && !m.lastGuess.correct && lastGuesser && (
        <p className="rounded-2xl bg-elf/10 px-4 py-2.5 text-center text-sm font-semibold text-elf-light">
          {lastGuesser.name}'s final guess was wrong. The game goes on.
        </p>
      )}
      <EliminatedNotice />

      <div className="text-center">
        <p className="label">Round {m.round}</p>
        <p className="mt-3 text-xs font-bold uppercase tracking-[0.25em] text-gold">Now speaking</p>
      </div>

      <AnimatePresence mode="wait">
        {current && (
          <motion.div
            key={current.id + m.turnIndex}
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ type: 'spring', damping: 20, stiffness: 260 }}
            className={`card flex flex-col items-center gap-3 px-4 py-6 ${isMe ? 'border-gold/50 shadow-glow-gold' : ''}`}
          >
            <motion.div animate={{ scale: [1, 1.06, 1] }} transition={{ repeat: Infinity, duration: 1.6 }}>
              <Avatar emoji={current.avatar} size={96} ring="gold" dim={!current.connected} />
            </motion.div>
            <h2 className="heading break-all text-center text-[clamp(1.8rem,9vw,2.6rem)]">{current.name}</h2>
            <p className="text-sm font-semibold text-night-300">
              Player {m.turnIndex + 1} of {m.speakingOrder.length}
              {!current.connected && <span className="text-grinch-light"> · reconnecting…</span>}
            </p>
            {isMe && (
              <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} className="mt-1 w-full rounded-2xl bg-gold/15 px-4 py-3 text-center">
                <p className="heading text-2xl text-gold">It's your turn!</p>
                <p className="mt-1 text-sm text-snow/85">Say ONE word out loud that relates to the secret word.</p>
              </motion.div>
            )}
            {left !== null && (
              <p className={`font-display text-2xl tabular-nums ${left <= 5000 ? 'text-grinch' : 'text-snow'}`} role="timer">
                {formatSeconds(left)}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {next && (
        <p className="text-center text-sm text-night-300">
          Up next: <b className="inline-flex items-center gap-1 text-snow"><AvatarImg id={next.avatar} size={20} /> {next.name}</b>
        </p>
      )}

      <ol className="flex flex-wrap justify-center gap-1.5" aria-label="Speaking order">
        {m.speakingOrder.map((id, i) => {
          const p = playerById(id);
          if (!p) return null;
          const done = m.spokenIds.includes(id) || (i < m.turnIndex && p.status !== 'ACTIVE');
          const active = i === m.turnIndex;
          const gone = p.status !== 'ACTIVE';
          return (
            <li
              key={id}
              className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-bold ${
                active
                  ? 'bg-gold text-night-950'
                  : done
                    ? 'bg-elf/10 text-elf-light'
                    : gone
                      ? 'bg-white/[0.03] text-night-500 line-through'
                      : 'bg-white/[0.05] text-night-300'
              }`}
            >
              <span className="opacity-60">{i + 1}</span> <AvatarImg id={p.avatar} size={18} /> {p.name}
              {done && <Check size={12} strokeWidth={3} />}
            </li>
          );
        })}
      </ol>

      <ActionBar>
        {isMe && (
          <Button block size="lg" variant="gold" icon={<Check size={20} />} onClick={() => void send('game:advanceTurn', { turnIndex: m.turnIndex })}>
            Done speaking
          </Button>
        )}
        {isHost && !isMe && current && (
          <Button block variant="outline" icon={<FastForward size={18} />} onClick={() => void send('game:advanceTurn', { turnIndex: m.turnIndex })}>
            Skip {current.name}'s turn
          </Button>
        )}
        {!isMe && !isHost && <p className="py-2 text-center text-sm text-night-300">Listen closely.</p>}
      </ActionBar>
    </div>
  );
}

// ───────────────────────────── DISCUSSION ─────────────────────────────

export function DiscussionScreen() {
  const { room, isHost, send, clockOffset, session } = useRoom();
  const m = room.match!;
  const left = useCountdown(room.deadline, clockOffset, room.pausedRemainingMs);
  const paused = room.pausedRemainingMs !== null;
  const hasTimer = left !== null;
  const total = Math.max(room.settings.discussionSeconds * 1000, left ?? 0, 1);
  const alive = room.players.filter((p) => m.participantIds.includes(p.id) && p.status === 'ACTIVE');
  const out = room.players.filter((p) => m.participantIds.includes(p.id) && p.status !== 'ACTIVE');
  const lastTick = useRef<number | null>(null);

  // Tick sound for the final five seconds.
  useEffect(() => {
    if (left === null || paused) return;
    const s = Math.ceil(left / 1000);
    if (s <= 5 && s > 0 && lastTick.current !== s) {
      lastTick.current = s;
      play('tick');
    }
  }, [left, paused]);

  return (
    <div className="flex flex-1 flex-col gap-5">
      <EliminatedNotice />
      <PhaseTitle kicker={`Round ${m.round}`} title="Discuss!" sub="Who's the Imposter? Talk it out." tone="gold" />

      <div className="flex justify-center">
        {hasTimer ? (
          left === 0 && !paused ? (
            <p className="heading py-6 text-3xl text-grinch">Time's up!</p>
          ) : (
            <TimerRing msLeft={left} totalMs={total} size={136} label={formatSeconds(left)} paused={paused} />
          )
        ) : (
          <p className="rounded-2xl bg-white/[0.04] px-4 py-3 text-sm text-night-300">No timer. The host starts the vote.</p>
        )}
      </div>

      <section>
        <p className="label mb-2 text-center">Still in the game ({alive.length})</p>
        <ul className="grid grid-cols-2 gap-2 min-[420px]:grid-cols-3">
          {alive.map((p) => (
            <li key={p.id} className="flex min-w-0 items-center gap-2 rounded-2xl bg-white/[0.04] px-2.5 py-2">
              <Avatar emoji={p.avatar} size={34} dim={!p.connected} />
              <span className="truncate text-sm font-bold">
                {p.name}
                {p.id === session?.playerId && <span className="text-night-400"> (you)</span>}
              </span>
            </li>
          ))}
        </ul>
        {out.length > 0 && (
          <p className="mt-3 text-center text-xs text-night-400">
            Out: {out.map((p) => `${p.name} (${p.revealedRole === 'GRINCH' ? 'Imposter' : p.revealedRole === 'ELF' ? 'Innocent' : 'left'})`).join(', ')}
          </p>
        )}
      </section>

      <ActionBar>
        {isHost ? (
          <>
            {hasTimer && (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  icon={paused ? <Play size={17} /> : <Pause size={17} />}
                  onClick={() => void send('game:discussionControl', { action: paused ? 'resume' : 'pause', phaseSeq: room.phaseSeq })}
                  disabled={!paused && left === 0}
                >
                  {paused ? 'Resume' : 'Pause'}
                </Button>
                <Button variant="outline" icon={<Plus size={17} />} onClick={() => void send('game:discussionControl', { action: 'extend', phaseSeq: room.phaseSeq })}>
                  30 sec
                </Button>
              </div>
            )}
            <Button block size="lg" variant="grinch" icon={<Vote size={19} />} onClick={() => void send('game:startVoting', { phaseSeq: room.phaseSeq })}>
              Start voting now
            </Button>
          </>
        ) : (
          <p className="py-2 text-center text-sm text-night-300">
            {hasTimer && room.settings.autoAdvance ? 'Voting starts when the timer ends.' : 'The host will start the vote.'}
          </p>
        )}
      </ActionBar>
    </div>
  );
}
