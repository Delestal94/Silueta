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
}

/** Long club names have to fit a 340px rail. */
const SHORT: Record<string, string> = {
  'Central Córdoba de Santiago del Estero': 'Central Córdoba',
  'Estudiantes de La Plata': 'Estudiantes',
  'Independiente Rivadavia': 'Ind. Rivadavia',
  'Atlético Tucumán': 'Atl. Tucumán',
  'Gimnasia y Esgrima La Plata': 'Gimnasia LP',
  'Newell´s Old Boys': "Newell's",
  "Newell's Old Boys": "Newell's",
  'Argentinos Juniors': 'Argentinos Jrs',
  'Defensa y Justicia': 'Defensa y Just.',
  'Deportivo Riestra': 'Dep. Riestra',
  'Instituto de Córdoba': 'Instituto',
};

const short = (name: string) => SHORT[name] ?? name;

export function Scoreboard() {
  const [matches, setMatches] = useState<Match[] | null>(null);

  useEffect(() => {
    const load = () =>
      fetch('/api/scores')
        .then((r) => (r.ok ? r.json() : { matches: [] }))
        .then((d) => setMatches(d.matches ?? []))
        .catch(() => setMatches([]));

    load();
    // A live score that never updates is worse than none.
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  // Nothing to show is not an error state; the rail just stays out of the way.
  if (!matches || !matches.length) return null;

  return (
    <section className="panel p-5 sm:p-6">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h2 className="text-xl font-black">Fútbol argentino</h2>
        {matches.some((m) => m.state === 'live') && (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-rose-400">
            <span className="h-1.5 w-1.5 animate-pulse-ring rounded-full bg-rose-500" />
            en vivo
          </span>
        )}
      </div>
      <p className="mb-4 text-xs text-white/45">Liga Profesional</p>

      <ul className="space-y-1.5">
        {matches.map((m) => {
          const live = m.state === 'live';
          const played = m.homeScore !== null && m.awayScore !== null;
          const homeWon = played && (m.homeScore ?? 0) > (m.awayScore ?? 0);
          const awayWon = played && (m.awayScore ?? 0) > (m.homeScore ?? 0);

          return (
            <li
              key={m.id}
              className={`rounded-xl border px-3 py-2.5 ${
                live ? 'border-rose-400/30 bg-rose-500/[0.07]' : 'border-white/10 bg-white/[0.03]'
              }`}
            >
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span
                  className={`text-[10px] font-semibold uppercase tracking-wider ${
                    live ? 'text-rose-400' : 'text-white/35'
                  }`}
                >
                  {m.label}
                </span>
              </div>

              <Row
                name={short(m.home)}
                badge={m.homeBadge}
                score={m.homeScore}
                dim={played && !homeWon}
              />
              <Row
                name={short(m.away)}
                badge={m.awayBadge}
                score={m.awayScore}
                dim={played && !awayWon}
              />
            </li>
          );
        })}
      </ul>
    </section>
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
        <img src={badge} alt="" className="h-4 w-4 shrink-0 object-contain" />
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
