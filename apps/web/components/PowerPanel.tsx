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

  const hexedIds = new Set(effects.filter((e) => e.status === 'pending').map((e) => e.target_id));
  const castByMe = effects.filter((e) => e.caster_id === meId && e.status !== 'consumed');

  return (
    <div className="panel p-4 sm:p-5">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="font-bold">Poderes</h3>
        <span className="text-[11px] text-white/40">salen de tu presupuesto</span>
      </div>
      <p className="mb-3 text-xs leading-snug text-white/45">
        Se activan en la próxima ronda. Uno por rival a la vez.
      </p>

      <ul className="space-y-2">
        {POWERS.map((power) => {
          const affordable = power.cost <= budget;
          const open = picked === power.id;

          return (
            <li
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
                className="w-full px-3 py-2.5 text-left disabled:opacity-40"
                aria-expanded={open}
              >
                <span className="flex items-center gap-2">
                  <span className="text-lg leading-none" aria-hidden>
                    {power.icon}
                  </span>
                  <span className="flex-1 text-sm font-semibold">{power.name}</span>
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-xs font-black tabular-nums ${
                      affordable ? 'bg-lime-300/15 text-lime-300' : 'bg-white/5 text-white/30'
                    }`}
                  >
                    {power.cost}
                  </span>
                </span>
                {/* Wraps rather than truncating: a power whose effect you
                    cannot read is a power nobody will risk buying. */}
                <span className="mt-1 block text-xs leading-snug text-white/50">
                  {power.description}
                </span>
              </button>

              {open && !power.selfTargeted && (
                <div className="animate-rise border-t border-white/10 px-3 py-2.5">
                  <p className="mb-2 text-[11px] uppercase tracking-wider text-white/45">¿A quién?</p>
                  <div className="flex flex-wrap gap-2">
                    {rivals.map((rival) => {
                      const alreadyHexed = hexedIds.has(rival.id);
                      const blocked = alreadyHexed;

                      return (
                        <button
                          key={rival.id}
                          onClick={() => {
                            onCast(power.id, rival.id);
                            setPicked(null);
                          }}
                          disabled={busy || blocked}
                          title={alreadyHexed ? 'Ya tiene un poder esperando' : `Tirarle ${power.name}`}
                          className="btn-ghost min-h-[44px] px-3 py-2 text-sm disabled:opacity-30"
                        >
                          {rival.display_name}
                          {blocked && ' 🚫'}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {castByMe.length > 0 && (
        <p className="mt-3 text-xs text-lime-300/70">
          Tenés {castByMe.length} poder{castByMe.length === 1 ? '' : 'es'} en juego.
        </p>
      )}
    </div>
  );
}
