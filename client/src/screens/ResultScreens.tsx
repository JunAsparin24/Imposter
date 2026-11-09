import { motion } from 'framer-motion';
import { History, Home, Play, RotateCcw, Settings2, Trophy } from 'lucide-react';
import { useState } from 'react';
import type { MatchResults, PlayerStats, PublicPlayer, WinReason } from '@imposter/shared';
import { Avatar, AvatarImg, Confetti, CountUp } from '../components/decor';
import { SettingsSheet } from '../components/SettingsSheet';
import { ActionBar, Button, ConfirmButton, SectionTitle, Sheet } from '../components/ui';
import { useRoom } from '../state/GameProvider';

const REASONS: Record<WinReason, string> = {
  GRINCHES_CAUGHT: 'Every Imposter got caught.',
  GRINCHES_OUTNUMBER: 'There are as many Imposters left as Innocents.',
  FINAL_GUESS: 'The caught Imposter guessed the secret word.',
  INNOCENT_ACCUSED: 'The group voted out an Innocent. The Imposters got away.',
  GRINCHES_LEFT: 'The Imposters left the game.',
  NO_IMPOSTERS: 'There were no Imposters this time, and you trusted each other. Nice.',
  PARANOIA: 'There were no Imposters this time... and you voted someone out anyway.',
};

// ───────────────────────────── ROUND RESULTS ─────────────────────────────

