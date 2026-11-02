import type { SessionInfo } from '@imposter/shared';

/** localStorage helpers. Every access is wrapped: private mode / blocked storage must not break the game. */

const SESSION_KEY = 'imposter:session';
const PROFILE_KEY = 'imposter:profile';
const PREFS_KEY = 'imposter:prefs';

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export const loadSession = () => read<SessionInfo>(SESSION_KEY);
export const saveSession = (s: SessionInfo | null) => write(SESSION_KEY, s);

export interface Profile {
  name: string;
  avatar: string;
}
export const loadProfile = () => read<Profile>(PROFILE_KEY);
export const saveProfile = (p: Profile) => write(PROFILE_KEY, p);

export interface Prefs {
  muted: boolean;
  tapToToggle: boolean;
}
const DEFAULT_PREFS: Prefs = { muted: false, tapToToggle: false };
export const loadPrefs = (): Prefs => ({ ...DEFAULT_PREFS, ...(read<Partial<Prefs>>(PREFS_KEY) ?? {}) });
export const savePrefs = (p: Prefs) => write(PREFS_KEY, p);
