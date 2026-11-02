import { motion } from 'framer-motion';
import { History, Home, Play, RotateCcw, Settings2, Trophy } from 'lucide-react';
import { useState } from 'react';
import type { MatchResults, WinReason } from '@imposter/shared';
import { Avatar, Confetti } from '../components/decor';
import { SettingsSheet } from '../components/SettingsSheet';
import { ActionBar, Button, ConfirmButton, SectionTitle } from '../components/ui';
import { useRoom } from '../state/GameProvider';

const REASONS: Record<WinReason, string> = {
  GRINCHES_CAUGHT: 'Every Grinch was caught. Christmas is saved! 🎄',
  GRINCHES_OUTNUMBER: 'The Grinches now equal the Elves. Christmas is ruined! 😈',
  FINAL_GUESS: 'A caught Grinch guessed the secret word and stole Christmas! 🎯',
  INNOCENT_ACCUSED: 'The group accused an innocent Elf. The Grinches got away! 😈',
  GRINCHES_LEFT: 'The Grinches fled the party. The Elves win! 🏃',
};

// ───────────────────────────── ROUND RESULTS ─────────────────────────────

export function RoundResultsScreen() {
  const { room, isHost, send, session, playerById } = useRoom();
  const res = room.match!.results!;
  const myResult = res.players.find((p) => p.id === session?.playerId);
  const elvesWon = res.winner === 'ELVES';
  const iWon = myResult ? (myResult.role === 'ELF') === elvesWon : true;
  const grinches = res.players.filter((p) => p.role === 'GRINCH');
  const elves = res.players.filter((p) => p.role === 'ELF');
  const earned = res.players
    .map((p) => ({ ...p, pts: res.pointsEarned[p.id] ?? 0, why: res.pointBreakdown[p.id] ?? [] }))
    .sort((a, b) => b.pts - a.pts);
  const nameOf = (id: string) => res.players.find((p) => p.id === id)?.name ?? playerById(id)?.name ?? '?';

  return (
    <div className="flex flex-1 flex-col gap-5">
      {iWon && <Confetti />}
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 12, stiffness: 160 }}
        className={`rounded-[28px] border-2 px-4 py-6 text-center ${
          elvesWon ? 'border-elf/60 bg-elf/10 shadow-glow-green' : 'border-grinch/60 bg-grinch/10 shadow-glow-red'
        }`}
      >
        <p className="text-5xl" aria-hidden>
          {elvesWon ? '🧝🎄' : '😈🎁'}
        </p>
        <h1 className={`heading mt-2 text-[clamp(2rem,10vw,3rem)] ${elvesWon ? 'text-elf' : 'text-grinch'}`}>
          {elvesWon ? 'The Elves win!' : 'The Grinches win!'}
        </h1>
        <p className="mt-2 text-sm text-snow/85">{REASONS[res.reason]}</p>
        {myResult && (
          <p className={`mt-3 text-sm font-bold ${iWon ? 'text-gold' : 'text-night-300'}`}>
            {iWon ? 'Your team won!' : 'Your team lost this one.'}
          </p>
        )}
      </motion.div>

      <div className="card p-5 text-center">
        <p className="label">The secret word was</p>
        <p className="heading mt-2 break-words text-[clamp(1.8rem,9vw,2.6rem)] text-gold">{res.word}</p>
        <p className="mt-1 text-xs text-night-300">{res.categoryName}</p>
      </div>

      <div className="grid gap-3 min-[460px]:grid-cols-2">
        <RoleList title={`Grinch${grinches.length === 1 ? '' : 'es'}`} tone="grinch" players={grinches} />
        <RoleList title="Elves" tone="elf" players={elves} />
      </div>

      <section className="card p-4">
        <SectionTitle>Points this match</SectionTitle>
        <ul className="space-y-2">
          {earned.map((p) => (
            <li key={p.id} className="flex items-start gap-3">
              <Avatar emoji={p.avatar} size={34} ring={p.role === 'GRINCH' ? 'grinch' : null} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{p.name}</p>
                {p.why.length > 0 && <p className="text-xs text-night-300">{p.why.join(' · ')}</p>}
              </div>
              <span className={`font-display text-lg ${p.pts > 0 ? 'text-gold' : 'text-night-500'}`}>+{p.pts}</span>
            </li>
          ))}
        </ul>
      </section>

      <VoteSummary res={res} nameOf={nameOf} />

      <ActionBar>
        {isHost ? (
          <Button block size="lg" variant="gold" icon={<Trophy size={19} />} onClick={() => void send('game:continue', { phaseSeq: room.phaseSeq })}>
            See the scoreboard
          </Button>
        ) : (
          <p className="py-2 text-center text-sm text-night-300">Waiting for the host…</p>
        )}
      </ActionBar>
    </div>
  );
}

