import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, Crown, KeyRound, LogOut, Menu, Settings2, UserX, Users, WifiOff } from 'lucide-react';
import { useState } from 'react';
import type { PublicPlayer } from '@imposter/shared';
import { useGame, useRoom } from '../state/GameProvider';
import { Avatar } from './decor';
import { HowToPlay } from './HowToPlay';
import { RoleCard } from './RoleCard';
import { SettingsSheet } from './SettingsSheet';
import { Button, ConfirmButton, Sheet, Toggle } from './ui';

const LIVE_PHASES = ['ROLE_REVEAL', 'CLUE', 'DISCUSSION', 'VOTING', 'VOTE_RESULTS', 'FINAL_GUESS'];

export function RoomHeader() {
  const { room, priv, isHost, isDisplay, status, prefs, setPrefs, leaveRoom, closeDisplay, send, toast } = useRoom();
  const [menu, setMenu] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [playersOpen, setPlayersOpen] = useState(false);
  const live = LIVE_PHASES.includes(room.phase);
  const m = room.match;

  const subtitle =
    room.phase === 'LOBBY'
      ? 'Lobby'
      : m
        ? m.practice ? 'Practice' : m.round > 0 && live ? `Round ${m.round}` : `Match ${m.number}`
        : '';

  return (
    <>
      <header className="pt-safe sticky top-0 z-30 border-b border-white/[0.05] bg-night-950/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-4">
          <button
            onClick={() => {
              void navigator.clipboard?.writeText(room.code).then(() => toast('Room code copied!', 'success'));
            }}
            className="rounded-xl bg-white/[0.05] px-3 py-1.5 font-display text-sm tracking-[0.2em] text-gold"
            aria-label={`Room code ${room.code}. Tap to copy.`}
          >
            {room.code}
          </button>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-night-300">{subtitle}</span>
          {status !== 'connected' && (
            <span className="flex items-center gap-1 rounded-full bg-grinch/15 px-2 py-1 text-xs font-bold text-grinch-light" role="status">
              <WifiOff size={13} /> Offline
            </span>
          )}
          {live && priv.role && (
            <Button size="sm" variant="outline" icon={<KeyRound size={16} />} onClick={() => setRoleOpen(true)} aria-label="View my secret role">
              <span className="hidden min-[360px]:inline">My role</span>
            </Button>
          )}
          <button
            onClick={() => setMenu(true)}
            className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.05] text-snow"
            aria-label="Open menu"
          >
            <Menu size={19} />
          </button>
        </div>
      </header>

      <Sheet open={roleOpen} onClose={() => setRoleOpen(false)} title="Your secret role">
        <RoleCard priv={priv} compact />
      </Sheet>

      <Sheet open={menu} onClose={() => setMenu(false)} title="Menu">
        <div className="space-y-3">
          <Toggle
            checked={!prefs.muted}
            onChange={(v) => setPrefs({ muted: !v })}
            label={prefs.muted ? 'Sound off (just me)' : 'Sound on'}
            description={room.settings.soundEnabled ? undefined : 'The host has turned sound effects off for the room.'}
          />
          <Button
            block
            variant="outline"
            icon={<Settings2 size={18} />}
            onClick={() => {
              setMenu(false);
              setSettingsOpen(true);
            }}
          >
            {isHost ? 'Game settings' : 'View game settings'}
          </Button>
          <Button
            block
            variant="outline"
            icon={<BookOpen size={18} />}
            onClick={() => {
              setMenu(false);
              setRulesOpen(true);
            }}
          >
            How to play
          </Button>
          {isHost && (
            <Button
              block
              variant="outline"
              icon={<Users size={18} />}
              onClick={() => {
                setMenu(false);
                setPlayersOpen(true);
              }}
            >
              Manage players
            </Button>
          )}
          {isHost && m && !m.results && (
            <ConfirmButton
              block
              variant="outline"
              onConfirm={() => {
                setMenu(false);
                void send('game:returnToLobby');
              }}
              confirmLabel="Tap again: end match, no points"
            >
              End match & return to lobby
            </ConfirmButton>
          )}
          <ConfirmButton
            block
            variant="ghost"
            icon={<LogOut size={18} />}
            className="!text-grinch-light"
            onConfirm={() => {
              setMenu(false);
              void (isDisplay ? closeDisplay() : leaveRoom());
            }}
            confirmLabel={isDisplay ? "Tap again to close (the game keeps going)" : "Tap again to leave"}
          >
            {isDisplay ? "Close room screen" : "Leave room"}
          </ConfirmButton>
        </div>
      </Sheet>

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <Sheet open={rulesOpen} onClose={() => setRulesOpen(false)} title="How to play">
        <HowToPlay />
      </Sheet>
      <Sheet open={playersOpen && isHost} onClose={() => setPlayersOpen(false)} title="Manage players">
        <p className="mb-3 text-sm text-night-300">
          Kicking someone mid-match takes them out of the game and reveals their role.
        </p>
        <ul className="space-y-2">
          {room.players
            .filter((p) => p.status !== 'LEFT')
            .map((p) => (
              <li key={p.id}>
                <PlayerRow
                  player={p}
                  isMe={p.isHost}
                  right={
                    !p.isHost && (
                      <div className="flex items-center gap-1">
                        {p.connected && (
                          <ConfirmButton
                            size="sm"
                            variant="ghost"
                            className="!h-9 !px-2"
                            title="Make host"
                            aria-label={`Make ${p.name} the host`}
                            confirmLabel="Host?"
                            onConfirm={() => {
                              setPlayersOpen(false);
                              void send('room:transferHost', { playerId: p.id });
                            }}
                          >
                            <Crown size={16} />
                          </ConfirmButton>
                        )}
                        <ConfirmButton
                          size="sm"
                          variant="ghost"
                          className="!h-9 !px-2"
                          title="Kick"
                          aria-label={`Kick ${p.name}`}
                          confirmLabel="Kick?"
                          onConfirm={() => void send('room:kick', { playerId: p.id })}
                        >
                          <UserX size={16} />
                        </ConfirmButton>
                      </div>
                    )
                  }
                />
              </li>
            ))}
        </ul>
      </Sheet>
    </>
  );
}

