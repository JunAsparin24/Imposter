import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORY_IDS, normalizeWord, type CategoryId } from '@imposter/shared';
import type { Rng } from './rng';

export interface WordEntry {
  word: string;
  /** Explicitly authored alternative answers accepted for the final guess. */
  aliases: string[];
  category: CategoryId;
}

type RawWord = string | { word: string; aliases?: string[] };

const WORDS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'words');

/**
 * Loads the local JSON word packs (one file per category, see src/words).
 * Adding a category = drop a new JSON file in and register its id in shared/constants.
 */
export class WordBank {
  private readonly byCategory = new Map<CategoryId, WordEntry[]>();

  constructor(dir: string = WORDS_DIR) {
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.json') || file.startsWith('undercover')) continue;
      const data = JSON.parse(readFileSync(join(dir, file), 'utf8')) as { id: CategoryId; words: RawWord[] };
      if (!CATEGORY_IDS.includes(data.id) || data.id === 'random') {
        throw new Error(`Unknown word category "${data.id}" in ${file}`);
      }
      const seen = new Set<string>();
      const entries: WordEntry[] = [];
      for (const raw of data.words) {
        const entry: WordEntry =
          typeof raw === 'string'
            ? { word: raw, aliases: [], category: data.id }
            : { word: raw.word, aliases: raw.aliases ?? [], category: data.id };
        const key = normalizeWord(entry.word);
        if (!key || seen.has(key)) continue; // skip empty/duplicate entries
        seen.add(key);
        entries.push(entry);
      }
      this.byCategory.set(data.id, entries);
    }
  }

  categories(): CategoryId[] {
    return [...this.byCategory.keys()];
  }

  count(category: CategoryId): number {
    return this.byCategory.get(category)?.length ?? 0;
  }

  /** All candidate words for a selection ('random' = every category), de-duplicated by word. */
  pool(categories: CategoryId[]): WordEntry[] {
    const ids = categories.includes('random') || categories.length === 0 ? this.categories() : categories;
    const seen = new Set<string>();
    const out: WordEntry[] = [];
    for (const id of ids) {
      for (const entry of this.byCategory.get(id) ?? []) {
        const key = normalizeWord(entry.word);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(entry);
      }
    }
    return out;
  }

  /** Picks a word, avoiding `recent` (normalised words) when possible. */
  pick(categories: CategoryId[], recent: Iterable<string>, rng: Rng): WordEntry {
    const all = this.pool(categories);
    if (all.length === 0) throw new Error('No words available for the selected categories');
    const recentSet = new Set(recent);
    const fresh = all.filter((w) => !recentSet.has(normalizeWord(w.word)));
    const pool = fresh.length > 0 ? fresh : all;
    return pool[rng.int(pool.length)];
  }
}

/** True when the guess matches the secret word or one of its authored aliases (no fuzzy matching). */
export function isCorrectGuess(entry: WordEntry, guess: string): boolean {
  const g = normalizeWord(guess);
  if (!g) return false;
  return [entry.word, ...entry.aliases].some((w) => normalizeWord(w) === g);
}
