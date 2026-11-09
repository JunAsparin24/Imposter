import { AnimatePresence, motion } from 'framer-motion';
import { Eye, EyeOff, Fingerprint } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { PrivatePlayerState } from '@imposter/shared';
import { play, vibrate } from '../lib/sound';
import { useGame } from '../state/GameProvider';
import { AvatarImg } from './decor';
import { POWER_INFO } from './PowerSheet';
import { Toggle } from './ui';

/**
 * Private role card. Hidden by default: hold to peek (release hides it), or switch on
 * tap-to-toggle for accessibility. Only shows what the server sent this player:
 * an Imposter's browser never receives the secret word at all.
 */
export function RoleCard({ priv, compact = false }: { priv: PrivatePlayerState; compact?: boolean }) {
  const { prefs, setPrefs } = useGame();
  const [shown, setShown] = useState(false);
  const toggleMode = prefs.tapToToggle;

  // Hide again if the tab is backgrounded, so a role is never left on screen.
  useEffect(() => {
    const hide = () => document.visibilityState === 'hidden' && setShown(false);
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  }, []);

  const reveal = () => {
    if (!shown) {
      play('reveal');
      vibrate(20);
    }
    setShown(true);
  };
  const hide = () => setShown(false);

  const holdHandlers = toggleMode
    ? { onClick: () => (shown ? hide() : reveal()) }
    : {
        onPointerDown: (e: React.PointerEvent) => {
          e.currentTarget.setPointerCapture?.(e.pointerId);
          reveal();
        },
        onPointerUp: hide,
        onPointerCancel: hide,
        onLostPointerCapture: hide,
        onKeyDown: (e: React.KeyboardEvent) => {
          if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
            e.preventDefault();
            reveal();
          }
        },
        onKeyUp: (e: React.KeyboardEvent) => {
          if (e.key === ' ' || e.key === 'Enter') hide();
        },
        onBlur: hide,
      };

  const isGrinch = priv.role === 'GRINCH';
  const isElf = priv.role === 'ELF';
  const tone = isGrinch
    ? 'border-grinch/60 bg-gradient-to-b from-grinch-deep to-night-900 shadow-glow-red'
    : isElf
      ? 'border-elf/60 bg-gradient-to-b from-elf-deep to-night-900 shadow-glow-green'
      : priv.role === 'JESTER' || priv.role === 'EXECUTIONER' || priv.role === 'DRIFTER'
        ? 'border-gold/60 bg-gradient-to-b from-gold/15 to-night-900 shadow-glow-gold'
        : 'border-white/10 bg-night-800';

  return (
    <div className="w-full">
      <button
        type="button"
        {...holdHandlers}
        onContextMenu={(e) => e.preventDefault()}
        aria-pressed={toggleMode ? shown : undefined}
        aria-label={toggleMode ? (shown ? 'Hide your role' : 'Show your role') : 'Press and hold to reveal your role'}
        className={`no-callout relative flex w-full touch-none flex-col items-stretch justify-center overflow-hidden rounded-[28px] border-2 text-center transition-colors duration-300 ${
          shown ? tone : 'border-dashed border-white/15 bg-night-800/90'
        } ${compact ? 'min-h-[300px]' : 'min-h-[360px]'}`}
      >
        <AnimatePresence mode="wait" initial={false}>
          {!shown ? (
            <motion.div
              key="hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="flex flex-col items-center justify-center gap-5 p-6"
            >
              <motion.div
                animate={{ scale: [1, 1.08, 1] }}
                transition={{ repeat: Infinity, duration: 1.8 }}
                className="grid h-20 w-20 place-items-center rounded-full bg-white/[0.05] text-gold ring-1 ring-gold/30"
              >
                <Fingerprint size={40} />
              </motion.div>
              <p className="heading max-w-[16rem] text-xl leading-tight">
                {toggleMode ? 'Tap to reveal your role' : 'Tap and hold to reveal your role'}
              </p>
              <p className="text-sm text-night-300">Make sure nobody is peeking</p>
            </motion.div>
          ) : (
            <motion.div
              key="shown"
              initial={{ opacity: 0, rotateX: -25, scale: 0.94 }}
              animate={{ opacity: 1, rotateX: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="flex flex-col items-center justify-center gap-3 p-5"
            >
              <RoleContent priv={priv} />
            </motion.div>
          )}
        </AnimatePresence>
      </button>
      <div className="mt-2 flex items-center justify-between gap-3 px-1">
        <span className="flex items-center gap-1.5 text-xs text-night-300">
          {shown ? <Eye size={14} /> : <EyeOff size={14} />}
          {shown ? 'Visible' : 'Hidden'}
        </span>
        <div className="w-auto">
          <Toggle
            checked={toggleMode}
            onChange={(v) => {
              setShown(false);
              setPrefs({ tapToToggle: v });
            }}
            label="Tap to toggle"
          />
        </div>
      </div>
    </div>
  );
}

/** Who the other Imposters are (Classic mode). */
function TeamBox({ priv }: { priv: PrivatePlayerState }) {
  return (
    <div className="w-full rounded-2xl bg-black/30 px-4 py-3">
      <p className="label">{priv.teammates.length ? 'Your fellow Imposters' : 'Your team'}</p>
      {priv.teammates.length ? (
        <p className="mt-1 break-words text-lg font-bold text-grinch-light">
          {priv.teammates.map((t, i) => (
            <span key={t.id} className="inline-flex items-center gap-1">
              {i > 0 && ', '}
              <AvatarImg id={t.avatar} size={22} /> {t.name}
            </span>
          ))}
        </p>
      ) : (
        <p className="mt-1 text-lg font-bold text-grinch-light">You're the only Imposter.</p>
      )}
    </div>
  );
}

/** Twins: who your twin is. */
function TwinBox({ priv }: { priv: PrivatePlayerState }) {
  const { state } = useGame();
  if (!priv.twinId) return null;
  const twin = state?.room.players.find((p) => p.id === priv.twinId);
  return (
    <div className="w-full rounded-2xl bg-gold/10 px-4 py-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gold/80">Your twin</p>
      <p className="mt-1 flex items-center justify-center gap-1.5 text-lg font-bold text-gold">
        <AvatarImg id={twin?.avatar ?? ''} size={22} /> {twin?.name ?? 'Someone'}
      </p>
      <p className="mt-0.5 text-xs text-night-300">
        You don't know their team. If either of you is voted out, the other leaves too. Both make it to the end: +2 each.
      </p>
    </div>
  );
}

/** The player's extra power (Detective, Saboteur, Mayor), shown under their role. */
function PowerBox({ priv }: { priv: PrivatePlayerState }) {
  if (!priv.power) return null;
  const info = POWER_INFO[priv.power];
  return (
    <div className="w-full rounded-2xl bg-gold/10 px-4 py-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gold/80">Your power</p>
      <p className="heading mt-0.5 text-xl text-gold">{info.title}</p>
      <p className="mt-0.5 text-xs text-night-300">{info.rule}</p>
      {priv.power !== 'MAYOR' && <p className="mt-1 text-[11px] font-semibold text-gold/80">Use it with the Power button at the top.</p>}
    </div>
  );
}

function RoleContent({ priv }: { priv: PrivatePlayerState }) {
  const { state } = useGame();
  const mode = state?.room.match?.mode ?? 'CLASSIC';
  if (priv.role === 'ELF') {
    return (
      <>
        <p className="label !text-elf-light">Your secret role</p>
        <h2 className="heading text-[clamp(1.9rem,9vw,2.6rem)] text-elf">Innocent</h2>
        <div className="mt-2 w-full rounded-2xl bg-black/30 px-4 py-3">
          <p className="label">Your secret word</p>
          <p className="heading mt-1 break-words text-[clamp(1.6rem,8.5vw,2.4rem)] text-snow">{priv.word}</p>
          {priv.categoryName && <p className="mt-1.5 text-xs font-semibold text-night-300">{priv.categoryName}</p>}
        </div>
        <p className="max-w-[18rem] text-sm text-snow/80">
          {mode === 'CHAOS'
              ? 'Chaos: there might be several Imposters, or none at all.'
              : 'Give a one-word clue without giving the word away.'}
        </p>
        <TwinBox priv={priv} />
        <PowerBox priv={priv} />
      </>
    );
  }
  if (priv.role === 'EXECUTIONER') {
    const target = state?.room.players.find((p) => p.id === priv.executionerTargetId);
    return (
      <>
        <p className="label !text-gold">Your secret role</p>
        <h2 className="heading text-[clamp(1.9rem,9vw,2.6rem)] text-gold">Executioner</h2>
        <div className="mt-2 w-full rounded-2xl bg-black/30 px-4 py-3">
          <p className="label">The secret word</p>
          <p className="heading mt-1 break-words text-[clamp(1.6rem,8.5vw,2.4rem)] text-snow">{priv.word}</p>
          {priv.categoryName && <p className="mt-1.5 text-xs font-semibold text-night-300">{priv.categoryName}</p>}
        </div>
        <div className="w-full rounded-2xl bg-gold/10 px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gold/80">Your target</p>
          <p className="mt-1 flex items-center justify-center gap-1.5 text-xl font-bold text-gold">
            <AvatarImg id={target?.avatar ?? ''} size={24} /> {target?.name ?? 'Someone'}
          </p>
          <p className="mt-1 text-xs text-night-300">
            They're an Innocent. Get the group to vote them out and you win, whoever wins the match. You're on nobody's team.
          </p>
        </div>
      </>
    );
  }
  if (priv.role === 'DRIFTER') {
    return (
      <>
        <p className="label !text-gold">Your secret role</p>
        <h2 className="heading text-[clamp(1.9rem,9vw,2.6rem)] text-gold">Drifter</h2>
        <div className="mt-2 w-full rounded-2xl bg-black/30 px-4 py-3">
          <p className="label">Secret word</p>
          <p className="heading mt-1 text-3xl text-gold">???</p>
          <p className="mt-1 text-xs text-night-300">No word and no hint, but you're not an Imposter.</p>
        </div>
        <div className="w-full rounded-2xl bg-gold/10 px-4 py-3">
          <p className="text-base font-bold text-gold">Work out the word from the clues.</p>
          <p className="mt-1 text-xs text-night-300">
            Once per match, type your guess with the Power button at the top. Get it right and you win, whoever wins the match.
          </p>
        </div>
      </>
    );
  }
  if (priv.role === 'JESTER') {
    return (
      <>
        <p className="label !text-gold">Your secret role</p>
        <h2 className="heading text-[clamp(1.9rem,9vw,2.6rem)] text-gold">Jester</h2>
        <div className="mt-2 w-full rounded-2xl bg-black/30 px-4 py-3">
          <p className="label">The secret word</p>
          <p className="heading mt-1 break-words text-[clamp(1.6rem,8.5vw,2.4rem)] text-snow">{priv.word}</p>
          {priv.categoryName && <p className="mt-1.5 text-xs font-semibold text-night-300">{priv.categoryName}</p>}
        </div>
        <div className="w-full rounded-2xl bg-gold/10 px-4 py-3">
          <p className="text-base font-bold text-gold">You win if the group votes you out.</p>
          <p className="mt-1 text-xs text-night-300">You're on nobody's team. Act a little suspicious, but not so obvious that they catch on.</p>
        </div>
      </>
    );
  }
  if (priv.role === 'GRINCH') {
    return (
      <>
        <p className="label !text-grinch-light">Your secret role</p>
        <h2 className="heading text-[clamp(1.9rem,9vw,2.6rem)] text-grinch">Imposter</h2>
        <div className="mt-1 w-full rounded-2xl bg-black/30 px-4 py-3">
          <p className="label">Secret word</p>
          <p className="heading mt-1 text-3xl text-grinch-light">???</p>
          {priv.hint && (
            <div className="mt-2 rounded-xl bg-gold/10 px-3 py-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gold/80">Your hint</p>
              <p className="heading mt-0.5 break-words text-2xl text-gold">{priv.hint}</p>
              <p className="mt-0.5 text-[11px] text-night-300">Every Imposter has the same hint</p>
            </div>
          )}
        </div>
        {mode === 'CHAOS' ? (
          <div className="w-full rounded-2xl bg-black/30 px-4 py-3">
            <p className="label">Your team</p>
            <p className="mt-1 text-base font-bold text-grinch-light">Chaos: you don't know if there are other Imposters, or who they are.</p>
          </div>
        ) : (
          <TeamBox priv={priv} />
        )}
        <p className="max-w-[18rem] text-sm text-snow/80">
          {priv.hint ? 'Blend in. Listen closely to everyone\'s clues.' : 'No hint this time. Blend in and listen closely.'}
        </p>
        <TwinBox priv={priv} />
        <PowerBox priv={priv} />
      </>
    );
  }
  return (
    <>
      <h2 className="heading text-2xl">Spectating</h2>
      <p className="max-w-[18rem] text-sm text-night-300">You're sitting out this match. You'll be dealt in next match.</p>
    </>
  );
}