export function RoundResultsScreen() {
  const { room, isHost, send, session, playerById } = useRoom();
  const res = room.match!.results!;
  const myResult = res.players.find((p) => p.id === session?.playerId);
  const elvesWon = res.winner === 'ELVES';
  const nobody = res.winner === 'NONE';
  const iWon = nobody ? false : myResult ? (myResult.role === 'ELF') === elvesWon : true;
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
          nobody
            ? 'border-white/20 bg-white/[0.04]'
            : elvesWon
              ? 'border-elf/60 bg-elf/10 shadow-glow-green'
              : 'border-grinch/60 bg-grinch/10 shadow-glow-red'
        }`}
      >
        <h1 className={`heading mt-2 text-[clamp(2rem,10vw,3rem)] ${nobody ? 'text-gold' : elvesWon ? 'text-elf' : 'text-grinch'}`}>
          {nobody ? 'Paranoia! Nobody wins' : elvesWon ? 'The Innocents win!' : 'The Imposters win!'}
        </h1>
        <p className="mt-2 text-sm text-snow/85">{REASONS[res.reason]}</p>
        {res.practice && <p className="mt-2 text-xs font-bold uppercase tracking-widest text-gold">Practice round · no points</p>}
        {myResult && (
          <p className={`mt-3 text-sm font-bold ${iWon ? 'text-gold' : 'text-night-300'}`}>
            {nobody ? 'Everyone loses this one.' : iWon ? 'Your team won!' : 'Your team lost this one.'}
          </p>
        )}
      </motion.div>

      <div className="card p-5 text-center">
        <p className="label">{res.imposterWord ? "The Innocents' word was" : 'The secret word was'}</p>
        <p className="heading mt-2 break-words text-[clamp(1.8rem,9vw,2.6rem)] text-gold">{res.word}</p>
        {res.imposterWord && (
          <>
            <p className="label mt-4">The Imposters' word was</p>
            <p className="heading mt-2 break-words text-[clamp(1.5rem,7vw,2.1rem)] text-grinch">{res.imposterWord}</p>
          </>
        )}
        <p className="mt-2 text-xs text-night-300">{res.categoryName}</p>
      </div>

      <div className="grid gap-3 min-[460px]:grid-cols-2">
        <RoleList title={`Imposter${grinches.length === 1 ? '' : 's'}`} tone="grinch" players={grinches} />
        <RoleList title="Innocents" tone="elf" players={elves} />
      </div>

      {!res.practice && <section className="card p-4">
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
      </section>}

      <VoteSummary res={res} nameOf={nameOf} />

      <ActionBar>
        {isHost ? (
          <Button block size="lg" variant="gold" icon={<Trophy size={19} />} onClick={() => void send('game:continue', { phaseSeq: room.phaseSeq })}>
            {res.practice ? "Back to the lobby" : "See the scoreboard"}
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
        {title}
      </p>
      {players.length === 0 && <p className="text-sm text-night-300">Nobody!</p>}
      <ul className="space-y-1.5">
        {players.map((p) => (
          <li key={p.id} className="flex items-center gap-2 text-sm">
            <AvatarImg id={p.avatar} size={20} />
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
            ? 'Tied again, nobody out'
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
              Round {v.round} {v.isRevote ? 'revote' : 'vote'}: <span className="text-gold">{outcome(v.kind, v.playerIds)}</span>
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
            {nameOf(g.playerId)}'s final guess was{' '}
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
  // Shared ranks for tied scores (1, 2, 2, 4).
  const rankOf = (score: number) => players.findIndex((p) => p.score === score) + 1;
  const leader = players[0];
  const [statsFor, setStatsFor] = useState<string | null>(null);

  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="text-center">
        <p className="label">{total ? `Match ${room.matchesPlayed} of ${total}` : `${room.matchesPlayed} match${room.matchesPlayed === 1 ? '' : 'es'} played`}</p>
        <h1 className="heading mt-1 text-[clamp(2rem,10vw,2.75rem)] text-gold">Scoreboard</h1>
        {room.seriesComplete && leader && (
          <p className="mt-2 text-sm font-bold text-snow">
            Series complete! <AvatarImg id={leader.avatar} size={20} /> {leader.name} wins with {leader.score} points!
          </p>
        )}
      </div>

      <ol className="space-y-2">
        {players.map((p, i) => {
          const rank = rankOf(p.score);
          const mine = p.id === session?.playerId;
          return (
            <motion.li key={p.id} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
              <button
                onClick={() => setStatsFor(p.id)}
                aria-label={`${p.name}: ${p.score} points. Show stats.`}
                className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-white/[0.07] ${
                  mine ? 'bg-gold/10 ring-1 ring-gold/40' : 'bg-white/[0.04]'
                }`}
              >
              <span
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-full font-display text-sm ${
                  rank === 1 ? 'bg-gold text-night-950' : rank === 2 ? 'bg-night-300 text-night-950' : rank === 3 ? 'bg-[#c27c4a] text-night-950' : 'bg-white/[0.06] text-night-300'
                }`}
              >
                {rank}
              </span>
              <Avatar emoji={p.avatar} size={40} dim={!p.connected} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">
                  {p.name}
                  {mine && <span className="text-xs font-semibold text-night-400"> (you)</span>}
                </p>
                <p className="text-xs text-night-300">
                  {p.stats.wins}/{p.stats.matchesPlayed} wins · {p.stats.grinchMatches}× Imposter · {p.stats.correctVotes} good votes
                </p>
              </div>
              <span className="font-display text-xl tabular-nums text-gold"><CountUp from={Math.max(0, p.score - (room.history[0]?.pointsEarned[p.id] ?? 0))} to={p.score} delay={0.3 + i * 0.05} /></span>
              </button>
            </motion.li>
          );
        })}
      </ol>
      <p className="-mt-3 text-center text-xs text-night-400">Tap a player for their stats</p>

      <Awards players={players} />

      {room.history.length > 0 && (
        <section className="card p-4">
          <SectionTitle right={<History size={15} className="text-night-400" />}>Previous matches</SectionTitle>
          <ul className="space-y-2 text-sm">
            {room.history.slice(0, 10).map((h) => (
              <li key={h.matchNumber + '-' + h.endedAt} className="flex items-center gap-2">
                <span className="w-7 shrink-0 text-xs font-bold text-night-400">#{h.matchNumber}</span>
                <span className="min-w-0 flex-1 truncate">
                  <b>{h.word}</b> <span className="text-night-400">· Imposter: {h.grinchNames.join(', ')}</span>
                </span>
                <span className={`shrink-0 text-xs font-bold ${h.winner === 'ELVES' ? 'text-elf' : h.winner === 'NONE' ? 'text-gold' : 'text-grinch'}`}>
                  {h.winner === 'ELVES' ? 'Innocents' : h.winner === 'NONE' ? 'Nobody' : 'Imposters'}
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
      <PlayerStatsSheet player={players.find((p) => p.id === statsFor) ?? null} onClose={() => setStatsFor(null)} />
    </div>
  );
}

// ───────────────────────────── AWARDS & STATS ─────────────────────────────

const AWARDS: { key: keyof PlayerStats; title: string; what: (n: number) => string }[] = [
  { key: 'correctVotes', title: 'Top Detective', what: (n) => `${n} vote${n === 1 ? '' : 's'} for an Imposter` },
  { key: 'grinchWins', title: 'Master of Disguise', what: (n) => `${n} win${n === 1 ? '' : 's'} as an Imposter` },
  { key: 'elfWins', title: 'Most Trustworthy', what: (n) => `${n} win${n === 1 ? '' : 's'} as an Innocent` },
  { key: 'correctGuesses', title: 'Word Thief', what: (n) => `${n} correct final guess${n === 1 ? '' : 'es'}` },
  { key: 'timesVotedOut', title: 'Most Suspicious', what: (n) => `voted out ${n} time${n === 1 ? '' : 's'}` },
];

/** Fun superlatives across the room's matches (ties share the award). */
function Awards({ players }: { players: PublicPlayer[] }) {
  const awards = AWARDS.map((a) => {
    const best = Math.max(0, ...players.map((p) => p.stats[a.key]));
    return { ...a, best, winners: best > 0 ? players.filter((p) => p.stats[a.key] === best) : [] };
  }).filter((a) => a.winners.length > 0);
  if (awards.length === 0) return null;
  return (
    <section className="card p-4">
      <SectionTitle>Awards</SectionTitle>
      <ul className="grid gap-2 min-[420px]:grid-cols-2">
        {awards.map((a) => (
          <li key={a.key} className="flex items-center gap-3 rounded-2xl bg-white/[0.035] px-3 py-2.5">
            <AvatarImg id={a.winners[0].avatar} size={36} />
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider text-gold">{a.title}</p>
              <p className="truncate text-sm font-bold">
                {a.winners.map((w) => w.name).join(' & ')}
              </p>
              <p className="text-xs text-night-300">{a.what(a.best)}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PlayerStatsSheet({ player, onClose }: { player: PublicPlayer | null; onClose: () => void }) {
  const s = player?.stats;
  const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '—');
  const elfMatches = s ? s.matchesPlayed - s.grinchMatches : 0;
  const rows: [string, string | number][] = s
    ? [
        ['Points', player!.score],
        ['Matches played', s.matchesPlayed],
        ['Win rate', pct(s.wins, s.matchesPlayed)],
        ['Wins as an Innocent', `${s.elfWins} / ${elfMatches}`],
        ['Wins as an Imposter', `${s.grinchWins} / ${s.grinchMatches}`],
        ['Votes for an Imposter', s.correctVotes],
        ['Times voted out', s.timesVotedOut],
        ['Correct final guesses', s.correctGuesses],
      ]
    : [];
  return (
    <Sheet open={!!player} onClose={onClose} title={player ? `${player.name}'s stats` : 'Stats'}>
      {player && (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar emoji={player.avatar} size={72} ring="gold" />
            <div>
              <p className="heading text-2xl">{player.name}</p>
              <p className="text-sm text-night-300">Stats for this room. They reset when the host resets scores.</p>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-2">
            {rows.map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-white/[0.04] px-3 py-2.5">
                <dt className="text-xs text-night-400">{label}</dt>
                <dd className="font-display text-xl text-snow">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </Sheet>
  );
}
