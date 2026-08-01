'use client';

import { POSITION_LABELS, type PositionType } from '@/lib/game/types';

export function SilhouetteStage({
  silhouetteUrl,
  position,
  secondsLeft,
  totalSeconds,
  currentBid,
  topBidderName,
}: {
  silhouetteUrl: string | null;
  position: PositionType;
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
      {/* Spotlight behind the figure */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/3 rounded-full blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(182,255,59,0.22), transparent 65%)' }}
      />

      <div className="relative flex items-start justify-between px-5 pt-5">
        <span className="chip border-lime-300/25 text-lime-200">
          {POSITION_LABELS[position]}
        </span>

        <div className="relative grid h-16 w-16 place-items-center">
          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 64 64">
            <circle
              cx="32"
              cy="32"
              r={radius}
              fill="none"
              stroke="rgba(255,255,255,0.12)"
              strokeWidth="5"
            />
            <circle
              cx="32"
              cy="32"
              r={radius}
              fill="none"
              stroke={urgent ? '#fb7185' : '#b6ff3b'}
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - progress)}
              style={{ transition: 'stroke-dashoffset 0.2s linear' }}
            />
          </svg>
          <span
            className={`text-xl font-black tabular-nums ${
              urgent ? 'animate-pulse-ring text-rose-400' : 'text-lime-300'
            }`}
          >
            {secondsLeft}
          </span>
        </div>
      </div>

      <div className="relative flex min-h-[380px] items-end justify-center px-6 sm:min-h-[460px]">
        {silhouetteUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={silhouetteUrl}
            alt={`Silueta de un ${POSITION_LABELS[position].toLowerCase()} por identificar`}
            className="animate-pop max-h-[420px] w-auto object-contain drop-shadow-[0_0_40px_rgba(182,255,59,0.25)]"
            style={{ filter: 'brightness(0) saturate(100%) invert(97%) sepia(8%) saturate(600%) hue-rotate(40deg)' }}
          />
        ) : (
          <div className="grid h-64 w-full place-items-center text-white/40">
            Silueta no disponible
          </div>
        )}
      </div>

      <div className="relative border-t border-white/10 bg-black/25 px-5 py-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-white/45">Puja actual</p>
            <p className="text-4xl font-black leading-none text-lime-300">{currentBid}</p>
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
