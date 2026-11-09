import { Minus, Plus } from 'lucide-react';
import { useState } from 'react';
import {
  CATEGORIES,
  DISCUSSION_MAX_SECONDS,
  DISCUSSION_PRESETS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  TURN_PRESETS,
  VOTING_PRESETS,
  categoryName,
  maxGrinchCount,
  recommendedGrinchCount,
  type CategoryId,
  type GameSettings,
} from '@imposter/shared';
import { useRoom } from '../state/GameProvider';
import { CustomPackSheet } from './CustomPackSheet';
import { Segmented, Sheet, Toggle } from './ui';

const secondsLabel = (s: number) => (s === 0 ? 'Off' : `${s}s`);

/** Host-only settings editor. Every change is sent immediately and appears on all phones. */
export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { room, isHost, send } = useRoom();
  const s = room.settings;
  const update = (patch: Partial<GameSettings>) => void send('room:updateSettings', { settings: patch });
  const playerCount = room.players.filter((p) => p.status !== 'LEFT').length;
  const max = maxGrinchCount(Math.max(3, playerCount));
  const matchLive = !!room.match && !room.match.results;
  const [customDiscussion, setCustomDiscussion] = useState(
    DISCUSSION_PRESETS.includes(s.discussionSeconds) ? '' : String(s.discussionSeconds),
  );

  const [packOpen, setPackOpen] = useState(false);
  const customOn = s.categories.includes('custom');

  // "Random Mix" = every built-in category. The custom pack can be mixed with anything.
  const toggleCategory = (id: CategoryId) => {
    if (id === 'custom') {
      if (!room.customPack) return setPackOpen(true);
      const next = customOn ? s.categories.filter((c) => c !== 'custom') : [...s.categories, 'custom' as const];
      return update({ categories: next.length ? next : ['random'] });
    }
    if (id === 'random') return update({ categories: customOn ? ['random', 'custom'] : ['random'] });
    const current = s.categories.filter((c) => c !== 'random');
    const next = current.includes(id) ? current.filter((c) => c !== id) : [...current, id];
    update({ categories: next.length ? next : ['random'] });
  };

  return (
    <>
    <Sheet open={open && !packOpen} onClose={onClose} title={isHost ? 'Game Settings' : 'Game Settings (view only)'}>
      {matchLive && (
        <p className="mb-4 rounded-2xl bg-gold/10 px-4 py-3 text-sm text-gold">
          A match is in progress. Changes apply from the next match.
        </p>
      )}
      <fieldset disabled={!isHost} className="space-y-6">
        <Section title="Mode">
          <div className="flex flex-wrap gap-1.5">
            <span className="h-10 rounded-xl bg-snow px-3 text-sm font-bold leading-10 text-night-950">Classic</span>
            <span className="h-10 rounded-xl bg-white/[0.04] px-3 text-sm font-semibold leading-10 text-night-400">Undercover · soon</span>
            <span className="h-10 rounded-xl bg-white/[0.04] px-3 text-sm font-semibold leading-10 text-night-400">Chaos · soon</span>
          </div>
        </Section>

        <Section title="Max players">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 rounded-xl bg-white/[0.05] p-1">
              <StepButton label="Fewer players" onClick={() => update({ maxPlayers: Math.max(Math.max(MIN_PLAYERS, playerCount), s.maxPlayers - 1) })}>
                <Minus size={16} />
              </StepButton>
              <span className="w-10 text-center font-display text-lg">{s.maxPlayers}</span>
              <StepButton label="More players" onClick={() => update({ maxPlayers: Math.min(MAX_PLAYERS, s.maxPlayers + 1) })}>
                <Plus size={16} />
              </StepButton>
            </div>
            <Segmented
              value={[6, 8, 12, 16, 20].includes(s.maxPlayers) ? s.maxPlayers : -1}
              onChange={(v) => v > 0 && update({ maxPlayers: Math.max(v, playerCount) })}
              options={[6, 8, 12, 16, 20].map((v) => ({ value: v, label: String(v) }))}
            />
          </div>
          <p className="mt-2 text-xs text-night-300">
            How many people can join this room (up to {MAX_PLAYERS}). {playerCount} in the room now.
          </p>
        </Section>

        <Section title="Imposters">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => update({ grinchCount: 'auto' })}
              className={`h-11 rounded-xl px-4 text-sm font-bold ${s.grinchCount === 'auto' ? 'bg-snow text-night-950' : 'bg-white/[0.05] text-night-300'}`}
            >
              Auto ({recommendedGrinchCount(playerCount)})
            </button>
            <div className="flex items-center gap-1 rounded-xl bg-white/[0.05] p-1">
              <StepButton
                label="Fewer Imposters"
                onClick={() => {
                  const cur = s.grinchCount === 'auto' ? recommendedGrinchCount(playerCount) : s.grinchCount;
                  update({ grinchCount: Math.max(1, cur - 1) });
                }}
              >
                <Minus size={16} />
              </StepButton>
              <span className="w-8 text-center font-display text-lg text-grinch">
                {s.grinchCount === 'auto' ? recommendedGrinchCount(playerCount) : s.grinchCount}
              </span>
              <StepButton
                label="More Imposters"
                onClick={() => {
                  const cur = s.grinchCount === 'auto' ? recommendedGrinchCount(playerCount) : s.grinchCount;
                  update({ grinchCount: Math.min(maxGrinchCount(MAX_PLAYERS), cur + 1) });
                }}
              >
                <Plus size={16} />
              </StepButton>
            </div>
          </div>
          <p className="mt-2 text-xs text-night-300">
            With {playerCount} player{playerCount === 1 ? '' : 's'}: up to {max}. Imposters must be fewer than half the room.
          </p>
        </Section>

        <Section title="Categories">
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => {
              const on = s.categories.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleCategory(c.id)}
                  aria-pressed={on}
                  className={`min-h-10 rounded-xl px-3 py-2 text-left text-sm font-semibold transition-colors ${
                    on ? 'bg-elf/20 text-elf-light ring-1 ring-elf/50' : 'bg-white/[0.05] text-night-300'
                  }`}
                >
                  {c.id === 'custom' ? (room.customPack ? `${room.customPack.name} (${room.customPack.count})` : 'Custom pack (add words)') : c.name}
                </button>
              );
            })}
          </div>
          {isHost && (
            <button
              type="button"
              onClick={() => setPackOpen(true)}
              className="mt-2.5 text-sm font-bold text-gold underline-offset-4 hover:underline"
            >
              {room.customPack ? 'Edit your custom word pack' : '+ Make your own word pack'}
            </button>
          )}
        </Section>

        <Section title="Voting system">
          <Segmented
            value={s.votingSystem}
            onChange={(v) => update({ votingSystem: v })}
            options={[
              { value: 'ELIMINATION', label: 'Elimination' },
              { value: 'SINGLE', label: 'Single vote' },
            ]}
          />
          <p className="mt-2 text-xs text-night-300">
            {s.votingSystem === 'ELIMINATION'
              ? 'Vote someone out after every clue round until all Imposters are caught, or the Imposters equal the Innocents.'
              : 'One decisive vote. Everyone names as many suspects as there are Imposters. Catch every Imposter to win; name an Innocent and the Imposters win.'}
          </p>
        </Section>

        <Section title="Discussion timer">
          <Segmented
            value={DISCUSSION_PRESETS.includes(s.discussionSeconds) && !customDiscussion ? s.discussionSeconds : -1}
            onChange={(v) => {
              if (v === -1) {
                setCustomDiscussion(String(s.discussionSeconds || 150));
                return;
              }
              setCustomDiscussion('');
              update({ discussionSeconds: v });
            }}
            options={[...DISCUSSION_PRESETS.map((v) => ({ value: v, label: secondsLabel(v) })), { value: -1, label: 'Custom' }]}
          />
          {customDiscussion !== '' && (
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input
                type="number"
                inputMode="numeric"
                min={10}
                max={DISCUSSION_MAX_SECONDS}
                value={customDiscussion}
                onChange={(e) => setCustomDiscussion(e.target.value)}
                onBlur={() => {
                  const n = Math.round(Number(customDiscussion));
                  if (Number.isFinite(n) && n >= 10) update({ discussionSeconds: Math.min(DISCUSSION_MAX_SECONDS, n) });
                }}
                className="h-11 w-24 rounded-xl bg-night-700 px-3 text-snow"
                aria-label="Custom discussion seconds"
              />
              seconds
            </label>
          )}
        </Section>

        <Section title="Speaking turn timer">
          <Segmented
            value={s.turnSeconds}
            onChange={(v) => update({ turnSeconds: v })}
            options={TURN_PRESETS.map((v) => ({ value: v, label: secondsLabel(v) }))}
          />
        </Section>

        <Section title="Voting timer">
          <Segmented
            value={s.votingSeconds}
            onChange={(v) => update({ votingSeconds: v })}
            options={VOTING_PRESETS.map((v) => ({ value: v, label: secondsLabel(v) }))}
          />
        </Section>

        <Section title="Matches">
          <Segmented
            value={s.totalMatches}
            onChange={(v) => update({ totalMatches: v })}
            options={[
              { value: 0, label: 'Endless' },
              { value: 3, label: '3' },
              { value: 5, label: '5' },
              { value: 10, label: '10' },
            ]}
          />
        </Section>

        <Section title="Rules">
          <div className="divide-y divide-white/[0.06]">
            <Toggle
              checked={s.finalGuessEnabled}
              onChange={(v) => update({ finalGuessEnabled: v })}
              label="Final word guess"
              description="A caught Imposter says one guess out loud. If an Innocent confirms it, the Imposters win."
            />
            <Toggle
              checked={s.allowSkipVote}
              onChange={(v) => update({ allowSkipVote: v })}
              label="Allow skip votes"
              description="If Skip gets the most votes, nobody is eliminated."
            />
            <Toggle
              checked={s.grinchHint}
              onChange={(v) => update({ grinchHint: v })}
              label="Hint word for Imposters"
              description="Every Imposter gets the same hint word, e.g. “Oven” for Cookies."
            />
            <Toggle
              checked={s.autoAdvance}
              onChange={(v) => update({ autoAdvance: v })}
              label="Automatic progression"
              description="Move on automatically when timers run out."
            />
            <Toggle
              checked={!s.allowRepeatWords}
              onChange={(v) => update({ allowRepeatWords: !v })}
              label="Avoid repeated words"
              description="Don't reuse words from recent matches."
            />
            <Toggle
              checked={s.soundEnabled}
              onChange={(v) => update({ soundEnabled: v })}
              label="Sound effects"
              description="For everyone in the room. Players can also mute themselves."
            />
          </div>
        </Section>
      </fieldset>
    </Sheet>
    <CustomPackSheet open={packOpen} onClose={() => setPackOpen(false)} />
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="label mb-2.5">{title}</h3>
      {children}
    </section>
  );
}

function StepButton({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-white/10">
      {children}
    </button>
  );
}

/** One-line summary of the room's settings for the lobby. */
export function settingsSummary(s: GameSettings, players: number, customPackName?: string): { label: string; value: string }[] {
  return [
    { label: 'Mode', value: 'Classic' },
    {
      label: 'Imposters',
      value: s.grinchCount === 'auto' ? `Auto (${recommendedGrinchCount(players)})` : String(s.grinchCount),
    },
    {
      label: 'Words',
      value: [
        s.categories.includes('random') ? 'Random Mix' : s.categories.filter((c) => c !== 'custom').map(categoryName).join(', '),
        s.categories.includes('custom') ? (customPackName ?? 'Custom Pack') : '',
      ]
        .filter(Boolean)
        .join(' + '),
    },
    { label: 'Voting', value: s.votingSystem === 'ELIMINATION' ? 'Elimination' : 'Single vote' },
    { label: 'Discussion', value: s.discussionSeconds ? `${s.discussionSeconds}s` : 'No timer' },
    { label: 'Final guess', value: s.finalGuessEnabled ? 'On' : 'Off' },
    { label: 'Matches', value: s.totalMatches ? String(s.totalMatches) : 'Endless' },
  ];
}
