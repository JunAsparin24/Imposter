import { animate, motion, useReducedMotion } from 'framer-motion';
import { AVATAR_IMAGES } from '@imposter/shared';
import { useEffect, useMemo, useState } from 'react';

/** Gentle CSS snowfall. Disabled automatically for reduced-motion users. */
export function Snowfall({ count = 36 }: { count?: number }) {
  const reduce = useReducedMotion();
  const flakes = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        size: 2 + Math.random() * 4,
        duration: 9 + Math.random() * 14,
        delay: -Math.random() * 20,
        drift: (Math.random() - 0.5) * 80,
        opacity: 0.25 + Math.random() * 0.5,
      })),
    [count],
  );
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      <div className="absolute -left-1/4 -top-1/4 h-[60vh] w-[60vh] rounded-full bg-grinch/10 blur-[110px]" />
      <div className="absolute -bottom-1/4 -right-1/4 h-[60vh] w-[60vh] rounded-full bg-elf/10 blur-[110px]" />
      <div className="absolute left-1/2 top-1/3 h-[30vh] w-[30vh] -translate-x-1/2 rounded-full bg-gold/[0.04] blur-[90px]" />
      {!reduce &&
        flakes.map((f) => (
          <span
            key={f.id}
            className="absolute top-0 animate-snowfall rounded-full bg-white"
            style={
              {
                left: `${f.left}%`,
                width: f.size,
                height: f.size,
                opacity: f.opacity,
                animationDuration: `${f.duration}s`,
                animationDelay: `${f.delay}s`,
                '--drift': `${f.drift}px`,
              } as React.CSSProperties
            }
          />
        ))}
    </div>
  );
}

export function Logo({ size = 'lg' }: { size?: 'sm' | 'md' | 'lg' }) {
  const big = size !== 'sm';
  return (
    <div className="relative select-none text-center">
      <motion.h1
        initial={{ opacity: 0, y: 12, letterSpacing: '0.3em' }}
        animate={{ opacity: 1, y: 0, letterSpacing: '0.06em' }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
        className={`heading bg-gradient-to-b from-white via-snow to-night-300 bg-clip-text text-transparent drop-shadow-[0_0_25px_rgba(255,255,255,0.15)] ${
          size === 'lg' ? 'text-[clamp(2.75rem,15vw,5.5rem)]' : size === 'md' ? 'text-[clamp(2.25rem,3.6vw,3.25rem)]' : 'text-2xl'
        }`}
      >
        IMP<span className="text-grinch [-webkit-text-fill-color:theme(colors.grinch.DEFAULT)]">O</span>STER
      </motion.h1>
      {big && (
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.5 }}
          className="mt-1 text-[clamp(0.8rem,3.2vw,1rem)] font-bold uppercase tracking-[0.4em] text-night-300"
        >
          Find the faker
        </motion.p>
      )}
    </div>
  );
}

export function Avatar({
  emoji,
  size = 44,
  ring,
  dim,
}: {
  emoji: string;
  size?: number;
  ring?: 'gold' | 'grinch' | 'elf' | null;
  dim?: boolean;
}) {
  const ringClass =
    ring === 'gold'
      ? 'ring-2 ring-gold shadow-glow-gold'
      : ring === 'grinch'
        ? 'ring-2 ring-grinch shadow-glow-red'
        : ring === 'elf'
          ? 'ring-2 ring-elf shadow-glow-green'
          : 'ring-1 ring-white/10';
  return (
    <span
      className={`grid shrink-0 place-items-center overflow-hidden rounded-full bg-night-800 ${ringClass} ${dim ? 'opacity-40 grayscale' : ''}`}
      style={{ width: size, height: size, fontSize: size * 0.52 }}
      aria-hidden
    >
      <AvatarImg id={emoji} size={size} className="scale-[1.12]" />
    </span>
  );
}

/** The pixel-art picture for an avatar id. Falls back to the emoji for unknown ids. */
export function AvatarImg({ id, size = 18, className = '' }: { id: string; size?: number; className?: string }) {
  const slug = (AVATAR_IMAGES as Record<string, string>)[id];
  if (!slug) {
    return (
      <span className={className} style={{ fontSize: size * 0.85, lineHeight: 1 }} aria-hidden>
        {id}
      </span>
    );
  }
  return (
    <img
      src={`/avatars/${slug}.webp`}
      alt=""
      aria-hidden
      draggable={false}
      width={size}
      height={size}
      className={`inline-block shrink-0 select-none object-contain align-[-0.2em] ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

/** Circular countdown. */
export function TimerRing({
  msLeft,
  totalMs,
  size = 120,
  label,
  paused,
}: {
  msLeft: number;
  totalMs: number;
  size?: number;
  label: string;
  paused?: boolean;
}) {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const frac = totalMs > 0 ? Math.min(1, msLeft / totalMs) : 0;
  const urgent = msLeft <= 10_000;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }} role="timer" aria-label={`${label} remaining`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth="7" fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={urgent ? '#ef4444' : '#f5c451'}
          strokeWidth="7"
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          style={{ transition: 'stroke-dashoffset 0.25s linear, stroke 0.3s' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center">
          <div className={`font-display tabular-nums leading-none ${urgent ? 'text-grinch' : 'text-snow'}`} style={{ fontSize: size * 0.28 }}>
            {label}
          </div>
          {paused && <div className="mt-1 text-[10px] font-bold uppercase tracking-widest text-night-300">Paused</div>}
        </div>
      </div>
    </div>
  );
}

/** Short confetti burst in festive colours. */
export function Confetti({ pieces = 70 }: { pieces?: number }) {
  const reduce = useReducedMotion();
  const items = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => ({
        id: i,
        x: (Math.random() - 0.5) * 120,
        rotate: Math.random() * 720 - 360,
        delay: Math.random() * 0.4,
        duration: 2.2 + Math.random() * 1.6,
        color: ['#ef4444', '#22c55e', '#f5c451', '#eef2f8'][i % 4],
        w: 6 + Math.random() * 6,
        h: 8 + Math.random() * 10,
      })),
    [pieces],
  );
  if (reduce) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden" aria-hidden>
      {items.map((p) => (
        <motion.span
          key={p.id}
          className="absolute left-1/2 top-[-5%] rounded-sm"
          style={{ backgroundColor: p.color, width: p.w, height: p.h }}
          initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
          animate={{ x: `${p.x}vw`, y: '115vh', rotate: p.rotate, opacity: [1, 1, 0.8] }}
          transition={{ duration: p.duration, delay: p.delay, ease: [0.2, 0.6, 0.4, 1] }}
        />
      ))}
    </div>
  );
}

/** Counts a number up from `from` to `to` (instant for reduced-motion users). */
export function CountUp({ from, to, duration = 0.9, delay = 0 }: { from: number; to: number; duration?: number; delay?: number }) {
  const reduce = useReducedMotion();
  const [value, setValue] = useState(reduce ? to : from);
  useEffect(() => {
    if (reduce || from === to) {
      setValue(to);
      return;
    }
    const controls = animate(from, to, {
      duration,
      delay,
      ease: 'easeOut',
      onUpdate: (v) => setValue(Math.round(v)),
    });
    return () => controls.stop();
  }, [from, to, duration, delay, reduce]);
  return <>{value}</>;
}
