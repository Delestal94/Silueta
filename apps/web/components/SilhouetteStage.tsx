'use client';

import { POSITION_LABELS, type PositionType } from '@/lib/game/types';

export function SilhouetteStage({
  silhouetteUrl,
  position,
  secondsLeft,
  totalSeconds,
  currentBid,
  topBidderName,
  hex,
}: {
  silhouetteUrl: string | null;
  position: PositionType;
  secondsLeft: number;
  totalSeconds: number;
  currentBid: number;
  topBidderName: string | null;
  hex?: string | null;
}) {
  const progress = Math.max(0, Math.min(1, secondsLeft / Math.max(1, totalSeconds)));
  const urgent = secondsLeft <= 5;

  const radius = 26;
  const circumference = 2 * Math.PI * radius;

  return (
    <section className="panel animate-rise relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Spotlight behind the figure */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/3 rounded-full blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(245,130,31,0.22), transparent 65%)' }}
      />

      <div className="relative flex items-start justify-between px-5 pt-5">
        <span className="chip border-orange-400/25 text-orange-300">
          {POSITION_LABELS[position]}
        </span>

        <div className="relative grid h-[72px] w-[72px] place-items-center sm:h-20 sm:w-20">
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
              stroke={urgent ? '#fb7185' : '#f5821f'}
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - progress)}
              style={{ transition: 'stroke-dashoffset 0.2s linear' }}
            />
          </svg>
          <span
            className={`text-2xl font-black tabular-nums sm:text-3xl ${
              urgent ? 'animate-pulse-ring text-rose-400' : 'text-orange-400'
            }`}
          >
            {secondsLeft}
          </span>
        </div>
      </div>

      <div className="relative flex min-h-[38vh] flex-1 items-end justify-center px-6 py-2">
        {silhouetteUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={silhouetteUrl}
            alt={`Silueta de un ${POSITION_LABELS[position].toLowerCase()} por identificar`}
            className="animate-pop h-full max-h-[52vh] w-auto object-contain drop-shadow-[0_0_40px_rgba(245,130,31,0.25)]"
            style={{
              filter:
                'brightness(0) saturate(100%) invert(96%) sepia(6%) saturate(300%) hue-rotate(190deg)' +
                // The blur is cosmetic; the server still sends the real shape.
                // "apagon" is the one that withholds the image itself.
                (hex === 'niebla' ? ' blur(14px)' : ''),
            }}
          />
        ) : (
          <div className="grid h-64 w-full place-items-center text-center text-white/40">
            {hex === 'apagon' ? (
              <span>
                <span className="block text-4xl">🌑</span>
                <span className="mt-2 block">Apagón — pujás a ciegas</span>
              </span>
            ) : (
              'Silueta no disponible'
            )}
          </div>
        )}
      </div>

      <div className="relative border-t border-white/10 bg-black/25 px-5 py-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-white/45">Puja actual</p>
            <p className="text-4xl font-black leading-none text-orange-400">{currentBid}</p>
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
