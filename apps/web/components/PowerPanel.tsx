'use client';

import { useState } from 'react';
import { DEFENSIVE_POWERS, POWERS, type PowerId } from '@/lib/game/powers';
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
  const [hovered, setHovered] = useState<PowerId | null>(null);

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

  // Sin excluir los defensivos, alguien con escudo figuraba como intocable —
  // y el escudo tiene que bloquear un poder, no volverlo inmune.
  const hexedIds = new Set(
    effects
      .filter((e) => e.status === 'pending' && !DEFENSIVE_POWERS.has(e.power as PowerId))
      .map((e) => e.target_id)
  );
  const castByMe = effects.filter((e) => e.caster_id === meId && e.status !== 'consumed');

  // What the strip under the icons is explaining right now. Hovering wins over
  // the open one so you can read a second power without closing the first.
  const shown = POWERS.find((p) => p.id === (hovered ?? picked)) ?? null;
  const open = POWERS.find((p) => p.id === picked) ?? null;

  return (
    <div className="panel p-3">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold">Poderes</h3>
        <span className="text-[10px] text-white/40">salen de tu presupuesto</span>
      </div>

      {/* Cuatro columnas y dos filas: con siete poderes en una sola fila cada
          icono baja de los 44px que hace falta para tocarlo con el dedo. */}
      <ul className="grid grid-cols-4 gap-1.5" onMouseLeave={() => setHovered(null)}>
        {POWERS.map((power) => {
          const affordable = power.cost <= budget;
          const active = picked === power.id;

          return (
            <li key={power.id}>
              <button
                onClick={() => {
                  // Self-targeted powers have nobody to choose, so they fire
                  // straight away instead of opening a picker.
                  if (power.selfTargeted) {
                    onCast(power.id, null);
                    setPicked(null);
                    return;
                  }
                  setPicked(active ? null : power.id);
                }}
                onMouseEnter={() => setHovered(power.id)}
                onFocus={() => setHovered(power.id)}
                onBlur={() => setHovered(null)}
                disabled={!affordable || busy}
                // The strip below carries the name and the effect; without
                // this a screen reader would hear only an emoji.
                aria-label={`${power.name}, ${power.cost} de presupuesto. ${power.description}`}
                aria-expanded={active}
                className={`flex min-h-[52px] w-full flex-col items-center justify-center gap-0.5 rounded-xl border transition disabled:opacity-30 ${
                  active
                    ? 'border-orange-400/60 bg-orange-400/10'
                    : 'border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.07]'
                }`}
              >
                <span className="text-lg leading-none" aria-hidden>
                  {power.icon}
                </span>
                <span
                  className={`text-[11px] font-black leading-none tabular-nums ${
                    affordable ? 'text-orange-400' : 'text-white/30'
                  }`}
                  aria-hidden
                >
                  {power.cost}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* A fixed strip rather than a floating tooltip: this panel lives in a
          rail with overflow-y-auto, which would clip anything absolutely
          positioned over its edge. It also gives touch — where there is no
          hover at all — the same explanation on tap. */}
      <div className="mt-2 min-h-[3.75rem] rounded-xl border border-white/10 bg-black/20 px-3 py-2">
        {shown ? (
          <>
            <p className="flex items-baseline gap-1.5 text-sm font-semibold">
              {shown.name}
              <span className="text-[11px] font-black tabular-nums text-orange-400">
                {shown.cost}
              </span>
            </p>
            <p className="mt-0.5 text-xs leading-snug text-white/55">{shown.description}</p>
          </>
        ) : (
          <p className="text-xs leading-snug text-white/35">
            Pasá el mouse por un icono para ver qué hace. Tocalo para tirarlo.
          </p>
        )}
      </div>

      {open && !open.selfTargeted && (
        <div className="animate-rise mt-2 rounded-xl border border-orange-400/30 bg-orange-400/5 px-3 py-2.5">
          <p className="mb-2 text-[11px] uppercase tracking-wider text-white/45">
            ¿A quién le tirás {open.name}?
          </p>
          <div className="flex flex-wrap gap-2">
            {rivals.map((rival) => {
              const blocked = hexedIds.has(rival.id);

              return (
                <button
                  key={rival.id}
                  onClick={() => {
                    onCast(open.id, rival.id);
                    setPicked(null);
                  }}
                  disabled={busy || blocked}
                  title={blocked ? 'Ya tiene un poder esperando' : `Tirarle ${open.name}`}
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

      {castByMe.length > 0 && (
        <p className="mt-3 text-xs text-orange-400/70">
          Tenés {castByMe.length} poder{castByMe.length === 1 ? '' : 'es'} en juego.
        </p>
      )}
    </div>
  );
}
