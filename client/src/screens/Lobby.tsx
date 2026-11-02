import { AnimatePresence, motion } from 'framer-motion';
import { Check, Copy, Link2, Play, QrCode, Settings2, Share2, UserX } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState } from 'react';
import { MAX_PLAYERS, MIN_PLAYERS, maxGrinchCount, resolveGrinchCount } from '@imposter/shared';
import { PlayerRow } from '../components/RoomChrome';
import { SettingsSheet, settingsSummary } from '../components/SettingsSheet';
import { ActionBar, Button, ConfirmButton, SectionTitle } from '../components/ui';
import { useRoom } from '../state/GameProvider';

interface JoinInfo {
  lan: string[];
  online: string | null;
  onlinePending: boolean;
}

const isLocalhost = () => ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);

/**
 * Asks the server which address other phones should use. When the host opened the game on
 * `localhost` (e.g. via "Start IMPOSTER.bat"), localhost links would be useless to phones, so
 * we prefer the online link, then the Wi-Fi address.
 */
function useJoinInfo(): JoinInfo | null {
  const [info, setInfo] = useState<JoinInfo | null>(null);
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const res = await fetch('/api/join-info', { cache: 'no-store' });
        const data = (await res.json()) as JoinInfo;
        if (stop) return;
        setInfo(data);
        if (data.onlinePending) timer = setTimeout(load, 3000); // keep checking until the online link is up
      } catch {
        /* older server or offline: fall back to this page's address */
      }
    };
    void load();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, []);
  return info;
}

function joinBase(info: JoinInfo | null): { base: string; reach: 'online' | 'wifi' | 'this-address' } {
  if (info?.online) return { base: info.online, reach: 'online' };
  if (isLocalhost() && info?.lan[0]) return { base: info.lan[0], reach: 'wifi' };
  return { base: window.location.origin, reach: window.location.protocol === 'https:' ? 'online' : 'this-address' };
}

export function InviteCard() {
  const { room, toast } = useRoom();
  const [showQr, setShowQr] = useState(true);
  const info = useJoinInfo();
  const { base, reach } = joinBase(info);
  const link = `${base}/?join=${room.code}`;
  const copy = (text: string, what: string) =>
    navigator.clipboard?.writeText(text).then(
      () => toast(`${what} copied!`, 'success'),
      () => toast(`Couldn't copy. ${what}: ${text}`, 'info'),
    );
  const canShare = typeof navigator !== 'undefined' && !!navigator.share;

  return (
    <div className="card p-4">
      <p className="label text-center">Room code</p>
      <button
        onClick={() => copy(room.code, 'Room code')}
        className="mx-auto mt-1 block rounded-2xl px-3 font-display text-[clamp(2.4rem,13vw,3.5rem)] tracking-[0.2em] text-gold drop-shadow-[0_0_18px_rgba(245,196,81,0.35)]"
        aria-label={`Room code ${room.code}. Tap to copy.`}
      >
        {room.code}
      </button>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Button size="sm" variant="outline" icon={<Copy size={15} />} onClick={() => copy(room.code, 'Room code')}>
          Code
        </Button>
        <Button
          size="sm"
          variant="outline"
          icon={canShare ? <Share2 size={15} /> : <Link2 size={15} />}
          onClick={() =>
            canShare
              ? navigator.share({ title: 'IMPOSTER: Christmas Edition', text: `Join my game! Code ${room.code}`, url: link }).catch(() => {})
              : copy(link, 'Invite link')
          }
        >
          {canShare ? 'Share' : 'Link'}
        </Button>
        <Button size="sm" variant={showQr ? 'primary' : 'outline'} icon={<QrCode size={15} />} onClick={() => setShowQr((v) => !v)}>
          QR
        </Button>
      </div>
      <AnimatePresence>
        {showQr && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mx-auto mt-4 w-fit rounded-2xl bg-white p-3">
              <QRCodeSVG value={link} size={176} bgColor="#ffffff" fgColor="#07090c" level="M" />
            </div>
            <p className="mt-2 break-all text-center text-xs text-night-300">{link}</p>
            <p
              className={`mt-1 text-center text-xs font-semibold ${
                reach === 'online' ? 'text-elf-light' : 'text-gold'
              }`}
            >
              {reach === 'online'
                ? '🌍 Works on any Wi-Fi or mobile data'
                : reach === 'wifi'
                  ? info?.onlinePending
                    ? '📶 Same Wi-Fi only for now — online link is starting…'
                    : '📶 Phones must be on the same Wi-Fi as this computer'
                  : ''}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
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
        ? `Too many Grinches for ${connected.length} players`
        : null;

  return (
    <div className="flex flex-1 flex-col gap-5">
      <InviteCard />

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
                      {isHost && p.id !== session?.playerId && (
                        <ConfirmButton
                          size="sm"
                          variant="ghost"
                          className="!h-8 !px-2"
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
          <p className="mt-3 text-center text-sm text-night-300">Waiting for more players to join… 🎅</p>
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
          {settingsSummary(room.settings, connected.length).map((row) => (
            <div key={row.label} className="min-w-0">
              <dt className="text-xs text-night-400">{row.label}</dt>
              <dd className="truncate font-semibold">{row.value}</dd>
            </div>
          ))}
        </dl>
      </section>

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
        ) : (
          <p className="py-2 text-center text-sm text-night-300">Waiting for the host to start the game…</p>
        )}
      </ActionBar>

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
