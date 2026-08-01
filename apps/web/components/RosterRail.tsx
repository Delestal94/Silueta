'use client';

import {
  POSITION_ORDER,
  POSITION_SHORT,
  countByPosition,
  isTeamComplete,
  rankParticipants,
  totalPoints,
  type Room,
} from '@/lib/game/types';

export function RosterRail({
  room,
  meId,
  topBidderId,
}: {
  room: Room;
  meId: string | null;
  topBidderId: string | null;
}) {
  // Ordered by points so the rail doubles as a live leaderboard.
  const ordered = rankParticipants(room.room_participants);

  return (
    <aside className="panel h-fit p-4 lg:sticky lg:top-5">
      <h3 className="mb-3 px-1 font-bold">Tabla ({room.room_participants.length})</h3>

      <ul className="space-y-2">
        {ordered.map((p) => {
          const counts = countByPosition(p);
          const complete = isTeamComplete(p, room.requirements);
          const isMe = p.id === meId;
          const leading = p.id === topBidderId;

          return (
            <li
              key={p.id}
              className={`rounded-xl border px-3 py-2.5 transition ${
                leading
                  ? 'border-lime-300/50 bg-lime-300/10'
                  : isMe
                    ? 'border-white/20 bg-white/[0.07]'
                    : 'border-white/10 bg-white/[0.03]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="flex min-w-0 items-center gap-1.5 truncate font-semibold">
                  {p.is_host && <span title="Anfitrión">👑</span>}
                  <span className="truncate">{p.display_name}</span>
                  {isMe && <span className="text-xs text-white/40">(vos)</span>}
                </p>
                <div className="shrink-0 text-right leading-tight">
                  <span className="block font-black text-lime-300">{totalPoints(p)} pts</span>
                  <span className="block text-[11px] text-white/40">💰 {p.remaining_budget}</span>
                </div>
              </div>

              <div className="mt-2 flex items-center gap-1">
                {POSITION_ORDER.map((pos) => {
                  const have = counts[pos];
                  const need = room.requirements[pos] ?? 0;
                  return (
                    <span
                      key={pos}
                      className={`flex-1 rounded-md px-1 py-1 text-center text-[10px] font-bold ${
                        have >= need
                          ? 'bg-lime-300/20 text-lime-300'
                          : 'bg-white/5 text-white/45'
                      }`}
                      title={`${POSITION_SHORT[pos]} ${have}/${need}`}
                    >
                      {have}/{need}
                    </span>
                  );
                })}
              </div>

              <div className="mt-1.5 flex items-center justify-between text-[11px] text-white/40">
                <span>{p.passes_used >= 1 ? 'pase usado' : 'pase disponible'}</span>
                {complete && <span className="text-lime-300">completo ✓</span>}
                {leading && !complete && <span className="text-lime-300">pujando</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
