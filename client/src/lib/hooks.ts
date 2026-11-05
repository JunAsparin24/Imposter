import { useEffect, useRef } from 'react';
import { play, vibrate } from './sound';

/**
 * Keeps the phone screen on while `active` (e.g. during a match), so nobody's phone
 * locks mid-round. Uses the Screen Wake Lock API where available; silently does nothing
 * elsewhere. The lock is dropped by the browser when the tab is hidden, so it's re-requested.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    const request = async () => {
      try {
        if (document.visibilityState !== 'visible') return;
        const l = await (navigator as Navigator & { wakeLock: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock.request('screen');
        if (cancelled) void l.release();
        else lock = l;
      } catch {
        /* not allowed (battery saver, iframe…) — fine */
      }
    };
    void request();
    document.addEventListener('visibilitychange', request);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', request);
      void lock?.release().catch(() => {});
    };
  }, [active]);
}

/** Plays a tick for each of the final `seconds` seconds of a countdown (and a buzz at zero). */
export function useFinalSecondsTick(msLeft: number | null, seconds = 5, enabled = true): void {
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (!enabled || msLeft === null) {
      last.current = null;
      return;
    }
    const s = Math.ceil(msLeft / 1000);
    if (s === last.current) return;
    const prev = last.current;
    last.current = s;
    if (prev === null) return; // don't tick on first render (e.g. after a refresh)
    if (s > 0 && s <= seconds) play('tick');
    if (s === 0) vibrate(60);
  }, [msLeft, seconds, enabled]);
}