export function Toasts() {
  const { toasts } = useGame();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(var(--safe-top)+4rem)] z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: -12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8 }}
            className={`pointer-events-auto max-w-sm rounded-2xl px-4 py-3 text-sm font-semibold shadow-xl ${
              t.tone === 'error'
                ? 'bg-grinch text-white'
                : t.tone === 'success'
                  ? 'bg-elf text-night-950'
                  : 'bg-night-700 text-snow ring-1 ring-white/10'
            }`}
          >
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/** A player row/chip used across screens. */
export function PlayerRow({
  player,
  isMe,
  right,
  highlight,
  sub,
}: {
  player: PublicPlayer;
  isMe?: boolean;
  right?: React.ReactNode;
  highlight?: 'gold' | 'grinch' | 'elf' | null;
  sub?: React.ReactNode;
}) {
  const out = player.status === 'ELIMINATED' || player.status === 'LEFT';
  return (
    <div
      className={`flex min-h-[60px] items-center gap-3 rounded-2xl px-3 py-2 ${
        highlight === 'gold' ? 'bg-gold/10 ring-1 ring-gold/40' : 'bg-white/[0.035]'
      }`}
    >
      <div className="relative">
        <Avatar emoji={player.avatar} size={42} ring={highlight ?? (player.revealedRole === 'GRINCH' ? 'grinch' : null)} dim={out || !player.connected} />
        {player.isHost && (
          <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-gold text-night-950" title="Host">
            <Crown size={11} strokeWidth={3} />
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`truncate font-bold ${out ? 'text-night-400 line-through decoration-2' : ''}`}>
          {player.name}
          {isMe && <span className="ml-1.5 text-xs font-semibold text-night-400">(you)</span>}
        </p>
        <div className="flex flex-wrap items-center gap-x-2 text-xs text-night-300">
          {!player.connected && player.status !== 'LEFT' && <span className="text-grinch-light">Reconnecting…</span>}
          {player.status === 'LEFT' && <span>Left the game</span>}
          {player.revealedRole && (
            <span className={player.revealedRole === 'GRINCH' ? 'font-bold text-grinch' : 'font-bold text-elf'}>
              {player.revealedRole === 'GRINCH' ? 'Imposter' : 'Innocent'}
            </span>
          )}
          {sub}
        </div>
      </div>
      {right}
    </div>
  );
}
