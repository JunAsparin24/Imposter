/**
 * Background music for the ROOM SCREEN only (the laptop/TV). Phones never play it, so a room
 * full of phones doesn't end up with eight copies playing out of sync.
 *
 * Browsers only allow audio after the user has interacted with the page; the room screen has
 * always been clicked ("Create Room"), and a failed play() is simply retried on the next tap.
 */

const SRC = '/music/background.mp3';
const FADE_MS = 600;

let audio: HTMLAudioElement | null = null;
let target = 0;
let fadeTimer: ReturnType<typeof setInterval> | null = null;
let wanted = false;

function el(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio(SRC);
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = 0;
  }
  return audio;
}

function fadeTo(volume: number, then?: () => void) {
  const a = el();
  target = volume;
  if (fadeTimer) clearInterval(fadeTimer);
  const step = 0.04;
  fadeTimer = setInterval(() => {
    const diff = target - a.volume;
    if (Math.abs(diff) <= step) {
      a.volume = target;
      if (fadeTimer) clearInterval(fadeTimer);
      fadeTimer = null;
      then?.();
    } else {
      a.volume = Math.min(1, Math.max(0, a.volume + Math.sign(diff) * step));
    }
  }, FADE_MS / (1 / step));
}

function tryPlay() {
  const a = el();
  void a.play().catch(() => {
    // Autoplay blocked: start on the next click/tap/key instead.
    const retry = () => {
      window.removeEventListener('pointerdown', retry);
      window.removeEventListener('keydown', retry);
      if (wanted) void a.play().catch(() => {});
    };
    window.addEventListener('pointerdown', retry);
    window.addEventListener('keydown', retry);
  });
}

/** Play (or keep playing) at `volume` (0–1). */
export function playMusic(volume: number) {
  wanted = true;
  const a = el();
  if (a.paused) tryPlay();
  fadeTo(volume);
}

/** Fade out and pause. */
export function stopMusic() {
  wanted = false;
  if (!audio) return;
  fadeTo(0, () => {
    if (!wanted) audio?.pause();
  });
}
