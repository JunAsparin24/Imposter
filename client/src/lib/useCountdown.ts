import { useEffect, useState } from 'react';

/**
 * Milliseconds left until a server-clock deadline. `clockOffset` = serverNow - clientNow,
 * so phones with a wrong clock still show the right countdown.
 */
export function useCountdown(deadline: number | null, clockOffset: number, pausedMs: number | null = null): number | null {
  const compute = () => {
    if (pausedMs !== null) return pausedMs;
    if (deadline === null) return null;
    return Math.max(0, deadline - (Date.now() + clockOffset));
  };
  const [left, setLeft] = useState(compute);
  useEffect(() => {
    setLeft(compute());
    if (deadline === null || pausedMs !== null) return;
    const id = setInterval(() => setLeft(compute()), 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline, clockOffset, pausedMs]);
  return left;
}

export function formatSeconds(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}`;
}
