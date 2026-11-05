import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Ack, DisplaySession, PublicPlayer, SessionInfo, StateEnvelope } from '@imposter/shared';
import { emitAck, socket } from '../lib/socket';
import {
  loadDisplay,
  loadPrefs,
  loadSession,
  saveDisplay,
  saveProfile,
  savePrefs,
  saveSession,
  type Prefs,
} from '../lib/storage';
import { play, setMuted, setRoomSoundEnabled } from '../lib/sound';

export type ConnectionStatus = 'connecting' | 'connected' | 'offline';

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'error' | 'success';
}

interface GameContextValue {
  status: ConnectionStatus;
  /** True while we try to restore a saved seat / room screen on page load. */
  restoring: boolean;
  /** Set when this device is a player in a room. */
  session: SessionInfo | null;
  /** Set when this device is the room screen (it created the room). */
  display: DisplaySession | null;
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
  /** Creates an EMPTY room and turns this device into its room screen. */
  createRoom: () => Promise<Ack<DisplaySession>>;
  joinRoom: (code: string, name: string, avatar: string) => Promise<Ack<SessionInfo>>;
  leaveRoom: () => Promise<void>;
  /** Stop being the room screen (the room stays open for its players). */
  closeDisplay: () => Promise<void>;
  /** The room screen wants to join its own room as a player (shows the join form). */
  joiningHere: boolean;
  setJoiningHere: (v: boolean) => void;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ConnectionStatus>(socket.connected ? 'connected' : 'connecting');
  const [session, setSession] = useState<SessionInfo | null>(() => loadSession());
  const [display, setDisplay] = useState<DisplaySession | null>(() => (loadSession() ? null : loadDisplay()));
  const [restoring, setRestoring] = useState<boolean>(() => !!loadSession() || !!loadDisplay());
  const [state, setState] = useState<StateEnvelope | null>(null);
  const [clockOffset, setClockOffset] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [prefs, setPrefsState] = useState<Prefs>(() => loadPrefs());
  const [joiningHere, setJoiningHere] = useState(false);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const displayRef = useRef(display);
  displayRef.current = display;
  const toastId = useRef(0);
  const wasOffline = useRef(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout>>();

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
    if (s) {
      // A device is either a player or a room screen, never both.
      saveDisplay(null);
      setDisplay(null);
    } else if (!displayRef.current) {
      setState(null);
    }
  }, []);

  const storeDisplay = useCallback((d: DisplaySession | null) => {
    saveDisplay(d);
    setDisplay(d);
    if (!d && !sessionRef.current) setState(null);
  }, []);

  // Socket lifecycle: (re)authenticate whenever the connection (re)opens.
  useEffect(() => {
    const tryRestore = async () => {
      const saved = sessionRef.current;
      const screen = displayRef.current;
      if (!saved && !screen) {
        setRestoring(false);
        return;
      }
      const res = saved
        ? await emitAck<SessionInfo>('room:reconnect', { code: saved.code, token: saved.token })
        : await emitAck<DisplaySession>('room:watch', { code: screen!.code, displayToken: screen!.displayToken });
      if (res.ok) {
        if (saved) storeSession(res.data as SessionInfo);
        if (wasOffline.current) toast('Reconnected.', 'success');
      } else if (res.error.code === 'ROOM_NOT_FOUND' || res.error.code === 'INVALID_SESSION') {
        if (saved) storeSession(null);
        else storeDisplay(null);
        toast('Your previous room has ended.', 'info');
      } else {
        // Temporary problem (slow network, rate limit): keep the seat and try again shortly.
        clearTimeout(retryTimer.current);
        retryTimer.current = setTimeout(() => socket.connected && void tryRestore(), 2500);
        return;
      }
      wasOffline.current = false;
      setRestoring(false);
    };
    const onConnect = () => {
      setStatus('connected');
      void tryRestore();
    };
    const onDisconnect = (reason?: unknown) => {
      setStatus('offline');
      if (sessionRef.current || displayRef.current) wasOffline.current = true;
      // If the server dropped us on purpose, socket.io won't retry by itself.
      if (reason === 'io server disconnect') socket.connect();
    };
    // Phones suspend tabs: as soon as the game is visible / online again, reconnect right away.
    const wake = () => {
      if (document.visibilityState === 'visible' && !socket.connected) socket.connect();
    };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
    window.addEventListener('focus', wake);
    const onState = (env: StateEnvelope) => {
      setClockOffset(env.serverNow - Date.now());
      setState(env);
    };
    const onEnded = ({ reason }: { reason: string }) => {
      storeSession(null);
      storeDisplay(null);
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
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
      window.removeEventListener('focus', wake);
      clearTimeout(retryTimer.current);
    };
  }, [storeSession, storeDisplay, toast]);

  const send = useCallback<GameContextValue['send']>(
    async (event, payload = {}, opts = {}) => {
      const res = await emitAck(event, payload);
      if (!res.ok && !opts.quiet && res.error.code !== 'STALE_ACTION') toast(res.error.message, 'error');
      if (!res.ok && (res.error.code === 'INVALID_SESSION' || res.error.code === 'NOT_IN_ROOM')) storeSession(null);
      return res as Ack<never>;
    },
    [toast, storeSession],
  );

  const createRoom = useCallback(async () => {
    const res = await emitAck<DisplaySession>('room:create', {});
    if (res.ok) {
      storeDisplay(res.data);
      play('join');
    }
    return res;
  }, [storeDisplay]);

  const joinRoom = useCallback(
    async (code: string, name: string, avatar: string) => {
      saveProfile({ name, avatar });
      const res = await emitAck<SessionInfo>('room:join', { code, name, avatar });
      if (res.ok) {
        storeSession(res.data);
        setJoiningHere(false);
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

  const closeDisplay = useCallback(async () => {
    await emitAck('room:unwatch', {});
    storeDisplay(null);
  }, [storeDisplay]);

  const value = useMemo<GameContextValue>(() => {
    const me = state?.room.players.find((p) => p.id === session?.playerId);
    const active = session || display ? state : null;
    return {
      status,
      restoring,
      session,
      display,
      state: active,
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
      closeDisplay,
      joiningHere,
      setJoiningHere,
    };
  }, [status, restoring, session, display, state, clockOffset, prefs, setPrefs, toasts, toast, send, createRoom, joinRoom, leaveRoom, closeDisplay, joiningHere]);

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
  const isDisplay = state.viewer === 'display';
  return { ...g, state, me, isHost: !!me?.isHost, isDisplay, room, priv, playerById };
}
