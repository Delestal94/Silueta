'use client';

import { useState } from 'react';
import type { Room } from '@/lib/game/types';

export interface RematchSettings {
  startingBudget: number;
  roundSeconds: number;
  genderFilter: 'men' | 'women' | 'any';
  pool: 'famous' | 'all' | 'balanced';
  auctionMode: 'open' | 'sealed';
  includeLegends: boolean;
}

/**
 * Otra partida, en la misma sala.
 *
 * Sin esto, volver a jugar era crear una sala nueva y repartir otro código por
 * el grupo — y en ese trámite se perdía media mesa. El código no cambia y
 * nadie tiene que volver a entrar.
 *
 * La configuración se puede tocar acá porque es el único momento en que tiene
 * sentido: terminada una partida ya sabés si el presupuesto quedaba corto o si
 * querés probar el otro modo. Cambiarla en medio de una subasta reescribiría
 * las reglas con la que se está jugando.
 */
export function RematchPanel({
  room,
  isHost,
  onRematch,
  busy,
}: {
  room: Room;
  isHost: boolean;
  onRematch: (settings: RematchSettings) => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<RematchSettings>({
    startingBudget: room.starting_budget,
    roundSeconds: room.round_seconds,
    // De la sala, no fijados: si el anfitrión eligió sólo masculino, repetir
    // partida no tiene por qué devolverle las mujeres sin avisar.
    genderFilter: room.gender_filter,
    pool: room.pool,
    auctionMode: room.auction_mode,
    includeLegends: room.include_legends,
  });

  if (!isHost) {
    return (
      <div className="panel p-5 text-center">
        <p className="text-sm text-white/55">
          El anfitrión puede empezar otra partida sin que nadie salga de la sala.
        </p>
        <p className="mt-1 text-xs text-white/35">Quedate acá, no hace falta el código de nuevo.</p>
      </div>
    );
  }

  const set = <K extends keyof RematchSettings>(k: K, v: RematchSettings[K]) =>
    setSettings((s) => ({ ...s, [k]: v }));

  return (
    <div className="panel p-5">
      <button
        onClick={() => onRematch(settings)}
        disabled={busy}
        className="btn-primary w-full py-3 text-lg"
      >
        {busy ? 'Preparando…' : 'Jugar de nuevo'}
      </button>
      <p className="mt-2 text-center text-xs text-white/40">
        Misma sala, mismo código. Los equipos se borran y vuelve el presupuesto.
      </p>

      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-3 w-full text-sm text-white/45 underline transition hover:text-white"
      >
        {open ? 'Dejar la configuración como está' : 'Cambiar la configuración'}
      </button>

      {open && (
        <div className="animate-rise mt-4 space-y-4 border-t border-white/10 pt-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Presupuesto">
              <input
                type="number"
                value={settings.startingBudget}
                min={50}
                max={1000}
                step={10}
                onChange={(e) => set('startingBudget', Number(e.target.value))}
                className="field"
              />
            </Field>
            <Field label="Segundos por ronda">
              <input
                type="number"
                value={settings.roundSeconds}
                min={5}
                max={120}
                onChange={(e) => set('roundSeconds', Number(e.target.value))}
                className="field"
              />
            </Field>
          </div>

          <Choice
            label="Modo de subasta"
            value={settings.auctionMode}
            onChange={(v) => set('auctionMode', v)}
            options={[
              { value: 'open', label: 'Puja abierta' },
              { value: 'sealed', label: 'Sobre cerrado' },
            ]}
          />

          <Choice
            label="Jugadores"
            value={settings.genderFilter}
            onChange={(v) => set('genderFilter', v)}
            options={[
              { value: 'any', label: 'Ambos' },
              { value: 'men', label: 'Masculino' },
              { value: 'women', label: 'Femenino' },
            ]}
          />

          <Toggle
            label="Leyendas retiradas"
            hint="Maradona, Pelé, Cruyff y compañía entran al sorteo."
            checked={settings.includeLegends}
            onChange={(v) => set('includeLegends', v)}
          />

          <Choice
            label="Catálogo"
            value={settings.pool}
            onChange={(v) => set('pool', v)}
            options={[
              { value: 'famous', label: 'Más famosos' },
              { value: 'balanced', label: 'Equilibrado' },
              { value: 'all', label: 'Todos' },
            ]}
          />
        </div>
      )}
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-black/25 p-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 accent-orange-500"
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-xs leading-snug text-white/45">{hint}</span>
      </span>
    </label>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-white/60">{label}</span>
      {children}
    </label>
  );
}

function Choice<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div>
      <span className="mb-1.5 block text-sm text-white/60">{label}</span>
      <div
        role="radiogroup"
        aria-label={label}
        className="grid gap-1.5 rounded-xl border border-white/10 bg-black/25 p-1"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={`min-h-[44px] rounded-lg px-2 text-sm font-semibold transition ${
              value === o.value
                ? 'bg-orange-500 text-white'
                : 'text-white/60 hover:bg-white/5 hover:text-white'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
