import { AnimatePresence, motion, useIsPresent } from 'framer-motion';
import { useEffect, useRef } from 'react';
import type { Phase } from '@imposter/shared';
import { RoomHeader } from '../components/RoomChrome';
import { Spinner } from '../components/ui';
import { useWakeLock } from '../lib/hooks';
import { playMusic, stopMusic } from '../lib/music';
import { play, vibrate } from '../lib/sound';
import { FrozenStateContext, useGame, useRoom } from '../state/GameProvider';
import { DisplayLobby, DisplayRoleReveal } from './DisplayScreens';
import { Lobby } from './Lobby';
import { RoundResultsScreen, ScoreboardScreen } from './ResultScreens';
import { ClueScreen, DiscussionScreen, RoleRevealScreen } from './RoundScreens';
import { FinalGuessScreen, VoteResultsScreen, VotingScreen } from './VoteScreens';

const SCREENS: Record<Phase, () => JSX.Element> = {
  LOBBY: Lobby,
  ROLE_REVEAL: RoleRevealScreen,
  CLUE: ClueScreen,
  DISCUSSION: DiscussionScreen,
  VOTING: VotingScreen,
  VOTE_RESULTS: VoteResultsScreen,
  FINAL_GUESS: FinalGuessScreen,
  ROUND_RESULTS: RoundResultsScreen,
  SCOREBOARD: ScoreboardScreen,
};

const DISPLAY_SCREENS: Partial<Record<Phase, () => JSX.Element>> = {
  LOBBY: DisplayLobby,
  ROLE_REVEAL: DisplayRoleReveal,
};

/** Screens that use a wider two-column layout on laptops (the host's screen is often a laptop). */
const WIDE_PHASES: Phase[] = ['LOBBY'];

