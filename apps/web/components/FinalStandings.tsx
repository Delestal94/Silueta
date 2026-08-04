'use client';

import Link from 'next/link';
import {
  POSITION_SHORT,
  countByPosition,
  isTeamComplete,
  rankParticipants,
  totalPoints,
  totalSpent,
  type Room,
} from '@/lib/game/types';

const MEDALS = ['🥇', '🥈', '🥉'];

export function FinalStandings({ room }: { room: Room }) {
  const ranked = rankParticipants(room.room_participants);
  const champion = ranked[0];
  const runnerUp = ranked[1];
  const tied = !!runnerUp && champion && totalPoints(runnerUp) === totalPoints(champion);

  return (
    <div className="mt-5 space-y-5">
      <div className="panel animate-pop relative overflow-hidden px-6 py-10 text-center">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(245,130,31,0.28), transparent 65%)' }}
        />
        <div className="relative">
          <p className="text-6xl">🏆</p>
          <p className="mt-4 text-xs uppercase tracking-[0.3em] text-white/45">Ganador</p>
          <h2 className="mt-1 text-4xl font-black">{champion?.display_name ?? '—'}</h2>
          {champion && (
            <p className="mt-3 text-lg text-white/70">
              <span className="text-3xl font-black text-orange-400">{totalPoints(champion)}</span>{' '}
              puntos con {champion.team_players.length} fichajes
            </p>
          )}
          {tied && (
            <p className="mt-2 text-sm text-amber-300">
              Empate en puntos — se define por quien gastó menos
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {ranked.map((p, index) => {
          const counts = countByPosition(p);
          const complete = isTeamComplete(p, room.requirements);
          const points = totalPoints(p);
          const spent = totalSpent(p);

          return (
            <section
              key={p.id}
              className={`panel animate-rise p-5 ${index === 0 ? 'border-orange-400/40' : ''}`}
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="flex min-w-0 items-center gap-2 text-lg font-bold">
                  <span>{MEDALS[index] ?? `${index + 1}.`}</span>
                  <span className="truncate">{p.display_name}</span>
                  {p.is_host && <span title="Anfitrión">👑</span>}
                </h3>
                <div className="shrink-0 text-right">
                  <p className="text-2xl font-black leading-none text-orange-400">{points}</p>
                  <p className="text-[11px] uppercase tracking-wider text-white/40">puntos</p>
                </div>
              </div>

              <div className="mt-1 flex flex-wrap gap-x-3 text-sm text-white/50">
                <span>Gastó {spent}</span>
                <span>·</span>
                <span>Le quedó {p.remaining_budget}</span>
                {complete && <span className="text-orange-400">· Equipo completo ✓</span>}
              </div>

              <ul className="mt-4 space-y-2">
                {p.team_players.map((s) => (
                  <li
                    key={s.players.id}
                    className="flex items-center gap-3 rounded-xl bg-black/25 px-3 py-2"
                  >
                    {s.players.photo_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={s.players.photo_url}
                        alt=""
                        className="h-10 w-10 rounded-full object-cover"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{s.players.name}</p>
                      <p className="truncate text-xs text-white/45">
                        {POSITION_SHORT[s.players.position_type]}
                        {s.season_year ? ` · ${s.season_year}` : ''}
                        {s.era_label ? ` · ${s.era_label}` : ''}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-black text-orange-400">{s.rating ?? '—'}</p>
                      <p className="text-[10px] text-white/35">pagó {s.purchase_price}</p>
                    </div>
                  </li>
                ))}
                {p.team_players.length === 0 && (
                  <li className="rounded-xl bg-black/20 px-3 py-4 text-center text-sm text-white/40">
                    No compró ningún jugador
                  </li>
                )}
              </ul>

              <div className="mt-3 flex gap-1">
                {(Object.keys(counts) as (keyof typeof counts)[]).map((pos) => (
                  <span
                    key={pos}
                    className={`flex-1 rounded-md px-1 py-1 text-center text-[10px] font-bold ${
                      counts[pos] >= (room.requirements[pos] ?? 0)
                        ? 'bg-orange-400/20 text-orange-400'
                        : 'bg-white/5 text-white/45'
                    }`}
                  >
                    {POSITION_SHORT[pos]} {counts[pos]}/{room.requirements[pos] ?? 0}
                  </span>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <div className="text-center">
        <Link href="/" className="btn-ghost">
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
