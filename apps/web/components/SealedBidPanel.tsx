'use client';

import { useEffect, useId, useState } from 'react';

/**
 * Bidding in a sealed room.
 *
 * The open auction is a reflex game: you watch the other bid and answer. This
 * one asks a different question — what is he actually worth to you — because
 * you write a number without knowing anybody else's, and every envelope opens
 * at once when the round closes.
 *
 * So this panel shows exactly two things while the round is alive: your own
 * number, and how many people have sealed. Anything more would be the answer.
 */
export function SealedBidPanel({
  budget,
  mine,
  sealedCount,
  expected,
  positionFull,
  canBid,
  passesLeft,
  onSeal,
  onPass,
  busy,
}: {
  budget: number;
  /** What this player already put in, if anything. */
  mine: number | null;
  sealedCount: number;
  expected: number;
  positionFull: boolean;
  canBid: boolean;
  passesLeft: number;
  onSeal: (amount: number) => void;
  onPass: () => void;
  busy: boolean;
}) {
  const [amount, setAmount] = useState('');
  // El panel se dibuja dos veces —una para el rail y otra para las pestañas del
  // celular— así que un id fijo aparecería repetido y el label apuntaría a
  // cualquiera de los dos.
  const id = useId();

  // A round change wipes the field; leaving the last number in it invites
  // sending the same bid twice by accident.
  useEffect(() => {
    setAmount(mine != null ? String(mine) : '');
  }, [mine]);

  const value = Number(amount);
  const valid = Number.isInteger(value) && value >= 1 && value <= budget;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (valid && canBid && !positionFull) onSeal(value);
  };

  return (
    <form onSubmit={submit} className="panel animate-rise p-5">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-white/45">Tu presupuesto</p>
          <p className="text-3xl font-black text-orange-400">{budget}</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-widest text-white/45">Sobres</p>
          <p className="text-lg font-black tabular-nums">
            {sealedCount}
            <span className="text-white/35"> / {expected}</span>
          </p>
        </div>
      </div>

      {positionFull ? (
        <p className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-200">
          Ya completaste esta posición — no participás de esta ronda.
        </p>
      ) : (
        <>
          <label className="block text-sm text-white/60" htmlFor={id}>
            ¿Cuánto es lo máximo que pagarías?
          </label>

          <div className="mt-2 flex gap-2">
            <input
              id={id}
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/\D/g, '').slice(0, 5))}
              placeholder="0"
              disabled={!canBid}
              className="field min-h-[52px] flex-1 text-center text-2xl font-black tabular-nums"
            />
            <button
              type="submit"
              disabled={!valid || !canBid || busy}
              className="btn-primary min-h-[52px] px-5 disabled:opacity-30"
            >
              {mine != null ? 'Cambiar' : 'Guardar'}
            </button>
          </div>

          {/* Says what it costs, because in this mode you pay your own number
              and not one step over the runner-up. */}
          <p className="mt-2 text-xs leading-snug text-white/40">
            {mine != null
              ? `Tu sobre dice ${mine}. Podés cambiarlo hasta que cierre la ronda.`
              : 'Nadie ve tu número hasta que se abren los sobres. Si ganás, pagás exactamente eso.'}
          </p>

          {amount && !valid && (
            <p className="mt-1 text-xs text-rose-300">
              {value > budget ? 'No te alcanza el presupuesto.' : 'Poné un número de 1 para arriba.'}
            </p>
          )}
        </>
      )}

      <button
        type="button"
        onClick={onPass}
        disabled={busy || passesLeft <= 0 || positionFull}
        className="btn-ghost mt-3 w-full flex-col gap-0"
      >
        <span>{passesLeft > 0 ? 'Pasar' : 'Ya usaste tu pase'}</span>
        {passesLeft > 0 && (
          <span className="text-xs font-normal text-white/45">
            uno por puesto · si nadie pone sobre, se sortea
          </span>
        )}
      </button>
    </form>
  );
}

/** The envelopes, opened. Shown with the reveal. */
export function OpenedEnvelopes({
  envelopes,
  winnerId,
  meId,
}: {
  envelopes: { participant_id: string; display_name: string; amount: number }[];
  winnerId: string | null;
  meId: string | null;
}) {
  if (!envelopes.length) {
    return (
      <div className="panel p-4">
        <h3 className="text-sm font-bold">Los sobres</h3>
        <p className="mt-1 text-sm text-white/45">Nadie puso ninguno, así que se sorteó.</p>
      </div>
    );
  }

  return (
    <div className="panel p-4">
      <h3 className="mb-2 text-sm font-bold">Los sobres</h3>
      <ul className="space-y-1.5">
        {envelopes.map((e) => {
          const won = e.participant_id === winnerId;
          return (
            <li
              key={e.participant_id}
              className={`animate-rise flex items-center justify-between gap-2 rounded-lg border px-3 py-2 ${
                won ? 'border-orange-400/50 bg-orange-500/10' : 'border-white/10 bg-white/[0.03]'
              }`}
            >
              <span className="min-w-0 truncate text-sm font-medium">
                {e.display_name}
                {e.participant_id === meId && <span className="text-white/40"> (vos)</span>}
              </span>
              <span
                className={`shrink-0 text-sm font-black tabular-nums ${
                  won ? 'text-orange-400' : 'text-white/50'
                }`}
              >
                {e.amount}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
