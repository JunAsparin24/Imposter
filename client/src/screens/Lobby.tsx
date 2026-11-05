import { AnimatePresence, motion } from 'framer-motion';
import { Check, Copy, Crown, GraduationCap, Link2, Play, Settings2, Share2, UserX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { MAX_PLAYERS, MIN_PLAYERS, maxGrinchCount, resolveGrinchCount } from '@imposter/shared';
import { PlayerRow } from '../components/RoomChrome';
import { SettingsSheet, settingsSummary } from '../components/SettingsSheet';
import { ActionBar, Button, ConfirmButton, SectionTitle, Toggle } from '../components/ui';
import { useRoom } from '../state/GameProvider';

const isLocalhost = () => ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);

/**
 * On the real website the invite link is just this page's address. Only when testing on
 * `localhost` do we ask the server for this computer's Wi-Fi address, so phones can join.
 */
function useLanAddress(): string | null {
  const [lan, setLan] = useState<string | null>(null);
  useEffect(() => {
    if (!isLocalhost()) return;
    let stop = false;
    fetch('/api/join-info', { cache: 'no-store' })
      .then((r) => r.json() as Promise<{ lan: string[] }>)
      .then((d) => !stop && setLan(d.lan[0] ?? null))
      .catch(() => {});
    return () => {
      stop = true;
    };
  }, []);
  return lan;
}

function joinBase(lan: string | null): { base: string; reach: 'online' | 'wifi' | 'this-address' } {
  if (isLocalhost() && lan) return { base: lan, reach: 'wifi' };
  return { base: window.location.origin, reach: window.location.protocol === 'https:' ? 'online' : 'this-address' };
}

