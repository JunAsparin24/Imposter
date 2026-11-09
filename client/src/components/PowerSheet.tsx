import { Eye, Gavel, Scissors, SkipForward } from 'lucide-react';
import { useState } from 'react';
import { SPECIAL_ROLES, TIMING } from '@imposter/shared';
import { useRoom } from '../state/GameProvider';
import { Avatar } from './decor';
import { Button, ConfirmButton, Sheet } from './ui';

/** Name + one-line rule for each power, shown on the role card and in the power sheet. */
export const POWER_INFO = {
  DETECTIVE: { title: 'Detective', rule: 'Once per match, during clues or discussion, secretly check if one player is an Imposter.' },
  SABOTEUR: { title: 'Saboteur', rule: "Once per match, skip someone's speaking turn or cut the discussion to 10 seconds." },
  MAYOR: { title: 'Mayor', rule: 'Your vote secretly counts twice. Nobody can tell, so nobody can prove who the Mayor is.' },
} as const;

/**
 * The player's once-per-match power: the Detective's check, the Saboteur's sabotage,
 * or (for the Mayor) just a reminder. Everything is checked again on the server.
 */
export function PowerSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { room, priv, send, playerById, session } = useRoom();
  const [busy, setBusy] = useState(false);
  const m = room.match;
  if (!priv.power || !m) return null;
  const info = POWER_INFO[priv.power];
  const myId = session?.playerId;
  const targets = room.players.filter((p) => m.participantIds.includes(p.id) && p.status === 'ACTIVE' && p.id !== myId);
  const speaker = playerById(m.currentSpeakerId);
  const can = (a: string) => priv.powerActions.includes(a as never);

  const use = async (action: 'INVESTIGATE' | 'SKIP_TURN' | 'CUT_DISCUSSION', targetId?: string) => {
    setBusy(true);
    const res = await send('game:usePower', { action, targetId, phaseSeq: room.phaseSeq });
    setBusy(false);
    if (res.ok && action !== 'INVESTIGATE') onClose();
  };

  const checked = priv.detectiveResult ? playerById(priv.detectiveResult.targetId) : null;

  return (
    <Sheet open={open} onClose={onClose} title={`${info.title} power`}>
      <div className="space-y-4">
        <p className="text-sm text-night-300">{info.rule}</p>

        {priv.power === 'DETECTIVE' && (
          <>
            {priv.detectiveResult && checked ? (
              <div
                className={`rounded-2xl border-2 px-4 py-5 text-center ${
                  priv.detectiveResult.isImposter ? 'border-grinch/60 bg-grinch/10' : 'border-elf/60 bg-elf/10'
                }`}
              >
                <Avatar emoji={checked.avatar} size={64} ring={priv.detectiveResult.isImposter ? 'grinch' : 'elf'} />
                <p className="heading mt-2 text-2xl">{checked.name}</p>
                <p className={`heading mt-1 text-xl ${priv.detectiveResult.isImposter ? 'text-grinch' : 'text-elf'}`}>
                  {priv.detectiveResult.isImposter ? 'is an Imposter!' : 'is not an Imposter.'}
                </p>
                <p className="mt-2 text-xs text-night-300">Only you can see this. Convince the others.</p>
              </div>
            ) : can('INVESTIGATE') ? (
              <>
                <p className="label">Pick one player to check</p>
                <ul className="grid grid-cols-2 gap-2">
                  {targets.map((p) => (
                    <li key={p.id}>
                      <ConfirmButton
                        block
                        variant="outline"
                        className="!h-auto !justify-start !py-2"
                        disabled={busy}
                        confirmLabel={`Check ${p.name}?`}
                        onConfirm={() => void use('INVESTIGATE', p.id)}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <Avatar emoji={p.avatar} size={32} />
                          <span className="truncate">{p.name}</span>
                        </span>
                      </ConfirmButton>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="rounded-2xl bg-white/[0.04] px-4 py-3 text-sm text-night-300">
                {priv.powerUsed ? 'You already used your check this match.' : 'You can use this during clues or discussion.'}
              </p>
            )}
          </>
        )}

        {priv.power === 'SABOTEUR' && (
          <>
            {can('SKIP_TURN') && speaker && (
              <ConfirmButton
                block
                size="lg"
                variant="grinch"
                icon={<SkipForward size={18} />}
                loading={busy}
                confirmLabel={`Skip ${speaker.name}? Tap again`}
                onConfirm={() => void use('SKIP_TURN')}
              >
                Skip {speaker.name}'s turn
              </ConfirmButton>
            )}
            {can('CUT_DISCUSSION') && (
              <ConfirmButton
                block
                size="lg"
                variant="grinch"
                icon={<Scissors size={18} />}
                loading={busy}
                confirmLabel="Cut it? Tap again"
                onConfirm={() => void use('CUT_DISCUSSION')}
              >
                Cut discussion to {TIMING.SABOTAGE_CUT_MS / 1000} seconds
              </ConfirmButton>
            )}
            {priv.powerActions.length === 0 && (
              <p className="rounded-2xl bg-white/[0.04] px-4 py-3 text-sm text-night-300">
                {priv.powerUsed
                  ? 'You already used your sabotage this match.'
                  : "Use it during someone else's speaking turn, or during discussion."}
              </p>
            )}
            <p className="text-xs text-night-400">Everyone will hear that a Saboteur struck, but not who.</p>
          </>
        )}

        {priv.power === 'MAYOR' && (
          <p className="rounded-2xl bg-gold/10 px-4 py-3 text-sm text-gold">
            Nothing to tap: your votes already count twice. Claiming to be the Mayor proves nothing, since an Imposter could say it too.
          </p>
        )}

        <Button block variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
    </Sheet>
  );
}

/** Small icon for each power. */
export function PowerIcon({ power, size = 16 }: { power: keyof typeof POWER_INFO; size?: number }) {
  return power === 'DETECTIVE' ? <Eye size={size} /> : power === 'SABOTEUR' ? <Scissors size={size} /> : <Gavel size={size} />;
}

export const powerName = (p: string) => SPECIAL_ROLES.find((r) => r.id === p)?.name ?? p;
