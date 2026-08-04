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
      <section className="panel mt-5 p-6">
        <h2 className="text-center text-xl font-black">Ranking</h2>
        <p className="mt-3 text-center text-sm text-white/40">Cargando…</p>
      </section>
    );
  }

  if (!entries.length) {
    return (
      <section className="panel mt-5 p-6">
        <h2 className="text-center text-xl font-black">Ranking</h2>
        <p className="mt-3 text-center text-sm text-white/45">
          Todavía no terminó ninguna partida. El primero en completar un equipo entra acá.
        </p>
      </section>
    );
  }

  return (
    <section className="panel mt-5 p-5 sm:p-6">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h2 className="text-xl font-black">Ranking</h2>
        <span className="text-xs text-white/40">mejores 20</span>
      </div>
      <p className="mb-4 text-xs text-white/45">
        De todas las partidas terminadas. Se identifica por nombre, así que si dos personas
        usan el mismo comparten fila.
      </p>

      <div className="-mx-2 overflow-x-auto px-2">
        <table className="w-full min-w-[340px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-white/40">
              <th className="pb-2 pr-2 font-medium">#</th>
              <th className="pb-2 pr-3 font-medium">Jugador</th>
              <th className="pb-2 pr-3 text-right font-medium">Mejor</th>
              <th className="hidden pb-2 pr-3 text-right font-medium sm:table-cell">Prom.</th>
              <th className="pb-2 pr-3 text-right font-medium">Ganadas</th>
              <th className="pb-2 text-right font-medium">Jug.</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr
                key={e.display_name}
                className={`border-t border-white/[0.07] ${i < 3 ? 'text-white' : 'text-white/70'}`}
              >
                <td className="py-2 pr-2 tabular-nums">{MEDALS[i] ?? i + 1}</td>
                <td className="max-w-[10rem] truncate py-2 pr-3 font-semibold" title={e.display_name}>
                  {e.display_name}
                </td>
                <td className="py-2 pr-3 text-right font-black tabular-nums text-orange-400">
                  {e.best_score}
                </td>
                <td className="hidden py-2 pr-3 text-right tabular-nums sm:table-cell">
                  {e.average_score}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">{e.wins}</td>
                <td className="py-2 text-right tabular-nums text-white/45">{e.games}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
