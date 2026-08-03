'use client';

import { useState } from 'react';
import { POWERS, type PowerId } from '@/lib/game/powers';
import type { Participant, PowerEffect } from '@/lib/game/types';

export function PowerPanel({
  rivals,
  budget,
  effects,
  meId,
  onCast,
  busy,
}: {
  rivals: Participant[];
  budget: number;
  effects: PowerEffect[];
  meId: string | null;
  onCast: (power: PowerId, targetId: string | null) => void;
  busy: boolean;
}) {
  const [picked, setPicked] = useState<PowerId | null>(null);

  if (!rivals.length) {
    return (
      <div className="panel p-5">
        <h3 className="font-bold">Poderes</h3>
        <p className="mt-2 text-sm text-white/45">
          Hacen falta al menos dos jugadores en la sala.
        </p>
      </div>
    );
  }

  const hexedIds = new Set(
    effects.filter((e) => e.status === 'pending').map((e) => e.target_id)
  );
  const castByMe = effects.filter((e) => e.caster_id === meId && e.status !== 'consumed');

  return (
    <div className="panel p-5">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="font-bold">Poderes</h3>
        <span className="text-xs text-white/45">salen de tu presupuesto</span>
      </div>
      <p className="mb-4 text-xs text-white/45">
        Se activan en la próxima ronda. Uno por rival a la vez.
      </p>

      <div className="space-y-2">
        {POWERS.map((power) => {
          const affordable = power.cost <= budget;
          const open = picked === power.id;

          return (
            <div
              key={power.id}
              className={`rounded-xl border transition ${
                open ? 'border-lime-300/40 bg-lime-300/5' : 'border-white/10 bg-white/[0.03]'
              }`}
            >
              <button
                onClick={() => {
                  // Self-targeted powers have nobody to choose, so they fire
                  // straight away instead of opening a picker.
                  if (power.selfTargeted) {
                    onCast(power.id, null);
                    setPicked(null);
                    return;
                  }
                  setPicked(open ? null : power.id);
                }}
                disabled={!affordable || busy}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left disabled:opacity-35"
                aria-expanded={open}
              >
                <span className="text-xl" aria-hidden>
                  {power.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{power.name}</span>
                  <span className="block truncate text-xs text-white/45">
                    {power.description}
                  </span>
                </span>
                <span
                  className={`shrink-0 text-sm font-black ${
                    affordable ? 'text-lime-300' : 'text-white/30'
                  }`}
                >
                  {power.cost}
                </span>
              </button>

              {open && !power.selfTargeted && (
                <div className="animate-rise border-t border-white/10 px-3 py-2.5">
                  <p className="mb-2 text-xs uppercase tracking-wider text-white/45">
                    ¿A quién?
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {rivals.map((rival) => {
                      const alreadyHexed = hexedIds.has(rival.id);
                      const noPass = power.id === 'manotazo' && rival.passes_used >= 1;
                      const blocked = alreadyHexed || noPass;

                      return (
                        <button
                          key={rival.id}
                          onClick={() => {
                            onCast(power.id, rival.id);
                            setPicked(null);
                          }}
                          disabled={busy || blocked}
                          title={
                            alreadyHexed
                              ? 'Ya tiene un poder esperando'
                              : noPass
                                ? 'Ya usó su pase'
                                : `Tirarle ${power.name}`
                          }
                          className="btn-ghost px-3 py-1.5 text-sm disabled:opacity-30"
                        >
                          {rival.display_name}
                          {blocked && ' 🚫'}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {castByMe.length > 0 && (
        <p className="mt-3 text-xs text-lime-300/70">
          Tenés {castByMe.length} poder{castByMe.length === 1 ? '' : 'es'} en juego.
        </p>
      )}
    </div>
  );
}
