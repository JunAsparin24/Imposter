import type { Role, Team } from '@imposter/shared';

const NAMES: Record<Role, string> = {
  ELF: 'Innocent',
  GRINCH: 'Imposter',
  JESTER: 'Jester',
  EXECUTIONER: 'Executioner',
  DRIFTER: 'Drifter',
};

/** What each role is called on screen. */
export function roleName(role: Role | null | undefined): string {
  return role ? NAMES[role] : 'Innocent';
}

/** On nobody's team (Jester, Executioner, Drifter). */
export function isNeutral(role: Role | null | undefined): boolean {
  return role === 'JESTER' || role === 'EXECUTIONER' || role === 'DRIFTER';
}

/** "an Imposter", "an Innocent", "the Jester"... */
export function roleWithArticle(role: Role | null | undefined): string {
  return role === 'GRINCH' ? 'an Imposter' : isNeutral(role) ? `the ${roleName(role)}` : 'an Innocent';
}

/** Text colour for a role: red Imposter, gold for neutral roles, green Innocent. */
export function roleText(role: Role | null | undefined): string {
  return role === 'GRINCH' ? 'text-grinch' : isNeutral(role) ? 'text-gold' : 'text-elf';
}

/** Did a player with `role` win when `winner` won? (Side wins are separate.) */
export function wonWith(role: Role | undefined, winner: Team): boolean {
  if (!role) return false;
  if (winner === 'ELVES') return role === 'ELF';
  if (winner === 'GRINCHES') return role === 'GRINCH';
  if (winner === 'JESTER') return role === 'JESTER';
  return false;
}
