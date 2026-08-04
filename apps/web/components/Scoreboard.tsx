'use client';

import { useEffect, useState } from 'react';

interface Match {
  id: string;
  home: string;
  away: string;
  homeBadge: string | null;
  awayBadge: string | null;
  homeScore: number | null;
  awayScore: number | null;
  state: string;
  label: string;
  round: number | null;
  venue: string | null;
  time: string;
  day: string;
}

interface Day {
  date: string;
  title: string;
  subtitle: string;
  round: number | null;
  matches: Match[];
}

interface Feed {
  league: string | null;
  season: string | null;
  /** Today in Buenos Aires, so "volver a hoy" knows where hoy is. */
  today: string;
  day: Day;
}

/** Shifts a YYYY-MM-DD by whole days, clear of any timezone edge. */
function shift(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Long club names have to fit a 300px rail. */
const SHORT: Record<string, string> = {
  'Central Córdoba de Santiago del Estero': 'Central Córdoba',
  'Estudiantes de La Plata': 'Estudiantes',
  'Independiente Rivadavia': 'Ind. Rivadavia',
  'Atlético Tucumán': 'Atl. Tucumán',
  'Gimnasia y Esgrima de La Plata': 'Gimnasia LP',
  'Gimnasia y Esgrima La Plata': 'Gimnasia LP',
  'Gimnasia y Esgrima de Mendoza': 'Gimnasia Mza',
  'Newell´s Old Boys': "Newell's",
  "Newell's Old Boys": "Newell's",
  'Argentinos Juniors': 'Argentinos Jrs',
  'Defensa y Justicia': 'Defensa y Just.',
  'Deportivo Riestra': 'Dep. Riestra',
  'Instituto de Córdoba': 'Instituto',
  'Talleres de Córdoba': 'Talleres',
  'Vélez Sarsfield': 'Vélez',
};

const short = (name: string) => SHORT[name] ?? name;

/** Estadio names are long and the rail is not; the club already located it. */
const venue = (name: string) => name.replace(/^Estadio\s+/i, '').split(' - ')[0];

export function Scoreboard() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = () =>
      // no-store, or the browser serves its own cached copy back and the poll
      // silently does nothing. The CDN behind this is what keeps the upstream
      // from being hit once per viewer.
      fetch(`/api/scores${date ? `?d=${date}` : ''}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d) => !cancelled && setFeed(d))
        .catch(() => !cancelled && setFailed(true));

    load();
    // A live score that never updates is worse than none.
    const t = setInterval(load, 30_000);

    // Coming back to the tab after a while should not show a stale score for
    // another half minute.
    const wake = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', wake);

    return () => {
      cancelled = true;
      clearInterval(t);
      document.removeEventListener('visibilitychange', wake);
    };
  }, [date]);

  // Nothing to show is not an error state; the rail just stays out of the way.
  // Once a day has loaded the panel stays, even on a day with no matches —
  // otherwise stepping onto an empty Tuesday would take the arrows with it.
  if (failed || !feed) return null;

  const { day } = feed;
  const live = day.matches.some((m) => m.state === 'live');
  // Whether the reader has steered, not whether the date happens to differ:
  // with no matches today the default view already opens on the last day that
  // had them, and offering to "go back" to where you already are is noise.
  const away = date !== null;

  return (
    <section className="panel p-5 sm:p-6">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h2 className="text-xl font-black">Fútbol argentino</h2>
        {live && (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-rose-400">
            <span className="h-1.5 w-1.5 animate-pulse-ring rounded-full bg-rose-500" />
            en vivo
          </span>
        )}
      </div>
      <p className="mb-3 text-xs text-white/45">
        Liga Profesional{feed.season ? ` · ${feed.season}` : ''}
      </p>

      <div className="mb-2 flex items-center gap-1 border-b border-white/10 pb-1.5">
        <Arrow dir="prev" onClick={() => setDate(shift(day.date, -1))} />

        <div className="min-w-0 flex-1 text-center">
          <h3 className="truncate text-xs font-bold uppercase tracking-wider text-white/70">
            {day.title}
            <span className="ml-1.5 font-medium normal-case tracking-normal text-white/35">
              {day.subtitle}
            </span>
          </h3>
          {day.round !== null && (
            <span className="text-[10px] font-semibold uppercase tracking-wider text-orange-400/80">
              Fecha {day.round}
            </span>
          )}
        </div>

        <Arrow dir="next" onClick={() => setDate(shift(day.date, 1))} />
      </div>

      {day.matches.length ? (
        <ul className="space-y-1.5">
          {day.matches.map((m) => (
            <Fixture key={m.id} match={m} />
          ))}
        </ul>
      ) : (
        <p className="py-6 text-center text-xs text-white/35">Sin partidos este día.</p>
      )}

      {/* Only once you have wandered off: on today it would be a button that
          does nothing. */}
      {away && (
        <button
          // null, not today's date: that drops the ?d= and gets the default
          // view back, which knows to fall back off an empty day.
          onClick={() => setDate(null)}
          className="mt-3 w-full rounded-lg border border-white/10 py-2 text-xs font-semibold text-white/50 transition hover:border-white/25 hover:text-white"
        >
          Volver a hoy
        </button>
      )}
    </section>
  );
}

function Arrow({ dir, onClick }: { dir: 'prev' | 'next'; onClick: () => void }) {
  const prev = dir === 'prev';
  return (
    <button
      onClick={onClick}
      aria-label={prev ? 'Día anterior' : 'Día siguiente'}
      title={prev ? 'Día anterior' : 'Día siguiente'}
      className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white/40 transition hover:bg-white/10 hover:text-white"
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
        <path
          d={prev ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

function Fixture({ match: m }: { match: Match }) {
  const live = m.state === 'live';
  const played = m.homeScore !== null && m.awayScore !== null;
  const homeWon = played && (m.homeScore ?? 0) > (m.awayScore ?? 0);
  const awayWon = played && (m.awayScore ?? 0) > (m.homeScore ?? 0);

  return (
    <li
      className={`rounded-xl border px-3 py-2.5 ${
        live ? 'border-rose-400/30 bg-rose-500/[0.07]' : 'border-white/10 bg-white/[0.03]'
      }`}
    >
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span
          className={`text-[10px] font-semibold uppercase tracking-wider ${
            live
              ? 'text-rose-400'
              : m.state === 'off'
                ? 'text-amber-400/80'
                : 'text-white/35'
          }`}
        >
          {m.label}
        </span>
        {/* The kick-off time still matters once a match is under way — it says
            how far along it is, which the free feed will not tell us. */}
        {live && m.time && <span className="text-[10px] text-white/30">desde {m.time}</span>}
      </div>

      <Row name={short(m.home)} badge={m.homeBadge} score={m.homeScore} dim={played && !homeWon} />
      <Row name={short(m.away)} badge={m.awayBadge} score={m.awayScore} dim={played && !awayWon} />

      {/* Only where there is no score to look at: before kick-off the ground is
          the most useful thing left to say. */}
      {!played && m.venue && (
        <p className="mt-1.5 truncate text-[10px] text-white/30" title={m.venue}>
          {venue(m.venue)}
        </p>
      )}
    </li>
  );
}

function Row({
  name,
  badge,
  score,
  dim,
}: {
  name: string;
  badge: string | null;
  score: number | null;
  dim: boolean;
}) {
  return (
    <div className={`flex items-center gap-2 py-0.5 ${dim ? 'text-white/45' : 'text-white'}`}>
      {badge ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={badge} alt="" loading="lazy" className="h-4 w-4 shrink-0 object-contain" />
      ) : (
        <span className="h-4 w-4 shrink-0" />
      )}
      <span className="min-w-0 flex-1 truncate text-sm font-medium" title={name}>
        {name}
      </span>
      <span className="shrink-0 text-sm font-black tabular-nums">{score ?? '–'}</span>
    </div>
  );
}