export function InviteCard() {
  const { room, toast, isHost, send } = useRoom();
  const lan = useLanAddress();
  const { base, reach } = joinBase(lan);
  const link = `${base}/?join=${room.code}`;
  const copy = (text: string, what: string) =>
    navigator.clipboard?.writeText(text).then(
      () => toast(`${what} copied!`, 'success'),
      () => toast(`Couldn't copy. ${what}: ${text}`, 'info'),
    );
  const canShare = typeof navigator !== 'undefined' && !!navigator.share;

  return (
    <div className="card p-5 text-center">
      <p className="label">Go to</p>
      <p className="mt-1 break-all text-lg font-bold text-snow">{base.replace(/^https?:\/\//, '')}</p>
      <p className="label mt-4">and enter code</p>
      <button
        onClick={() => copy(room.code, 'Room code')}
        className="mx-auto mt-1 block rounded-2xl px-3 font-display text-[clamp(3.5rem,20vw,5.5rem)] leading-none tracking-[0.18em] text-gold drop-shadow-[0_0_18px_rgba(245,196,81,0.35)] lg:text-[7rem]"
        aria-label={`Room code ${room.code}. Tap to copy.`}
      >
        {room.code}
      </button>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button size="sm" variant="outline" icon={<Copy size={15} />} onClick={() => copy(room.code, 'Room code')}>
          Copy code
        </Button>
        <Button
          size="sm"
          variant="outline"
          icon={canShare ? <Share2 size={15} /> : <Link2 size={15} />}
          onClick={() =>
            canShare
              ? navigator.share({ title: 'Imposter Mafia', text: `Join my Imposter Mafia game! Code ${room.code}`, url: link }).catch(() => {})
              : copy(link, 'Invite link')
          }
        >
          {canShare ? 'Share link' : 'Copy link'}
        </Button>
      </div>
      {reach === 'wifi' && (
        <p className="mt-3 text-xs font-semibold text-gold">Local test: phones need to be on the same Wi-Fi as this computer.</p>
      )}
      {isHost ? (
        <div className="mt-3 border-t border-white/[0.06] pt-1">
          <Toggle
            checked={room.locked}
            onChange={(v) => void send('room:setLocked', { locked: v })}
            label={room.locked ? 'Room locked' : 'Lock room'}
            description={room.locked ? 'Nobody new can join. Players already here can still rejoin.' : 'Stop new players from joining.'}
          />
        </div>
      ) : (
        room.locked && <p className="mt-3 text-center text-xs font-semibold text-gold">The host has locked this room</p>
      )}
    </div>
  );
}

export function Lobby() {
  const { room, me, isHost, send, session } = useRoom();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const players = room.players.filter((p) => p.status !== 'LEFT');
  const connected = players.filter((p) => p.connected);
  const readyCount = players.filter((p) => p.ready).length;
  const grinches = resolveGrinchCount(room.settings, connected.length);
  const tooManyGrinches = connected.length >= MIN_PLAYERS && grinches > maxGrinchCount(connected.length);

  const startProblem =
    connected.length < MIN_PLAYERS
      ? `Need at least ${MIN_PLAYERS} players (${connected.length}/${MIN_PLAYERS})`
      : tooManyGrinches
        ? `Too many Imposters for ${connected.length} players`
        : null;

  return (
    <div className="flex flex-1 flex-col gap-5">
      {/* Laptop: join info on the left, players + settings on the right. */}
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-start">
      <div className="lg:sticky lg:top-20">
        <InviteCard />
      </div>

      <div className="flex flex-col gap-5">
      <section>
        <SectionTitle
          right={
            <span className="text-xs font-semibold text-night-300">
              {readyCount}/{players.length} ready · max {MAX_PLAYERS}
            </span>
          }
        >
          Players ({players.length})
        </SectionTitle>
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {players.map((p) => (
              <motion.li key={p.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }}>
                <PlayerRow
                  player={p}
                  isMe={p.id === session?.playerId}
                  sub={p.score > 0 ? <span>{p.score} pts</span> : undefined}
                  right={
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-bold ${
                          p.ready ? 'bg-elf/15 text-elf-light' : 'bg-white/[0.05] text-night-400'
                        }`}
                      >
                        {p.ready ? <Check size={13} strokeWidth={3} /> : null}
                        {p.ready ? 'Ready' : 'Not ready'}
                      </span>
                      {isHost && p.id !== session?.playerId && p.connected && (
                        <ConfirmButton
                          size="sm"
                          variant="ghost"
                          className="!h-8 !px-2"
                          aria-label={`Make ${p.name} the host`}
                          title="Make host"
                          confirmLabel="Host?"
                          onConfirm={() => void send('room:transferHost', { playerId: p.id })}
                        >
                          <Crown size={16} />
                        </ConfirmButton>
                      )}
                      {isHost && p.id !== session?.playerId && (
                        <ConfirmButton
                          size="sm"
                          variant="ghost"
                          className="!h-8 !px-2"
                          title="Kick"
                          aria-label={`Kick ${p.name}`}
                          confirmLabel="Kick?"
                          onConfirm={() => void send('room:kick', { playerId: p.id })}
                        >
                          <UserX size={16} />
                        </ConfirmButton>
                      )}
                    </div>
                  }
                />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
        {players.length < MIN_PLAYERS && (
          <p className="mt-3 text-center text-sm text-night-300">Waiting for more players to join…</p>
        )}
      </section>

      <section className="card p-4">
        <SectionTitle
          right={
            <Button size="sm" variant="ghost" icon={<Settings2 size={15} />} onClick={() => setSettingsOpen(true)}>
              {isHost ? 'Edit' : 'View'}
            </Button>
          }
        >
          Game settings
        </SectionTitle>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
          {settingsSummary(room.settings, connected.length, room.customPack?.name).map((row) => (
            <div key={row.label} className="min-w-0">
              <dt className="text-xs text-night-400">{row.label}</dt>
              <dd className="truncate font-semibold">{row.value}</dd>
            </div>
          ))}
        </dl>
      </section>
      </div>
      </div>

      <ActionBar>
        <Button
          block
          size="lg"
          variant={me?.ready ? 'outline' : 'elf'}
          icon={me?.ready ? <Check size={18} /> : undefined}
          onClick={() => void send('player:ready', { ready: !me?.ready })}
        >
          {me?.ready ? "I'm ready! (tap to undo)" : "I'm ready"}
        </Button>
        {isHost ? (
          <Button
            block
            size="lg"
            variant="grinch"
            icon={<Play size={18} />}
            disabled={!!startProblem}
            loading={starting}
            onClick={async () => {
              setStarting(true);
              await send('game:start');
              setStarting(false);
            }}
          >
            {startProblem ?? (readyCount < players.length ? `Start anyway (${readyCount}/${players.length} ready)` : 'Start game')}
          </Button>
        ) : null}
        {isHost && !startProblem && (
          <Button
            block
            variant="outline"
            icon={<GraduationCap size={18} />}
            onClick={() => void send('game:start', { practice: true })}
          >
            Practice round first (easy word, no points)
          </Button>
        )}
        {!isHost && (
          <p className="py-2 text-center text-sm text-night-300">Waiting for the host to start the game…</p>
        )}
      </ActionBar>

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
