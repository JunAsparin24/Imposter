import { MODES, SCORING } from '@imposter/shared';

const steps = [
  {
    title: 'Set up',
    body: 'Open the site on a laptop or TV and hit Create Room. Everyone else joins on their phone with the code. Whoever joins first is the host.',
  },
  {
    title: 'Check your role',
    body: "Hold your card to peek. Innocents see the secret word. Imposters only see a hint word, plus who the other Imposters are.",
  },
  {
    title: 'Give clues',
    body: 'Go around and each say one word out loud that fits the secret word. Too obvious and the Imposter catches on. Too vague and people get suspicious.',
  },
  {
    title: 'Argue',
    body: 'Talk about who sounded off. Who hesitated? Whose clue made no sense?',
  },
  {
    title: 'Vote',
    body: 'Everyone votes on their phone in secret. Most votes is out and their role gets revealed. A tie means a revote.',
  },
  {
    title: 'Last chance',
    body: 'An Imposter who gets caught can say one guess out loud. If they get the word, the Imposters win anyway.',
  },
];

export function HowToPlay() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-2xl border-l-4 border-elf bg-white/[0.03] px-3.5 py-3">
          <p className="heading text-lg text-elf">Innocents</p>
          <p className="mt-1 text-xs leading-relaxed text-snow/80">Know the word. Find every Imposter and vote them out.</p>
        </div>
        <div className="rounded-2xl border-l-4 border-grinch bg-white/[0.03] px-3.5 py-3">
          <p className="heading text-lg text-grinch">Imposters</p>
          <p className="mt-1 text-xs leading-relaxed text-snow/80">Only get a hint. Fake it until there are as many of you as Innocents.</p>
        </div>
      </div>

      <ol className="divide-y divide-white/[0.06] rounded-2xl bg-white/[0.03]">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-4 px-4 py-3.5">
            <span className="w-6 shrink-0 font-display text-2xl leading-none text-gold/80">{i + 1}</span>
            <div>
              <p className="font-bold leading-tight">{s.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-night-300">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="rounded-2xl bg-white/[0.03] px-4 py-3.5 text-sm">
        <p className="mb-2 font-bold">Game modes</p>
        <ul className="space-y-1.5 text-night-300">
          {MODES.map((m) => (
            <li key={m.id}>
              <b className="text-snow">{m.name}:</b> {m.description}
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl bg-white/[0.03] px-4 py-3.5 text-sm">
        <p className="mb-2 font-bold">Points</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-night-300">
          <dt>Innocents win</dt>
          <dd className="text-right font-bold text-elf">+{SCORING.ELF_WIN}</dd>
          <dt>Imposters win</dt>
          <dd className="text-right font-bold text-grinch">+{SCORING.GRINCH_WIN}</dd>
          <dt>Voting for an Imposter</dt>
          <dd className="text-right font-bold text-snow">+{SCORING.CORRECT_VOTE}</dd>
          <dt>Guessing the word</dt>
          <dd className="text-right font-bold text-gold">+{SCORING.FINAL_GUESS_BONUS}</dd>
        </dl>
      </div>
    </div>
  );
}
