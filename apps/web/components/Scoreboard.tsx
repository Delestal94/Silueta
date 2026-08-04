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
  days: Day[];
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

  useEffect(() => {
    const load = () =>
      fetch('/api/scores')
        .then((r) => (r.ok ? r.json() : { days: [] }))
        .then((d) => setFeed(d))
        .catch(() => setFeed({ league: null, season: null, days: [] }));

    load();
    // A live score that never updates is worse than none.
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  // Nothing to show is not an error state; the rail just stays out of the way.
  if (!feed || !feed.days.length) return null;

  const anyLive = feed.days.some((d) => d.matches.some((m) => m.state === 'live'));

  return (
    <section className="panel p-5 sm:p-6">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h2 className="text-xl font-black">Fútbol argentino</h2>
        {anyLive && (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-rose-400">
            <span className="h-1.5 w-1.5 animate-pulse-ring rounded-full bg-rose-500" />
            en vivo
          </span>
        )}
      </div>
      <p className="mb-4 text-xs text-white/45">
        Liga Profesional{feed.season ? ` · ${feed.season}` : ''}
      </p>

      <div className="space-y-5">
        {feed.days.map((day) => (
          <div key={day.date}>
            <div className="mb-2 flex items-baseline justify-between gap-2 border-b border-white/10 pb-1.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-white/70">
                {day.title}
                <span className="ml-1.5 font-medium normal-case tracking-normal text-white/35">
                  {day.subtitle}
                </span>
              </h3>
              {day.round !== null && (
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-orange-400/80">
                  Fecha {day.round}
                </span>
              )}
            </div>

            <ul className="space-y-1.5">
              {day.matches.map((m) => (
                <Fixture key={m.id} match={m} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
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
