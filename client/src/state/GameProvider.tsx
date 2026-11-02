import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Ack, PublicPlayer, SessionInfo, StateEnvelope } from '@imposter/shared';
import { emitAck, socket } from '../lib/socket';
import { loadPrefs, loadSession, saveProfile, savePrefs, saveSession, type Prefs } from '../lib/storage';
import { play, setMuted, setRoomSoundEnabled } from '../lib/sound';

export type ConnectionStatus = 'connecting' | 'connected' | 'offline';

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'error' | 'success';
}

interface GameContextValue {
  status: ConnectionStatus;
  /** True while we try to restore a saved session on page load. */
  restoring: boolean;
  session: SessionInfo | null;
  state: StateEnvelope | null;
  /** serverNow - clientNow, used to render server deadlines correctly. */
  clockOffset: number;
  me: PublicPlayer | undefined;
  isHost: boolean;
  prefs: Prefs;
  setPrefs: (p: Partial<Prefs>) => void;
  toasts: Toast[];
  toast: (text: string, tone?: Toast['tone']) => void;
  /** Sends an action; shows an error toast automatically on failure. */
  send: <T = null>(event: Parameters<typeof emitAck>[0], payload?: unknown, opts?: { quiet?: boolean }) => Promise<Ack<T>>;
  createRoom: (name: string, avatar: string) => Promise<Ack<SessionInfo>>;
  joinRoom: (code: string, name: string, avatar: string) => Promise<Ack<SessionInfo>>;
  leaveRoom: () => Promise<void>;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ConnectionStatus>(socket.connected ? 'connected' : 'connecting');
  const [session, setSession] = useState<SessionInfo | null>(() => loadSession());
  const [restoring, setRestoring] = useState<boolean>(() => !!loadSession());
  const [state, setState] = useState<StateEnvelope | null>(null);
  const [clockOffset, setClockOffset] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [prefs, setPrefsState] = useState<Prefs>(() => loadPrefs());
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const toastId = useRef(0);

  const toast = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);

  const setPrefs = useCallback((patch: Partial<Prefs>) => {
    setPrefsState((p) => {
      const next = { ...p, ...patch };
      savePrefs(next);
      return next;
    });
  }, []);

  useEffect(() => setMuted(prefs.muted), [prefs.muted]);
  useEffect(() => setRoomSoundEnabled(state?.room.settings.soundEnabled ?? true), [state?.room.settings.soundEnabled]);

  const storeSession = useCallback((s: SessionInfo | null) => {
    saveSession(s);
    setSession(s);
    if (!s) setState(null);
  }, []);

  // Socket lifecycle: (re)authenticate with the saved token whenever the connection (re)opens.
  useEffect(() => {
    const tryRestore = async () => {
      const saved = sessionRef.current;
      if (!saved) {
        setRestoring(false);
        return;
      }
      const res = await emitAck<SessionInfo>('room:reconnect', { code: saved.code, token: saved.token });
      if (res.ok) {
        storeSession(res.data);
      } else if (res.error.code === 'ROOM_NOT_FOUND' || res.error.code === 'INVALID_SESSION') {
        storeSession(null);
        toast('Your previous room has ended.', 'info');
      }
      setRestoring(false);
    };
    const onConnect = () => {
      setStatus('connected');
      void tryRestore();
    };
    const onDisconnect = () => setStatus('offline');
    const onState = (env: StateEnvelope) => {
      setClockOffset(env.serverNow - Date.now());
      setState(env);
    };
    const onEnded = ({ reason }: { reason: string }) => {
      storeSession(null);
      if (reason === 'KICKED') toast('You were removed from the room by the host.', 'error');
      else if (reason === 'REPLACED') toast('You opened this game somewhere else, so this tab was disconnected.', 'info');
      else toast('The room was closed after being inactive.', 'info');
    };
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onDisconnect);
    socket.on('game:stateUpdated', onState);
    socket.on('session:ended', onEnded);
    if (socket.connected) onConnect();
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onDisconnect);
      socket.off('game:stateUpdated', onState);
      socket.off('session:ended', onEnded);
    };
  }, [storeSession, toast]);

  const send = useCallback<GameContextValue['send']>(
    async (event, payload = {}, opts = {}) => {
      const res = await emitAck(event, payload);
      if (!res.ok && !opts.quiet && res.error.code !== 'STALE_ACTION') toast(res.error.message, 'error');
      if (!res.ok && (res.error.code === 'INVALID_SESSION' || res.error.code === 'NOT_IN_ROOM')) storeSession(null);
      return res as Ack<never>;
    },
    [toast, storeSession],
  );

  const createRoom = useCallback(
    async (name: string, avatar: string) => {
      saveProfile({ name, avatar });
      const res = await emitAck<SessionInfo>('room:create', { name, avatar });
      if (res.ok) {
        storeSession(res.data);
        play('join');
      }
      return res;
    },
    [storeSession],
  );

  const joinRoom = useCallback(
    async (code: string, name: string, avatar: string) => {
      saveProfile({ name, avatar });
      const res = await emitAck<SessionInfo>('room:join', { code, name, avatar });
      if (res.ok) {
        storeSession(res.data);
        play('join');
      }
      return res;
    },
    [storeSession],
  );

  const leaveRoom = useCallback(async () => {
    await emitAck('room:leave', {});
    storeSession(null);
  }, [storeSession]);

  const value = useMemo<GameContextValue>(() => {
    const me = state?.room.players.find((p) => p.id === session?.playerId);
    return {
      status,
      restoring,
      session,
      state: session ? state : null,
      clockOffset,
      me,
      isHost: !!me && me.isHost,
      prefs,
      setPrefs,
      toasts,
      toast,
      send,
      createRoom,
      joinRoom,
      leaveRoom,
    };
  }, [status, restoring, session, state, clockOffset, prefs, setPrefs, toasts, toast, send, createRoom, joinRoom, leaveRoom]);

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used inside GameProvider');
  return ctx;
}

/**
 * Lets a screen that is animating out keep rendering the state it was showing,
 * instead of the next phase's state (which it may not understand).
 */
export const FrozenStateContext = createContext<StateEnvelope | null>(null);

/** Convenience for in-room screens: state is guaranteed. */
export function useRoom() {
  const g = useGame();
  const frozen = useContext(FrozenStateContext);
  const state = frozen ?? g.state;
  if (!state) throw new Error('useRoom used outside a room');
  const { room, me: priv } = state;
  const playerById = (id: string | null | undefined) => room.players.find((p) => p.id === id);
  const me = room.players.find((p) => p.id === g.session?.playerId);
  return { ...g, state, me, isHost: !!me?.isHost, room, priv, playerById };
}
