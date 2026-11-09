import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, Crown, LogIn } from 'lucide-react';
import { MIN_PLAYERS, categoryName, recommendedGrinchCount, resolveGrinchCount, type PublicPlayer } from '@imposter/shared';
import { AvatarImg, Logo } from '../components/decor';
import { useRoom } from '../state/GameProvider';
import { PhaseTitle } from './RoundScreens';

/**
 * Screens for the ROOM SCREEN: the device that created the room (usually a laptop or TV).
 * It isn't a player and only ever receives public information. Everyone joins on their own
 * phone; the first to join is the host and runs the game from their phone.
 */

/** Slow-spinning festive rays behind the lobby, party-game style. */
function SpinningRays() {
  const reduce = useReducedMotion();
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      {/* Outer div centres; inner div spins (the animation owns its transform, so they can't share one). */}
      <div className="absolute left-1/2 top-1/2 h-[220vmax] w-[220vmax] -translate-x-1/2 -translate-y-1/2">
        <motion.div
          className="h-full w-full opacity-[0.18]"
          style={{
            background:
              'repeating-conic-gradient(from 0deg, #ef4444 0deg 9deg, transparent 9deg 18deg, #f5c451 18deg 27deg, transparent 27deg 36deg)',
          }}
          animate={reduce ? undefined : { rotate: 360 }}
          transition={{ repeat: Infinity, duration: 120, ease: 'linear' }}
        />
      </div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,transparent_0%,rgba(7,9,12,0.25)_45%,rgba(7,9,12,0.85)_100%)]" />
    </div>
  );
}

