/**
 * Tiny synthesised sound effects (Web Audio, no audio files).
 * Audio only starts after the first user interaction, and respects both the
 * player's mute toggle and the host's "sound effects" room setting.
 */

let ctx: AudioContext | null = null;
let muted = false;
let roomEnabled = true;

function unlock() {
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
}

if (typeof window !== 'undefined') {
  const once = () => {
    unlock();
    window.removeEventListener('pointerdown', once);
    window.removeEventListener('keydown', once);
  };
  window.addEventListener('pointerdown', once);
  window.addEventListener('keydown', once);
}

export function setMuted(value: boolean) {
  muted = value;
}
export function setRoomSoundEnabled(value: boolean) {
  roomEnabled = value;
}

function tone(freq: number, start: number, duration: number, type: OscillatorType = 'sine', volume = 0.08) {
  if (!ctx) return;
  const t0 = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

/** A sleigh-bell-ish shimmer. */
function bell(freq: number, start: number, volume = 0.06) {
  tone(freq, start, 0.5, 'triangle', volume);
  tone(freq * 2.01, start, 0.3, 'sine', volume * 0.5);
}

const sounds = {
  click: () => tone(660, 0, 0.06, 'triangle', 0.04),
  join: () => {
    bell(784, 0);
    bell(1047, 0.08);
  },
  reveal: () => {
    [523, 659, 784, 1047].forEach((f, i) => bell(f, i * 0.06, 0.05));
  },
  turn: () => {
    bell(880, 0, 0.08);
    bell(1175, 0.12, 0.08);
  },
  tick: () => tone(1200, 0, 0.05, 'square', 0.025),
  vote: () => tone(520, 0, 0.12, 'triangle', 0.07),
  drumroll: () => {
    for (let i = 0; i < 10; i++) tone(110 + i * 4, i * 0.07, 0.06, 'triangle', 0.05);
  },
  grinch: () => {
    tone(220, 0, 0.35, 'sawtooth', 0.05);
    tone(155, 0.25, 0.6, 'sawtooth', 0.05);
  },
  elf: () => {
    [659, 784, 988].forEach((f, i) => bell(f, i * 0.09));
  },
  // "Jingle bells, jingle bells" opening
  win: () => {
    [659, 659, 659, 659, 659, 659, 659, 784, 523, 587, 659].forEach((f, i) =>
      bell(f, [0, 0.18, 0.36, 0.72, 0.9, 1.08, 1.44, 1.62, 1.8, 2.0, 2.2][i], 0.06),
    );
  },
  lose: () => {
    [392, 349, 311, 262].forEach((f, i) => tone(f, i * 0.18, 0.3, 'triangle', 0.06));
  },
};

export type SoundName = keyof typeof sounds;

export function play(name: SoundName) {
  if (muted || !roomEnabled || !ctx) return;
  try {
    sounds[name]();
  } catch {
    /* ignore audio errors */
  }
}

export function vibrate(pattern: number | number[]) {
  if (muted) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* ignore */
  }
}
