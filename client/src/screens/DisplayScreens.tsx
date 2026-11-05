import { motion } from 'framer-motion';
import { Check, Crown, LogIn } from 'lucide-react';
import { PlayerRow } from '../components/RoomChrome';
import { settingsSummary } from '../components/SettingsSheet';
import { Button, SectionTitle } from '../components/ui';
import { useRoom } from '../state/GameProvider';
import { InviteCard } from './Lobby';
import { PhaseTitle } from './RoundScreens';

/**
 * Screens for the ROOM SCREEN: the device that created the room (usually a laptop or TV).
 * It isn't a player and only ever receives public information. Everyone joins on their own
 * phone; the first to join is the host and runs the game from their phone.
 */

export function DisplayLobby() {
  const { room, setJoiningHere } = useRoom();
  const players = room.players.filter((p) => p.status !== 'LEFT');
  const host = players.find((p) => p.isHost);
  const connected = players.filter((p) => p.connected).length;

  return (
    <div className="flex flex-1 flex-col gap-5 pb-6">
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-start">
        <div className="lg:sticky lg:top-20">
          <InviteCard />
          <p className="mt-3 text-center text-sm text-night-300">
            Or go to <b className="text-snow">{window.location.host}</b> and type the code.
          </p>
        </div>

        <div className="flex flex-col gap-5">
          <div className="card p-5 text-center">
            {host ? (
              <>
                <p className="flex items-center justify-center gap-2 text-lg font-bold">
                  <Crown size={18} className="text-gold" /> {host.name} is the host
                </p>
                <p className="mt-1 text-sm text-night-300">They start the game from their phone. Need at least 3 players.</p>
              </>
            ) : (
              <>
                <p className="heading text-2xl text-gold">Waiting for players…</p>
                <p className="mt-1 text-sm text-night-300">Scan the QR code to join. The first person to join becomes the host.</p>
              </>
            )}
          </div>

          <section>
            <SectionTitle right={<span className="text-xs font-semibold text-night-300">{connected} connected</span>}>
              Players ({players.length})
            </SectionTitle>
            {players.length === 0 ? (
              <p className="rounded-2xl bg-white/[0.03] px-4 py-6 text-center text-sm text-night-400">Nobody has joined yet.</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {players.map((p) => (
                  <motion.li key={p.id} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
                    <PlayerRow player={p} sub={p.score > 0 ? <span>{p.score} pts</span> : undefined} />
                  </motion.li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-4">
            <SectionTitle>Game settings</SectionTitle>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
              {settingsSummary(room.settings, connected, room.customPack?.name).map((row) => (
                <div key={row.label} className="min-w-0">
                  <dt className="text-xs text-night-400">{row.label}</dt>
                  <dd className="truncate font-semibold">{row.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <Button variant="outline" icon={<LogIn size={17} />} onClick={() => setJoiningHere(true)}>
            Join as a player on this device instead
          </Button>
        </div>
      </div>
    </div>
  );
}

export function DisplayRoleReveal() {
  const { room, playerById } = useRoom();
  const m = room.match!;
  const participants = m.participantIds.map((id) => playerById(id)!).filter(Boolean);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 py-6 text-center">
      <PhaseTitle
        kicker={m.practice ? 'Practice round' : `Match ${m.number}`}
        title="Check your phones!"
        sub={
          <>
            Press and hold your card to see your secret role. <b className="text-grinch">{m.grinchCount} Grinch{m.grinchCount === 1 ? '' : 'es'}</b>{' '}
            hiding among {participants.length} players.
          </>
        }
      />
      <div className="flex max-w-2xl flex-wrap justify-center gap-2">
        {participants.map((p) => {
          const ok = m.acknowledgedIds.includes(p.id);
          return (
            <span
              key={p.id}
              className={`flex h-10 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold ${
                ok ? 'bg-elf/15 text-elf-light' : 'bg-white/[0.05] text-night-400'
              }`}
            >
              {p.name} {ok && <Check size={14} strokeWidth={3} />}
            </span>
          );
        })}
      </div>
      <p className="text-sm text-night-300">The host starts the clues once everyone has seen their role.</p>
    </div>
  );
}
