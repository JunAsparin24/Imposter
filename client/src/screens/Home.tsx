import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, LogIn, Sparkles, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AVATARS, NAME_MAX_LENGTH, ROOM_CODE_LENGTH, type RoomCheckResult } from '@imposter/shared';
import { Logo } from '../components/decor';
import { HowToPlay } from '../components/HowToPlay';
import { Button, Spinner } from '../components/ui';
import { emitAck } from '../lib/socket';
import { loadProfile } from '../lib/storage';
import { useGame } from '../state/GameProvider';

type Mode = 'home' | 'create' | 'join';

function codeFromUrl(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    return (params.get('join') ?? params.get('room') ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, ROOM_CODE_LENGTH);
  } catch {
    return '';
  }
}

export function Home() {
  const { prefs, setPrefs, status } = useGame();
  const [initialCode] = useState(codeFromUrl);
  const [mode, setMode] = useState<Mode>(initialCode ? 'join' : 'home');

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-safe pb-safe">
      <div className="flex h-14 items-center justify-between">
        {mode !== 'home' ? (
          <button
            onClick={() => setMode('home')}
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
            className="flex flex-1 flex-col"
          >
            <div className="flex flex-1 flex-col items-center justify-center py-8">
              <motion.div
                animate={{ rotate: [0, -6, 6, 0] }}
                transition={{ repeat: Infinity, duration: 5, ease: 'easeInOut' }}
                className="mb-3 text-5xl"
                aria-hidden
              >
                🎄
              </motion.div>
              <Logo />
              <p className="mt-4 max-w-xs text-center text-[15px] leading-relaxed text-night-300">
                Everyone knows the secret word… except the <b className="text-grinch">Grinch</b>. Find them before Christmas is ruined.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <Button size="lg" variant="grinch" block icon={<Sparkles size={20} />} onClick={() => setMode('create')} disabled={status !== 'connected'}>
                Create Room
              </Button>
              <Button size="lg" variant="elf" block icon={<LogIn size={20} />} onClick={() => setMode('join')} disabled={status !== 'connected'}>
                Join Room
              </Button>
              {status !== 'connected' && (
                <p className="flex items-center justify-center gap-2 text-center text-sm text-night-300" role="status">
                  <Spinner /> Connecting to the North Pole…
                </p>
              )}
            </div>

            <section className="mt-10 pb-4" aria-labelledby="how-to-play">
              <h2 id="how-to-play" className="heading mb-3 text-center text-xl">
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
            className="flex flex-1 flex-col"
          >
            <EntryForm mode={mode} initialCode={initialCode} />
          </motion.main>
        )}
      </AnimatePresence>
    </div>
  );
}

function EntryForm({ mode, initialCode }: { mode: 'create' | 'join'; initialCode: string }) {
  const { createRoom, joinRoom, status } = useGame();
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
    if (mode !== 'join' || code.length !== ROOM_CODE_LENGTH || status !== 'connected') return;
    let cancelled = false;
    void emitAck<RoomCheckResult>('room:check', { code }).then((res) => {
      if (!cancelled && res.ok) setCheck(res.data);
    });
    return () => {
      cancelled = true;
    };
    // Re-check once the socket connects (invite links open before the connection is up).
  }, [code, mode, status]);

  const codeProblem =
    check && !check.joinable
      ? check.reason === 'ROOM_NOT_FOUND'
        ? 'No room with that code.'
        : check.reason === 'ROOM_FULL'
          ? 'That room is full.'
          : 'A game is in progress in that room. Wait for the match to end.'
      : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError('Enter a display name.');
    if (mode === 'join' && code.length !== ROOM_CODE_LENGTH) return setError('Room codes are 6 characters.');
    setBusy(true);
    const res = mode === 'create' ? await createRoom(name.trim(), avatar) : await joinRoom(code, name.trim(), avatar);
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
        <h1 className="heading text-3xl">{mode === 'create' ? 'Create a room' : 'Join a room'}</h1>
        <p className="mt-1 text-sm text-night-300">
          {mode === 'create' ? "You'll be the host. Friends join with your room code." : 'Ask the host for the 6-character room code.'}
        </p>
      </div>

      {mode === 'join' && (
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
              aria-label={`Avatar ${a}`}
              aria-pressed={avatar === a}
              className={`grid aspect-square place-items-center rounded-2xl text-2xl transition ${
                avatar === a ? 'scale-105 bg-gold/15 ring-2 ring-gold' : 'bg-white/[0.04] hover:bg-white/[0.08]'
              }`}
            >
              {a}
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
          variant={mode === 'create' ? 'grinch' : 'elf'}
          loading={busy}
          disabled={status !== 'connected' || (mode === 'join' && !!codeProblem)}
        >
          {mode === 'create' ? 'Create Room' : 'Join Room'}
        </Button>
        {status !== 'connected' && <p className="mt-2 text-center text-sm text-grinch-light">No connection — check your internet.</p>}
      </div>
    </form>
  );
}
