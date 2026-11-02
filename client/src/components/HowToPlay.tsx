import { SCORING } from '@imposter/shared';

const steps = [
  {
    emoji: '🎁',
    title: 'Get your secret role',
    body: 'Most players are Elves and get the same Christmas secret word. One or more players are Grinches — they don\'t get the word, but they know who the other Grinches are.',
  },
  {
    emoji: '🗣️',
    title: 'Give one-word clues',
    body: 'Take turns saying ONE word out loud that relates to the secret word. Elves: be clear enough to prove you know it, but vague enough that the Grinch can\'t guess it.',
  },
  {
    emoji: '🕵️',
    title: 'Discuss',
    body: 'Talk it out. Whose clue was suspicious? Who sounded like they were bluffing?',
  },
  {
    emoji: '🗳️',
    title: 'Vote in secret',
    body: 'Everyone votes on their own phone. The most-voted player is out and their role is revealed. Ties get a revote.',
  },
  {
    emoji: '🎯',
    title: 'One last chance',
    body: 'A caught Grinch can guess the secret word. If they get it right, the Grinches steal Christmas!',
  },
];

export function HowToPlay() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-2xl border border-elf/30 bg-elf/10 p-3.5">
          <p className="heading text-lg text-elf">🧝 Elves</p>
          <p className="mt-1 text-xs leading-relaxed text-snow/80">Know the word. Find and vote out every Grinch.</p>
        </div>
        <div className="rounded-2xl border border-grinch/30 bg-grinch/10 p-3.5">
          <p className="heading text-lg text-grinch">😈 Grinches</p>
          <p className="mt-1 text-xs leading-relaxed text-snow/80">Don't know the word. Blend in until you equal the Elves.</p>
        </div>
      </div>
      <ol className="space-y-2.5">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-3 rounded-2xl bg-white/[0.03] p-3.5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-night-700 text-xl" aria-hidden>
              {s.emoji}
            </span>
            <div>
              <p className="font-bold">
                <span className="text-night-400">{i + 1}.</span> {s.title}
              </p>
              <p className="mt-0.5 text-sm leading-relaxed text-night-300">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="rounded-2xl bg-white/[0.03] p-3.5 text-sm text-night-300">
        <p className="mb-1 font-bold text-snow">Scoring</p>
        Elves win: <b className="text-elf">+{SCORING.ELF_WIN}</b> · Grinches win: <b className="text-grinch">+{SCORING.GRINCH_WIN}</b> · Each
        vote for a Grinch: <b className="text-snow">+{SCORING.CORRECT_VOTE}</b> · Correct final guess: <b className="text-gold">+{SCORING.FINAL_GUESS_BONUS}</b>
      </div>
    </div>
  );
}
