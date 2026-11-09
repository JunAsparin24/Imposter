import type { Role, Team } from '@imposter/shared';

/** What each role is called on screen. */
export function roleName(role: Role | null | undefined): string {
  return role === 'GRINCH' ? 'Imposter' : role === 'JESTER' ? 'Jester' : 'Innocent';
}

/** Text colour for a role: red Imposter, gold Jester, green Innocent. */
export function roleText(role: Role | null | undefined): string {
  return role === 'GRINCH' ? 'text-grinch' : role === 'JESTER' ? 'text-gold' : 'text-elf';
}

/** Did a player with `role` win when `winner` won? */
export function wonWith(role: Role | undefined, winner: Team): boolean {
  if (!role) return false;
  if (winner === 'ELVES') return role === 'ELF';
  if (winner === 'GRINCHES') return role === 'GRINCH';
  if (winner === 'JESTER') return role === 'JESTER';
  return false;
}
