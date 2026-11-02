import { MotionConfig } from 'framer-motion';
import { Snowfall, Logo } from './components/decor';
import { Toasts } from './components/RoomChrome';
import { Button, Spinner } from './components/ui';
import { GameRoom } from './screens/GameRoom';
import { Home } from './screens/Home';
import { useGame } from './state/GameProvider';

export function App() {
  const { session, state, restoring, status, leaveRoom } = useGame();

  let content;
  if (session && state) {
    content = <GameRoom />;
  } else if (session && (restoring || status !== 'connected' || !state)) {
    // We have a saved seat: wait for the server to restore it (refresh / flaky signal).
    content = (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
        <Logo size="sm" />
        <p className="flex items-center gap-2 text-night-300" role="status">
          <Spinner /> {status === 'connected' ? 'Rejoining your room…' : 'Reconnecting…'}
        </p>
        <Button variant="ghost" size="sm" onClick={() => void leaveRoom()}>
          Cancel and go home
        </Button>
      </div>
    );
  } else {
    content = <Home />;
  }

  return (
    <MotionConfig reducedMotion="user">
      <Snowfall />
      {content}
      <Toasts />
    </MotionConfig>
  );
}
