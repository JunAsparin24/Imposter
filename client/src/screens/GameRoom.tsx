import { AnimatePresence, motion, useIsPresent } from 'framer-motion';
import { useEffect, useRef } from 'react';
import type { Phase } from '@imposter/shared';
import { RoomHeader } from '../components/RoomChrome';
import { play, vibrate } from '../lib/sound';
import { FrozenStateContext, useGame, useRoom } from '../state/GameProvider';
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

export function GameRoom() {
  const { room } = useRoom();
  const Screen = SCREENS[room.phase];
  usePhaseFeedback();

  // A screen is re-mounted on each phase change *and* each new vote (so a revote animates in).
  const screenKey = `${room.phase}-${room.match?.vote?.id ?? ''}-${room.match?.number ?? 0}`;

  return (
    <div className="flex min-h-dvh flex-col">
      <RoomHeader />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-5 md:max-w-xl">
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
      const won = !mine || (mine.role === 'ELF') === (res?.winner === 'ELVES');
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