export function GameRoom() {
  const { room, status, isDisplay } = useRoom();
  // The room screen has its own lobby and role-reveal views; everything else is shared.
  const Screen = (isDisplay && DISPLAY_SCREENS[room.phase]) || SCREENS[room.phase];
  usePhaseFeedback();
  useWakeLock(isDisplay || room.phase !== 'LOBBY');
  useRoomMusic(isDisplay);
  const announcement = useAnnouncement();

  // A screen is re-mounted on each phase change *and* each new vote (so a revote animates in).
  const screenKey = `${room.phase}-${room.match?.vote?.id ?? ''}-${room.match?.number ?? 0}`;
  // The room screen is usually a laptop/TV, so it always gets the wide layout.
  const wide = isDisplay || WIDE_PHASES.includes(room.phase);

  return (
    <div className="flex min-h-dvh flex-col">
      <RoomHeader />
      <AnimatePresence>
        {status !== 'connected' && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden bg-grinch/15"
            role="status"
          >
            <p className="mx-auto flex max-w-xl items-center justify-center gap-2 px-4 py-2 text-center text-sm font-semibold text-grinch-light">
              <Spinner /> Reconnecting… your seat, role and score are saved.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Screen-reader announcements of what's happening (visually hidden). */}
      <p className="sr-only" aria-live="assertive" aria-atomic="true">
        {announcement}
      </p>
      <main
        className={`mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-5 md:max-w-xl ${wide ? 'lg:max-w-5xl' : ''} ${
          status !== 'connected' ? 'pointer-events-none opacity-60 transition-opacity' : ''
        }`}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={screenKey}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.22 }}
            className="flex flex-1 flex-col"
          >
            <PhaseFrame>
              <Screen />
            </PhaseFrame>
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

/** Live state while on screen; the last state it saw while animating out. */
function PhaseFrame({ children }: { children: React.ReactNode }) {
  const { state } = useGame();
  const isPresent = useIsPresent();
  const snapshot = useRef(state);
  if (isPresent && state) snapshot.current = state;
  return <FrozenStateContext.Provider value={snapshot.current}>{children}</FrozenStateContext.Provider>;
}

/**
 * Background music on the room screen: normal volume in the lobby and between rounds,
 * quieter while people are giving clues or arguing so everyone can hear each other.
 */
function useRoomMusic(isDisplay: boolean) {
  const { room, prefs } = useRoom();
  const on = isDisplay && prefs.music && !prefs.muted && room.settings.soundEnabled;
  const talking = room.phase === 'CLUE' || room.phase === 'DISCUSSION' || room.phase === 'FINAL_GUESS';
  useEffect(() => {
    if (on) playMusic(talking ? 0.12 : 0.35);
    else stopMusic();
  }, [on, talking]);
  useEffect(() => () => stopMusic(), []);
}

/** A short spoken summary of the current moment, for screen-reader users. */
function useAnnouncement(): string {
  const { room, session, playerById } = useRoom();
  const m = room.match;
  const me = session?.playerId;
  switch (room.phase) {
    case 'ROLE_REVEAL':
      return 'The match has started. Press and hold your role card to see your secret role.';
    case 'CLUE': {
      const speaker = playerById(m?.currentSpeakerId);
      if (!speaker) return '';
      return speaker.id === me ? "It's your turn. Say one word out loud." : `${speaker.name} is speaking.`;
    }
    case 'DISCUSSION':
      return 'Discussion time. Talk about who might be an Imposter.';
    case 'VOTING':
      return m?.vote?.isRevote ? 'Revote between the tied players.' : 'Voting has started. Choose who you think is an Imposter.';
    case 'VOTE_RESULTS': {
      const r = m?.lastResult;
      if (!r) return '';
      if (r.kind === 'ELIMINATED' || r.kind === 'ACCUSED') {
        return r.playerIds
          .map((id) => `${playerById(id)?.name ?? 'Someone'} was ${r.roles[id] === 'GRINCH' ? 'an Imposter' : 'an Innocent'}.`)
          .join(' ');
      }
      return r.kind === 'TIE' ? 'It is a tie. A revote is coming.' : 'Nobody was eliminated.';
    }
    case 'FINAL_GUESS':
      return 'The caught Imposter is making one final guess at the secret word.';
    case 'ROUND_RESULTS':
      return m?.results
        ? `${m.results.winner === 'ELVES' ? 'The Innocents win' : m.results.winner === 'NONE' ? 'Nobody wins' : 'The Imposters win'}. The secret word was ${m.results.word}.`
        : '';
    case 'SCOREBOARD':
      return 'Scoreboard.';
    default:
      return '';
  }
}

/** Sounds + haptics on key moments. */
function usePhaseFeedback() {
  const { room, session } = useRoom();
  const phase = room.phase;
  const prevPhase = useRef(phase);
  const prevSpeaker = useRef<string | null>(null);
  const prevPlayers = useRef(room.players.length);
  const speaker = room.match?.currentSpeakerId ?? null;

  useEffect(() => {
    if (prevPhase.current === phase) return;
    prevPhase.current = phase;
    if (phase === 'ROLE_REVEAL') {
      play('reveal');
      vibrate([40, 60, 40]);
    } else if (phase === 'DISCUSSION') play('elf');
    else if (phase === 'VOTING') {
      play('vote');
      vibrate(40);
    } else if (phase === 'ROUND_RESULTS') {
      const res = room.match?.results;
      const mine = res?.players.find((p) => p.id === session?.playerId);
      const won = res?.winner !== 'NONE' && (!mine || (mine.role === 'ELF') === (res?.winner === 'ELVES'));
      play(won ? 'win' : 'lose');
    }
  }, [phase, room.match?.results, session?.playerId]);

  useEffect(() => {
    if (speaker && speaker !== prevSpeaker.current && speaker === session?.playerId) {
      play('turn');
      vibrate([80, 50, 80]);
    }
    prevSpeaker.current = speaker;
  }, [speaker, session?.playerId]);

  useEffect(() => {
    if (room.phase === 'LOBBY' && room.players.length > prevPlayers.current) play('join');
    prevPlayers.current = room.players.length;
  }, [room.players.length, room.phase]);
}