/** One seat on the lobby wall: a waiting "Join!" slot or a player who popped in. */
function Seat({ player, index }: { player?: PublicPlayer; index: number }) {
  const reduce = useReducedMotion();
  const tilt = [-2.5, 1.5, -1, 2.5, -1.5, 2, -2, 1][index % 8];
  const colors = ['bg-grinch/25', 'bg-elf/25', 'bg-gold/20', 'bg-sky-400/20'];
  return (
    <div className="relative aspect-[4/5]" style={{ transform: `rotate(${tilt}deg)` }}>
      <AnimatePresence mode="wait">
        {player ? (
          <motion.div
            key={player.id}
            initial={reduce ? { opacity: 0 } : { scale: 0.2, y: -60, opacity: 0, rotate: -20 }}
            animate={{ scale: 1, y: 0, opacity: 1, rotate: 0 }}
            exit={{ scale: 0.3, opacity: 0 }}
            transition={{ type: 'spring', damping: 11, stiffness: 220 }}
            className={`absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-3xl border-2 border-white/15 ${
              colors[index % colors.length]
            } shadow-[0_10px_0_rgba(0,0,0,0.35)] ${player.connected ? '' : 'opacity-50 grayscale'}`}
          >
            {player.isHost && (
              <span className="absolute -top-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-gold px-2.5 py-1 text-[11px] font-black uppercase tracking-wider text-night-950 shadow-lg">
                <Crown size={12} strokeWidth={3} /> Host
              </span>
            )}
            <motion.div
              animate={reduce ? undefined : { y: [0, -6, 0] }}
              transition={{ repeat: Infinity, duration: 2.2 + (index % 4) * 0.3, ease: 'easeInOut', delay: (index % 5) * 0.2 }}
            >
              <AvatarImg id={player.avatar} size={84} className="drop-shadow-[0_6px_0_rgba(0,0,0,0.35)] lg:!h-[104px] lg:!w-[104px]" />
            </motion.div>
            <p className="w-full truncate px-2 text-center font-display text-base uppercase leading-tight tracking-wide text-snow lg:text-lg">
              {player.name}
            </p>
            {!player.connected && <p className="text-[11px] font-bold uppercase text-night-300">Reconnecting…</p>}
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-white/15 bg-black/25"
          >
            <motion.span
              className="h-6 w-6 rounded-full bg-white/25"
              animate={reduce ? undefined : { scale: [1, 1.25, 1], opacity: [0.5, 1, 0.5] }}
              transition={{ repeat: Infinity, duration: 1.6, delay: index * 0.15 }}
            />
            <p className="font-display text-sm uppercase tracking-wider text-white/40">Join!</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function DisplayLobby() {
  const { room, setJoiningHere } = useRoom();
  const players = room.players.filter((p) => p.status !== 'LEFT');
  const host = players.find((p) => p.isHost);
  const connected = players.filter((p) => p.connected).length;
  const needed = Math.max(0, MIN_PLAYERS - connected);
  // Show 8 seats, growing a row at a time as people join (up to the max).
  const seats = Math.min(room.settings.maxPlayers, Math.max(8, Math.ceil((players.length + 1) / 4) * 4));
  const site = window.location.host;
  const s = room.settings;
  const grinches = s.grinchCount === 'auto' ? recommendedGrinchCount(Math.max(MIN_PLAYERS, connected)) : resolveGrinchCount(s, connected);
  const words = s.categories.includes('random') ? 'Random mix' : s.categories.map((c) => (c === 'custom' ? room.customPack?.name ?? 'Custom' : categoryName(c))).join(', ');

  const status =
    players.length === 0
      ? 'Grab your phones and join!'
      : needed > 0
        ? `Need ${needed} more player${needed === 1 ? '' : 's'}`
        : `Waiting for ${host?.name ?? 'the host'} to start`;

  return (
    <div className="flex flex-1 flex-col gap-6 pb-6">
      <SpinningRays />
      <div className="flex flex-1 flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)] lg:items-center lg:gap-10">
        {/* Left: logo + how to join, big enough to read from the couch. */}
        <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
          <div className="hidden lg:block">
            <Logo size="md" />
          </div>
          <div className="mt-2 lg:mt-10">
            <p className="font-display text-xl uppercase tracking-wide text-snow/80 lg:text-2xl">Join at</p>
            <p className="break-all font-display text-2xl text-snow lg:text-4xl">{site}</p>
            <p className="mt-4 font-display text-xl uppercase tracking-wide text-snow/80 lg:text-2xl">Room code</p>
            <div className="mt-1 flex justify-center gap-1.5 lg:justify-start" aria-label={`Room code ${room.code}`}>
              {room.code.split('').map((ch, i) => (
                <motion.span
                  key={i}
                  className="grid h-[4.5rem] w-14 place-items-center rounded-2xl bg-gold font-display text-5xl text-night-950 shadow-[0_6px_0_#a37a1f] lg:h-24 lg:w-[4.5rem] lg:text-6xl"
                  animate={{ y: [0, -5, 0], rotate: [0, i % 2 ? 3 : -3, 0] }}
                  transition={{ repeat: Infinity, duration: 2.4, delay: i * 0.18, ease: 'easeInOut' }}
                >
                  {ch}
                </motion.span>
              ))}
            </div>
          </div>
          <dl className="mt-6 flex flex-wrap justify-center gap-2 text-xs font-bold uppercase tracking-wider lg:justify-start">
            <div className="rounded-full bg-black/40 px-3 py-1.5 text-grinch-light">
              {s.mode === 'CHAOS' ? 'Secret # of Imposters' : `${grinches} Imposter${grinches === 1 ? '' : 's'}`}
            </div>
            <div className="max-w-[16rem] truncate rounded-full bg-black/40 px-3 py-1.5 text-snow/80">{words}</div>
            {s.specialRoles.includes('JESTER') && <div className="rounded-full bg-black/40 px-3 py-1.5 text-gold">+ Jester</div>}
            {room.locked && <div className="rounded-full bg-black/40 px-3 py-1.5 text-gold">Room locked</div>}
          </dl>
        </div>

        {/* Right: the wall of seats. */}
        <div>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:gap-4">
            {Array.from({ length: seats }, (_, i) => (
              <Seat key={i} index={i} player={players[i]} />
            ))}
          </div>
        </div>
      </div>

      {/* Bottom bar: what happens next. */}
      <div className="flex flex-col items-center gap-3">
        <motion.div
          key={status}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="rounded-2xl bg-black/70 px-6 py-3 font-display text-lg uppercase tracking-wider text-snow shadow-[0_6px_0_rgba(0,0,0,0.5)] lg:text-2xl"
          role="status"
        >
          {status}
        </motion.div>
        {host && needed === 0 && <p className="text-sm text-night-300">The host starts the game from their phone.</p>}
        <button
          onClick={() => setJoiningHere(true)}
          className="flex items-center gap-1.5 text-xs font-semibold text-night-400 underline-offset-4 hover:text-snow hover:underline"
        >
          <LogIn size={13} /> Join as a player on this device instead
        </button>
      </div>
    </div>
  );
}

export function DisplayRoleReveal() {
  const { room, playerById } = useRoom();
  const m = room.match!;
  const participants = m.participantIds.map((id) => playerById(id)!).filter(Boolean);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 py-6 text-center">
      <PhaseTitle
        kicker={m.practice ? 'Practice round' : `Match ${m.number}`}
        title="Check your phones!"
        sub={
          <>
            Press and hold your card to see your secret role. <b className="text-grinch">{m.grinchCount === null ? 'A secret number of Imposters' : `${m.grinchCount} Imposter${m.grinchCount === 1 ? '' : 's'}`}{m.specialRoles.includes('JESTER') ? ' and a Jester' : ''}</b>{' '}
            hiding among {participants.length} players.
          </>
        }
      />
      <div className="flex max-w-3xl flex-wrap justify-center gap-4">
        {participants.map((p) => {
          const ok = m.acknowledgedIds.includes(p.id);
          return (
            <div key={p.id} className="flex w-24 flex-col items-center gap-1.5">
              <motion.div
                animate={ok ? { scale: [1, 1.15, 1] } : { opacity: 0.45 }}
                transition={{ duration: 0.4 }}
                className={`relative grid h-20 w-20 place-items-center rounded-2xl ${ok ? 'bg-elf/20 ring-2 ring-elf' : 'bg-white/[0.04]'}`}
              >
                <AvatarImg id={p.avatar} size={60} />
                {ok && (
                  <span className="absolute -bottom-2 -right-2 grid h-7 w-7 place-items-center rounded-full bg-elf text-night-950">
                    <Check size={16} strokeWidth={3} />
                  </span>
                )}
              </motion.div>
              <span className="w-full truncate text-sm font-semibold">{p.name}</span>
            </div>
          );
        })}
      </div>
      <p className="text-sm text-night-300">The host starts the clues once everyone has seen their role.</p>
    </div>
  );
}
