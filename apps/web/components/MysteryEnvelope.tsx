'use client';

import { POSITION_LABELS, type PositionType } from '@/lib/game/types';

export interface Envelope {
  nationality: string | null;
  honours: { honour: string; season: string | null; team: string | null }[];
}

/**
 * A round with no silhouette for anyone. Instead you get the player's
 * nationality, the season being auctioned and the trophies won — clues that
 * mislead as often as they help, since a big club's third-choice keeper
 * collects more medals than a star at a mid-table side.
 */
export function MysteryEnvelope({
  envelope,
  position,
  seasonYear,
  eraLabel,
  secondsLeft,
  totalSeconds,
  currentBid,
  topBidderName,
}: {
  envelope: Envelope;
  position: PositionType;
  seasonYear: number | null;
  eraLabel: string | null;
  secondsLeft: number;
  totalSeconds: number;
  currentBid: number;
  topBidderName: string | null;
}) {
  const progress = Math.max(0, Math.min(1, secondsLeft / Math.max(1, totalSeconds)));
  const urgent = secondsLeft <= 5;
  const radius = 26;
  const circumference = 2 * Math.PI * radius;

  return (
    <section className="panel animate-rise relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/3 rounded-full blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(120,120,255,0.18), transparent 65%)' }}
      />

      <div className="relative flex items-start justify-between px-5 pt-5">
        <span className="chip border-indigo-300/30 text-indigo-200">
          ✉️ Sobre misterioso · {POSITION_LABELS[position]}
        </span>

        <div className="relative grid h-16 w-16 place-items-center">
          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r={radius} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="5" />
            <circle
              cx="32"
              cy="32"
              r={radius}
              fill="none"
              stroke={urgent ? '#fb7185' : '#a5b4fc'}
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - progress)}
              style={{ transition: 'stroke-dashoffset 0.2s linear' }}
            />
          </svg>
          <span
            className={`text-xl font-black tabular-nums ${
              urgent ? 'animate-pulse-ring text-rose-400' : 'text-indigo-200'
            }`}
          >
            {secondsLeft}
          </span>
        </div>
      </div>

      <div className="relative px-6 py-6">
        <p className="mb-5 text-center text-white/50">
          Esta vez no hay silueta. Sólo esto:
        </p>

        <div className="mx-auto grid max-w-md grid-cols-2 gap-3">
          <Fact label="Nacionalidad" value={envelope.nationality ?? 'desconocida'} />
          <Fact
            label="Temporada"
            value={seasonYear ? String(seasonYear) : '—'}
            hint={eraLabel ?? undefined}
          />
        </div>

        <div className="mx-auto mt-5 max-w-md">
          <p className="mb-2 text-xs uppercase tracking-wider text-white/45">
            Títulos ganados {envelope.honours.length > 0 && `(${envelope.honours.length})`}
          </p>

          {envelope.honours.length ? (
            <ul className="space-y-1.5">
              {envelope.honours.map((h, i) => (
                <li
                  key={`${h.honour}-${h.season}-${i}`}
                  className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-black/25 px-3 py-2"
                >
                  <span aria-hidden>🏆</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{h.honour}</span>
                  {h.season && (
                    <span className="shrink-0 text-xs text-white/40">{h.season}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border border-white/10 bg-black/25 px-3 py-4 text-center text-sm text-white/40">
              No ganó nada. Eso también dice algo.
            </p>
          )}
        </div>

        <p className="mx-auto mt-5 max-w-md text-center text-xs text-white/35">
          Ojo: el tercer arquero de un grande junta más medallas que la figura de un equipo chico.
        </p>
      </div>

      <div className="relative border-t border-white/10 bg-black/25 px-5 py-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-white/45">Puja actual</p>
            <p className="text-4xl font-black leading-none text-indigo-200">{currentBid}</p>
          </div>
          <p className="pb-1 text-right text-sm text-white/60">
            {topBidderName ? (
              <>
                va ganando <span className="font-bold text-white">{topBidderName}</span>
              </>
            ) : (
              'sin pujas todavía'
            )}
          </p>
        </div>
      </div>
    </section>
  );
}

function Fact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-center">
      <p className="text-[11px] uppercase tracking-wider text-white/40">{label}</p>
      <p className="text-lg font-bold">{value}</p>
      {hint && <p className="text-xs text-white/40">{hint}</p>}
    </div>
  );
}
