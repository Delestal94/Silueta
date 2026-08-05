'use client';

import { POSITION_LABELS, type CurrentRound } from '@/lib/game/types';

function ageAt(birthDate: string | null | undefined, year: number | null): number | null {
  if (!birthDate || !year) return null;
  const born = new Date(birthDate);
  if (Number.isNaN(born.getTime())) return null;
  return year - born.getFullYear();
}

const ERA_TONE: Record<string, string> = {
  Promesa: 'border-sky-300/40 bg-sky-400/15 text-sky-200',
  'En ascenso': 'border-teal-300/40 bg-teal-400/15 text-teal-200',
  Prime: 'border-orange-400/50 bg-orange-400/20 text-orange-300',
  Veterano: 'border-amber-300/40 bg-amber-400/15 text-amber-200',
  'Último tramo': 'border-rose-300/40 bg-rose-400/15 text-rose-200',
};

function ratingTone(rating: number): string {
  if (rating >= 88) return 'text-orange-400';
  if (rating >= 82) return 'text-emerald-300';
  if (rating >= 75) return 'text-amber-300';
  return 'text-white/70';
}

export function RevealCard({
  round,
  winnerName,
  footer,
}: {
  round: CurrentRound;
  winnerName: string | null;
  /** El control para pasar de ronda. Lo arma la sala, que sabe quién falta. */
  footer: React.ReactNode;
}) {
  // Espejismo stays quiet during the bidding, so the reveal is the first the
  // victim hears of it.
  const wasFooled = round.myHex?.power === 'espejismo';
  const p = round.player;
  const age = ageAt(p.birth_date, round.season_year);
  const rating = round.era_rating;

  // EA reuses the same six slots for keepers, but they mean diving, handling,
  // kicking, reflexes, speed and positioning — not the outfield attributes.
  const isKeeper = p.position_type === 'goalkeeper';
  const labels = isKeeper
    ? ['EST', 'MAN', 'SAQ', 'REF', 'VEL', 'POS']
    : ['RIT', 'TIR', 'PAS', 'REG', 'DEF', 'FÍS'];

  const attributes = [
    [labels[0], p.ea_pace],
    [labels[1], p.ea_shooting],
    [labels[2], p.ea_passing],
    [labels[3], p.ea_dribbling],
    [labels[4], p.ea_defending],
    [labels[5], p.ea_physical],
  ].filter(([, v]) => typeof v === 'number') as [string, number][];

  const facts = [
    ['Club', p.team],
    ['Posición', p.position],
    ['Nacionalidad', p.nationality],
    ['Altura', p.height],
    ['Dorsal', p.shirt_number],
    ['Pie', p.foot],
  ].filter(([, v]) => !!v) as [string, string][];

  return (
    // A column, so the button at the foot can never be the thing that gets
    // cut. The card sits in a pane pinned to the viewport height, and browser
    // zoom grows the contents without growing that pane: the overflow used to
    // be clipped from the bottom, taking "Siguiente silueta" with it and
    // leaving the round with no way forward.
    <section className="panel animate-pop flex min-h-0 flex-col overflow-hidden">
      {/* Everything except the footer scrolls. The card sits in a pane pinned
          to the viewport height, and browser zoom grows the contents without
          growing that pane; whatever did not fit used to be clipped from the
          bottom, and what lives at the bottom is the only way to start the
          next round. Letting the photo and the stats scroll costs a reader
          nothing — losing the button costs them the game. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* The pose that was a silhouette a second ago, now in colour. Same
            framing, same figure — the answer to what everyone was staring at,
            rather than a different photo of the same person. */}
        {p.colour_url && (
          <div className="relative flex min-h-[300px] items-end justify-center overflow-hidden sm:min-h-[380px]">
            <div
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-1/2 h-[460px] w-full max-w-[460px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
              style={{ background: 'radial-gradient(circle, rgba(245,130,31,0.22), transparent 65%)' }}
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.colour_url}
              alt={p.name}
              className="animate-reveal relative max-h-[360px] w-auto object-contain"
            />
          </div>
        )}

        <div className="grid gap-6 p-6 sm:grid-cols-[190px_minmax(0,1fr)]">
        <div className="mx-auto w-full max-w-[190px] space-y-3">
          {/* EA's official card carries the rating and the six stats. */}
          {p.ea_card_url || p.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={p.ea_card_url || p.photo_url || ''}
              alt={p.name}
              className="animate-pop w-full drop-shadow-[0_0_28px_rgba(245,130,31,0.35)]"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.silhouette_url ?? ''} alt="" className="w-full rounded-2xl" />
          )}

          {rating !== null && (
            <div className="rounded-2xl border border-orange-400/25 bg-black/40 px-3 py-3 text-center">
              <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">
                Puntos de esta subasta
              </p>
              <p className={`text-5xl font-black leading-none ${ratingTone(rating)}`}>{rating}</p>
              {round.season_year && (
                <p className="mt-1 text-xs text-white/45">
                  temporada {round.season_year}
                  {age !== null && ` · ${age} años`}
                </p>
              )}
              {p.ea_overall != null && p.ea_overall !== rating && (
                <p className="mt-1 text-[11px] text-white/30">hoy vale {p.ea_overall}</p>
              )}
            </div>
          )}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs uppercase tracking-[0.2em] text-orange-400">
              {round.status === 'unsold' ? 'Nadie lo compró' : 'Vendido'}
            </p>
            {round.era_label && (
              <span
                className={`chip ${ERA_TONE[round.era_label] ?? 'border-white/20 text-white/70'}`}
              >
                {round.era_label}
              </span>
            )}
          </div>

          <h2 className="mt-1 text-3xl font-black leading-tight">{p.name}</h2>

          {wasFooled && (
            <p className="animate-pop mt-2 rounded-xl border border-violet-300/40 bg-violet-500/15 px-3 py-2 text-sm text-violet-100">
              🪞 Te tiraron <strong>Espejismo</strong>: toda la ronda estuviste viendo la
              silueta de otro jugador.
            </p>
          )}

          {winnerName && round.status === 'sold' && (
            <p className="mt-2 text-white/70">
              Se lo lleva <span className="font-bold text-orange-400">{winnerName}</span> por{' '}
              <span className="font-bold text-orange-400">{round.current_bid}</span>
              {rating !== null && (
                <>
                  {' '}
                  y suma <span className="font-bold text-orange-400">{rating}</span> puntos
                </>
              )}
            </p>
          )}

          {attributes.length > 0 && (
            <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {attributes.map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl border border-white/10 bg-black/25 px-2 py-2 text-center"
                >
                  <p className="text-[10px] uppercase tracking-wider text-white/40">{label}</p>
                  <p className="text-lg font-black">{value}</p>
                </div>
              ))}
            </div>
          )}

          <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-3">
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt className="text-[11px] uppercase tracking-wider text-white/40">{label}</dt>
                <dd className="truncate text-sm font-semibold" title={value}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>

          {p.description && (
            <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-white/55">
              {p.description}
            </p>
          )}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-black/25 px-6 py-4">
        <p className="text-sm text-white/50">
          Ronda {round.round_number} · {POSITION_LABELS[round.position_type]}
        </p>
        {/* Confirman todos, no sólo el anfitrión: antes la ficha desaparecía
            cuando a otro se le ocurría seguir, sin que el resto llegara a
            leerla. */}
        {footer}
      </div>
    </section>
  );
}