function RoleList({ title, tone, players }: { title: string; tone: 'grinch' | 'elf'; players: MatchResults['players'] }) {
  return (
    <section className={`rounded-3xl border p-4 ${tone === 'grinch' ? 'border-grinch/30 bg-grinch/[0.06]' : 'border-elf/30 bg-elf/[0.06]'}`}>
      <p className={`heading mb-2 text-lg ${tone === 'grinch' ? 'text-grinch' : 'text-elf'}`}>
        {tone === 'grinch' ? '😈' : '🧝'} {title}
      </p>
      <ul className="space-y-1.5">
        {players.map((p) => (
          <li key={p.id} className="flex items-center gap-2 text-sm">
            <span aria-hidden>{p.avatar}</span>
            <span className={`truncate font-semibold ${p.eliminated || p.left ? 'text-night-400' : ''}`}>{p.name}</span>
            {p.eliminated && <span className="text-xs text-night-400">· voted out</span>}
            {p.left && <span className="text-xs text-night-400">· left</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function VoteSummary({ res, nameOf }: { res: MatchResults; nameOf: (id: string) => string }) {
  if (res.votes.length === 0 && res.guesses.length === 0) return null;
  const outcome = (kind: string, ids: string[]) =>
    kind === 'ELIMINATED' || kind === 'ACCUSED'
      ? `${ids.map(nameOf).join(', ')} voted out`
      : kind === 'TIE'
        ? 'Tie → revote'
        : kind === 'SKIPPED'
          ? 'Skipped'
          : kind === 'NO_DECISION'
            ? 'Tied again — nobody out'
            : 'No votes';
  return (
    <details className="card group p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
        <span className="label">Voting summary</span>
        <span className="text-xs text-night-400 group-open:hidden">Tap to show</span>
      </summary>
      <div className="mt-3 space-y-3">
        {res.votes.map((v, i) => (
          <div key={i} className="rounded-2xl bg-white/[0.03] p-3 text-sm">
            <p className="font-bold">
              Round {v.round} {v.isRevote ? 'revote' : 'vote'} — <span className="text-gold">{outcome(v.kind, v.playerIds)}</span>
            </p>
            <ul className="mt-1.5 space-y-0.5 text-xs text-night-300">
              {v.ballots.map((b) => (
                <li key={b.voterId}>
                  {nameOf(b.voterId)} → {b.skip ? 'Skip' : b.picks.map(nameOf).join(', ')}
                </li>
              ))}
            </ul>
          </div>
        ))}
        {res.guesses.map((g, i) => (
          <p key={i} className="rounded-2xl bg-white/[0.03] p-3 text-sm">
            🎯 {nameOf(g.playerId)} guessed “{g.guess || '—'}” —{' '}
            <b className={g.correct ? 'text-grinch' : 'text-elf'}>{g.correct ? 'correct!' : 'wrong'}</b>
          </p>
        ))}
      </div>
    </details>
  );
}

// ───────────────────────────── SCOREBOARD ─────────────────────────────

export function ScoreboardScreen() {
  const { room, isHost, send, session } = useRoom();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const players = room.players.filter((p) => p.status !== 'LEFT').sort((a, b) => b.score - a.score);
  const total = room.settings.totalMatches;
  const medals = ['🥇', '🥈', '🥉'];
  // Shared ranks for tied scores (1, 2, 2, 4).
  const rankOf = (score: number) => players.findIndex((p) => p.score === score) + 1;
  const leader = players[0];

  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="text-center">
        <p className="label">{total ? `Match ${room.matchesPlayed} of ${total}` : `${room.matchesPlayed} match${room.matchesPlayed === 1 ? '' : 'es'} played`}</p>
        <h1 className="heading mt-1 text-[clamp(2rem,10vw,2.75rem)] text-gold">Scoreboard</h1>
        {room.seriesComplete && leader && (
          <p className="mt-2 text-sm font-bold text-snow">
            🏆 Series complete! {leader.avatar} {leader.name} wins with {leader.score} points!
          </p>
        )}
      </div>

      <ol className="space-y-2">
        {players.map((p, i) => {
          const rank = rankOf(p.score);
          const mine = p.id === session?.playerId;
          return (
            <motion.li
              key={p.id}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ${mine ? 'bg-gold/10 ring-1 ring-gold/40' : 'bg-white/[0.04]'}`}
            >
              <span className="w-8 text-center font-display text-lg">{medals[rank - 1] ?? rank}</span>
              <Avatar emoji={p.avatar} size={40} dim={!p.connected} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">
                  {p.name}
                  {mine && <span className="text-xs font-semibold text-night-400"> (you)</span>}
                </p>
                <p className="text-xs text-night-300">
                  {p.stats.wins}/{p.stats.matchesPlayed} wins · {p.stats.grinchMatches}× Grinch · {p.stats.correctVotes} good votes
                </p>
              </div>
              <span className="font-display text-xl tabular-nums text-gold">{p.score}</span>
            </motion.li>
          );
        })}
      </ol>

      {room.history.length > 0 && (
        <section className="card p-4">
          <SectionTitle right={<History size={15} className="text-night-400" />}>Previous matches</SectionTitle>
          <ul className="space-y-2 text-sm">
            {room.history.slice(0, 10).map((h) => (
              <li key={h.matchNumber + '-' + h.endedAt} className="flex items-center gap-2">
                <span className="w-7 shrink-0 text-xs font-bold text-night-400">#{h.matchNumber}</span>
                <span className="min-w-0 flex-1 truncate">
                  <b>{h.word}</b> <span className="text-night-400">· Grinch: {h.grinchNames.join(', ')}</span>
                </span>
                <span className={`shrink-0 text-xs font-bold ${h.winner === 'ELVES' ? 'text-elf' : 'text-grinch'}`}>
                  {h.winner === 'ELVES' ? 'Elves' : 'Grinches'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ActionBar>
        {isHost ? (
          <>
            <Button
              block
              size="lg"
              variant="grinch"
              icon={<Play size={19} />}
              loading={busy}
              onClick={async () => {
                setBusy(true);
                await send('game:nextMatch');
                setBusy(false);
              }}
            >
              {room.seriesComplete ? 'Start a new series' : 'Play again'}
            </Button>
            <div className="grid grid-cols-3 gap-2">
              <Button size="sm" variant="outline" icon={<Settings2 size={15} />} onClick={() => setSettingsOpen(true)}>
                Settings
              </Button>
              <Button size="sm" variant="outline" icon={<Home size={15} />} onClick={() => void send('game:returnToLobby')}>
                Lobby
              </Button>
              <ConfirmButton size="sm" variant="outline" icon={<RotateCcw size={15} />} confirmLabel="Sure?" onConfirm={() => void send('game:resetScores')}>
                Reset
              </ConfirmButton>
            </div>
          </>
        ) : (
          <p className="py-2 text-center text-sm text-night-300">Waiting for the host to start the next match…</p>
        )}
      </ActionBar>
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
