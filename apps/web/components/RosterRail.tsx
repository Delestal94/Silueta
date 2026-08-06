'use client';

import {
  POSITION_ORDER,
  POSITION_SHORT,
  countByPosition,
  hasPass,
  isTeamComplete,
  rankParticipants,
  totalPoints,
  type Room,
} from '@/lib/game/types';

export function RosterRail({
  room,
  meId,
  topBidderId,
  showHeading = true,
  onKick,
}: {
  room: Room;
  meId: string | null;
  topBidderId: string | null;
  /** Off inside the mobile tabs, where the tab itself is the heading. */
  showHeading?: boolean;
  /** Only supplied to the host. */
  onKick?: (id: string, name: string) => void;
}) {
  const position = room.current_position;
  // Ordered by points so the rail doubles as a live leaderboard.
  const ordered = rankParticipants(room.room_participants);

  return (
    // Not sticky. The rail it lives in is already its own scroll container, so
    // pinning this panel only made the ones below slide over it — and since
    // they come later in the DOM with an opaque background, they win. It went
    // unnoticed with one player because the powers panel is a stub until there
    // is somebody to aim at, and the rail had nothing to scroll.
    <aside className="panel h-fit p-3">
      {showHeading && (
        <h3 className="mb-2 px-1 text-sm font-bold">Tabla ({room.room_participants.length})</h3>
      )}

      <ul className="space-y-1.5">
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
                  ? 'border-orange-400/50 bg-orange-500/10'
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
                <div className="flex shrink-0 items-center gap-1.5">
                  <div className="text-right leading-tight">
                    <span className="block font-black text-orange-400">{totalPoints(p)} pts</span>
                    <span className="block text-[11px] text-white/40">💰 {p.remaining_budget}</span>
                  </div>
                  {onKick && !isMe && !p.is_host && (
                    <button
                      onClick={() => onKick(p.id, p.display_name)}
                      className="grid h-8 w-8 place-items-center rounded-lg text-white/25 transition hover:bg-rose-500/15 hover:text-rose-300"
                      title={`Echar a ${p.display_name}`}
                      aria-label={`Echar a ${p.display_name}`}
                    >
                      ✕
                    </button>
                  )}
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
                          ? 'bg-orange-400/20 text-orange-400'
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
                <span>
                  {p.is_ready && <span className="text-orange-400">listo · </span>}
                  {position && hasPass(p, position) ? 'pase disponible' : 'pase usado'}
                </span>
                {complete && <span className="text-orange-400">completo ✓</span>}
                {leading && !complete && <span className="text-orange-400">pujando</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
