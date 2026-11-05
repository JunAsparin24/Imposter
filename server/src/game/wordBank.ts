import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORY_IDS, normalizeWord, type CategoryId } from '@imposter/shared';
import type { Rng } from './rng';

export interface WordEntry {
  word: string;
  /** One related word shown to every Imposter (the same hint for all of them). '' = no hint. */
  hint: string;
  category: CategoryId | 'practice';
}

type RawWord = [string, string];

const WORDS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'words');

/**
 * Loads the local JSON word packs (one file per category, see src/words). Each entry is
 * `[word, hint]`. `practice.json` holds the easy everyday words for practice rounds.
 * Adding a category = drop a new JSON file in and register its id in shared/constants.
 */
export class WordBank {
  private readonly byCategory = new Map<CategoryId, WordEntry[]>();
  private practiceWords: WordEntry[] = [];

  constructor(dir: string = WORDS_DIR) {
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.json')) continue;
      const data = JSON.parse(readFileSync(join(dir, file), 'utf8')) as { id: string; words: RawWord[] };
      const isPractice = data.id === 'practice';
      if (!isPractice && (!CATEGORY_IDS.includes(data.id as CategoryId) || data.id === 'random' || data.id === 'custom')) {
        throw new Error(`Unknown word category "${data.id}" in ${file}`);
      }
      const seen = new Set<string>();
      const entries: WordEntry[] = [];
      for (const raw of data.words) {
        if (!Array.isArray(raw) || typeof raw[0] !== 'string') throw new Error(`Bad entry in ${file}: ${JSON.stringify(raw)}`);
        const key = normalizeWord(raw[0]);
        if (!key || seen.has(key)) continue; // skip empty/duplicate entries
        seen.add(key);
        entries.push({ word: raw[0], hint: raw[1] ?? '', category: isPractice ? 'practice' : (data.id as CategoryId) });
      }
      if (isPractice) this.practiceWords = entries;
      else this.byCategory.set(data.id as CategoryId, entries);
    }
  }

  categories(): CategoryId[] {
    return [...this.byCategory.keys()];
  }

  count(category: CategoryId): number {
    return this.byCategory.get(category)?.length ?? 0;
  }

  words(category: CategoryId): WordEntry[] {
    return [...(this.byCategory.get(category) ?? [])];
  }

  practice(): WordEntry[] {
    return [...this.practiceWords];
  }

  /** All candidate words for a selection ('random' = every built-in category), de-duplicated by word. */
  pool(categories: CategoryId[], custom: WordEntry[] = []): WordEntry[] {
    const builtIn = categories.filter((c) => c !== 'custom');
    const ids = categories.includes('random') || categories.length === 0 ? this.categories() : builtIn;
    const seen = new Set<string>();
    const out: WordEntry[] = [];
    const sources = [...ids.map((id) => this.byCategory.get(id) ?? []), categories.includes('custom') ? custom : []];
    for (const list of sources) {
      for (const entry of list) {
        const key = normalizeWord(entry.word);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(entry);
      }
    }
    return out;
  }

  /** Picks a word, avoiding `recent` (normalised words) when possible. */
  pick(categories: CategoryId[], recent: Iterable<string>, rng: Rng, custom: WordEntry[] = []): WordEntry {
    return pickFrom(this.pool(categories, custom), recent, rng);
  }

  pickPractice(recent: Iterable<string>, rng: Rng): WordEntry {
    return pickFrom(this.practiceWords, recent, rng);
  }
}

function pickFrom(all: WordEntry[], recent: Iterable<string>, rng: Rng): WordEntry {
  if (all.length === 0) throw new Error('No words available for the selected categories');
  const recentSet = new Set(recent);
  const fresh = all.filter((w) => !recentSet.has(normalizeWord(w.word)));
  const pool = fresh.length > 0 ? fresh : all;
  return pool[rng.int(pool.length)];
}
