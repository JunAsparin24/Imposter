import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, LogIn, Plus, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AVATAR_LABELS, AVATARS, NAME_MAX_LENGTH, ROOM_CODE_LENGTH, type RoomCheckResult } from '@imposter/shared';
import { AvatarImg, Logo } from '../components/decor';
import { HowToPlay } from '../components/HowToPlay';
import { Button, Spinner } from '../components/ui';
import { emitAck } from '../lib/socket';
import { loadProfile } from '../lib/storage';
import { useGame } from '../state/GameProvider';

type Mode = 'home' | 'join';

function codeFromUrl(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    return (params.get('join') ?? params.get('room') ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, ROOM_CODE_LENGTH);
  } catch {
    return '';
  }
}

/**
 * Landing page. "Create Room" makes an empty room and turns this device into the room screen;
 * "Join Room" asks for a name, avatar and code. `joinCode` opens the join form directly
 * (used when the room screen wants to join its own room as a player).
 */
export function Home({ joinCode, onBack }: { joinCode?: string; onBack?: () => void } = {}) {
  const { prefs, setPrefs, status, createRoom, toast } = useGame();
  const [initialCode] = useState(() => joinCode ?? codeFromUrl());
  const [mode, setMode] = useState<Mode>(initialCode ? 'join' : 'home');
  const [creating, setCreating] = useState(false);
  const [slowConnect, setSlowConnect] = useState(false);
  useEffect(() => {
    if (status === 'connected') return setSlowConnect(false);
    const t = setTimeout(() => setSlowConnect(true), 6000);
    return () => clearTimeout(t);
  }, [status]);

  const create = async () => {
    setCreating(true);
    const res = await createRoom();
    setCreating(false);
    if (!res.ok) toast(res.error.message, 'error');
  };
  const back = () => (onBack ? onBack() : setMode('home'));

  return (
    <div className="flex min-h-dvh w-full flex-col pt-safe pb-safe">
      {/* Top bar spans the whole screen, so on a computer the sound button sits in the corner. */}
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 lg:h-20 lg:px-8">
        {mode !== 'home' || onBack ? (
          <button
            onClick={back}
            className="flex h-10 items-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-night-300 hover:text-snow"
          >
            <ArrowLeft size={18} /> Back
          </button>
        ) : (
          <span />
        )}
        <button
          onClick={() => setPrefs({ muted: !prefs.muted })}
          className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.05]"
          aria-label={prefs.muted ? 'Unmute sounds' : 'Mute sounds'}
        >
          {prefs.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
      </div>

      <AnimatePresence mode="wait">
        {mode === 'home' ? (
          <motion.main
            key="home"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -10 }}
            className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 lg:grid lg:max-w-6xl lg:grid-cols-2 lg:items-center lg:gap-16 lg:px-8"
          >
            {/* Left on computers: logo + buttons. */}
            <div className="flex flex-1 flex-col lg:flex-none">
              <div className="flex flex-1 flex-col items-center justify-center py-8 lg:flex-none lg:py-0">
                <Logo />
                <p className="mt-4 max-w-xs text-center text-[15px] leading-relaxed text-night-300 lg:max-w-sm lg:text-base">
                  Everyone gets the secret word except the <b className="text-grinch">Grinch</b>. Give clues, spot the faker, vote them out.
                </p>
              </div>

              <div className="mx-auto flex w-full max-w-md flex-col gap-3 lg:mt-10">
                <Button size="lg" variant="grinch" block icon={<Plus size={20} />} onClick={create} loading={creating} disabled={status !== 'connected'}>
                  Create Room
                </Button>
                <Button size="lg" variant="elf" block icon={<LogIn size={20} />} onClick={() => setMode('join')} disabled={status !== 'connected'}>
                  Join Room
                </Button>
                <p className="text-center text-xs text-night-400">
                  Creating a room turns this screen into the room display. Everyone (you too) joins on their own phone.
                </p>
                {status !== 'connected' && (
                  <div className="text-center text-sm text-night-300" role="status">
                    <p className="flex items-center justify-center gap-2">
                      <Spinner /> Connecting…
                    </p>
                    {slowConnect && (
                      <p className="mt-2 text-xs text-gold">Taking a while… Check your internet connection and try refreshing.</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right on computers (below on phones): how to play. */}
            <section className="mt-10 pb-4 lg:mt-0 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto lg:pr-2" aria-labelledby="how-to-play">
              <h2 id="how-to-play" className="heading mb-3 text-center text-xl lg:text-left">
                How to play
              </h2>
              <HowToPlay />
            </section>
          </motion.main>
        ) : (
          <motion.main
            key={mode}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="mx-auto flex w-full max-w-md flex-1 flex-col px-4"
          >
            <EntryForm initialCode={initialCode} />
          </motion.main>
        )}
      </AnimatePresence>
    </div>
  );
}

function EntryForm({ initialCode }: { initialCode: string }) {
  const { joinRoom, status } = useGame();
  const profile = loadProfile();
  const [name, setName] = useState(profile?.name ?? '');
  const [avatar, setAvatar] = useState<string>(profile?.avatar ?? AVATARS[Math.floor(Math.random() * AVATARS.length)]);
  const [code, setCode] = useState(initialCode);
  const [check, setCheck] = useState<RoomCheckResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Validate the room code with the server as soon as it's complete.
  useEffect(() => {
    setCheck(null);
    if (code.length !== ROOM_CODE_LENGTH || status !== 'connected') return;
    let cancelled = false;
    void emitAck<RoomCheckResult>('room:check', { code }).then((res) => {
      if (!cancelled && res.ok) setCheck(res.data);
    });
    return () => {
      cancelled = true;
    };
    // Re-check once the socket connects (invite links open before the connection is up).
  }, [code, status]);

  const codeProblem =
    check && !check.joinable
      ? check.reason === 'ROOM_NOT_FOUND'
        ? 'No room with that code.'
        : check.reason === 'ROOM_LOCKED'
          ? 'The host has locked that room.'
          : check.reason === 'ROOM_FULL'
          ? 'That room is full.'
          : 'A game is in progress in that room. Wait for the match to end.'
      : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError('Enter a display name.');
    if (code.length !== ROOM_CODE_LENGTH) return setError('Room codes are 6 characters.');
    setBusy(true);
    const res = await joinRoom(code, name.trim(), avatar);
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
    } else {
      try {
        window.history.replaceState(null, '', window.location.pathname);
      } catch {
        /* ignore */
      }
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col gap-6 pt-2">
      <div>
        <h1 className="heading text-3xl">Join a room</h1>
        <p className="mt-1 text-sm text-night-300">
          Enter the 6-character code shown on the room screen. The first person to join is the host.
        </p>
      </div>

      {(
        <label className="block">
          <span className="label">Room code</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, ROOM_CODE_LENGTH))}
            placeholder="K7M2PX"
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            inputMode="text"
            className={`mt-2 h-16 w-full rounded-2xl border bg-night-800 px-4 text-center font-display text-3xl tracking-[0.35em] text-gold placeholder:text-night-600 focus:outline-none ${
              codeProblem ? 'border-grinch' : check?.joinable ? 'border-elf' : 'border-white/10 focus:border-gold'
            }`}
            aria-invalid={!!codeProblem}
          />
          {codeProblem && <span className="mt-1.5 block text-sm font-semibold text-grinch-light">{codeProblem}</span>}
          {check?.joinable && <span className="mt-1.5 block text-sm font-semibold text-elf-light">Room found ✓</span>}
        </label>
      )}

      <label className="block">
        <span className="label">Display name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, NAME_MAX_LENGTH))}
          placeholder="e.g. Jingle Jordan"
          maxLength={NAME_MAX_LENGTH}
          autoComplete="nickname"
          className="mt-2 h-14 w-full rounded-2xl border border-white/10 bg-night-800 px-4 text-lg font-semibold placeholder:text-night-500 focus:border-gold focus:outline-none"
        />
      </label>

      <fieldset>
        <legend className="label">Pick an avatar</legend>
        <div className="mt-2 grid grid-cols-5 gap-2">
          {AVATARS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAvatar(a)}
              aria-label={`Avatar: ${AVATAR_LABELS[a]}`}
              aria-pressed={avatar === a}
              className={`grid aspect-square place-items-center rounded-2xl text-2xl transition ${
                avatar === a ? 'scale-105 bg-gold/15 ring-2 ring-gold' : 'bg-white/[0.04] hover:bg-white/[0.08]'
              }`}
            >
              <AvatarImg id={a} size={44} className="max-w-[80%]" />
            </button>
          ))}
        </div>
      </fieldset>

      {error && (
        <p className="rounded-2xl bg-grinch/15 px-4 py-3 text-sm font-semibold text-grinch-light" role="alert">
          {error}
        </p>
      )}

      <div className="mt-auto pt-2">
        <Button
          type="submit"
          size="lg"
          block
          variant="elf"
          loading={busy}
          disabled={status !== 'connected' || !!codeProblem}
        >
          Join Room
        </Button>
        {status !== 'connected' && <p className="mt-2 text-center text-sm text-grinch-light">No connection. Check your internet.</p>}
      </div>
    </form>
  );
}
