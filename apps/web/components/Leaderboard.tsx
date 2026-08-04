'use client';

import { useEffect, useState } from 'react';

interface Entry {
  display_name: string;
  games: number;
  wins: number;
  best_score: number;
  average_score: number;
  best_signing: number;
  total_points: number;
}

const MEDALS = ['🥇', '🥈', '🥉'];

export function Leaderboard() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch('/api/leaderboard')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setEntries(d.entries ?? []))
      .catch(() => setFailed(true));
  }, []);

  if (failed) return null;

  if (!entries) {
    return (
      <section className="panel p-5 sm:p-6">
        <h2 className="text-xl font-black">Ranking</h2>
        <p className="mt-3 text-sm text-white/40">Cargando…</p>
      </section>
    );
  }

  if (!entries.length) {
    return (
      <section className="panel p-5 sm:p-6">
        <h2 className="text-xl font-black">Ranking</h2>
        <p className="mt-3 text-sm text-white/45">
          Todavía no terminó ninguna partida. El primero en completar un equipo entra acá.
        </p>
      </section>
    );
  }

  return (
    <section className="panel p-5 sm:p-6">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h2 className="text-xl font-black">Ranking</h2>
        <span className="text-xs text-white/40">mejores 20</span>
      </div>
      <p className="mb-4 text-xs leading-snug text-white/45">
        De todas las partidas terminadas. Se identifica por nombre, así que si dos personas usan
        el mismo comparten fila.
      </p>

      {/* Four columns, not six: in a 360px sidebar the extra ones were clipped
          off the right edge. The averages ride under the figures they
          qualify instead of claiming columns of their own. */}
      {/* Twenty two-line rows stand far taller than anything placed beside
          them, so the tail scrolls instead of dragging the layout down. */}
      <div className="max-h-[420px] overflow-y-auto pr-1">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-[#131f38]">
            <tr className="text-left text-[11px] uppercase tracking-wider text-white/40">
            <th className="pb-2 pr-2 font-medium">#</th>
            <th className="pb-2 pr-3 font-medium">Jugador</th>
            <th className="pb-2 pr-3 text-right font-medium">Mejor</th>
            <th className="pb-2 text-right font-medium">Ganadas</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr
              key={e.display_name}
              className={`border-t border-white/[0.07] ${i < 3 ? 'text-white' : 'text-white/70'}`}
            >
              <td className="py-2 pr-2 align-top tabular-nums">{MEDALS[i] ?? i + 1}</td>
              <td className="max-w-[9rem] py-2 pr-3 align-top">
                <span className="block truncate font-semibold" title={e.display_name}>
                  {e.display_name}
                </span>
                <span className="block text-[11px] text-white/35">
                  {e.games} partida{e.games === 1 ? '' : 's'}
                </span>
              </td>
              <td className="py-2 pr-3 text-right align-top">
                <span className="block font-black tabular-nums text-orange-400">
                  {e.best_score}
                </span>
                <span className="block text-[11px] text-white/35">prom. {e.average_score}</span>
              </td>
              <td className="py-2 text-right align-top tabular-nums">{e.wins}</td>
            </tr>
          ))}
        </tbody>
        </table>
      </div>
    </section>
  );
}
