'use client';

import type { Participant } from '@/lib/game/types';

/**
 * Pasar de ronda por acuerdo de todos.
 *
 * Lo usa la pantalla de espera y también el pie de la revelación: antes ahí
 * decidía el anfitrión solo, así que el resto se quedaba mirando una ficha que
 * desaparecía cuando a otro se le ocurría. Ahora la silueta siguiente sale
 * cuando todos dicen que la vieron.
 *
 * El anfitrión conserva el atajo para arrancar igual, que existe para cuando
 * alguien se fue de la computadora y si no la sala queda trabada.
 */
export function ConfirmarRonda({
  participants,
  meId,
  isHost,
  onReady,
  onForce,
  busy,
  /** Nadie necesita más jugadores: lo que sigue es el resultado, no otra ronda. */
  terminado = false,
  compact = false,
}: {
  participants: Participant[];
  meId: string | null;
  isHost: boolean;
  onReady: () => void;
  onForce: () => void;
  busy: boolean;
  terminado?: boolean;
  compact?: boolean;
}) {
  const listos = participants.filter((p) => p.is_ready);
  const yoListo = participants.some((p) => p.id === meId && p.is_ready);
  const faltan = participants.filter((p) => !p.is_ready);

  const etiqueta = terminado ? 'Ver resultado' : 'Estoy listo';
  const esperando = terminado ? 'Esperando al resto para mostrar el resultado' : 'Esperando al resto';

  return (
    <div
      className={
        compact
          ? 'flex flex-wrap items-center justify-end gap-2'
          : 'flex flex-col items-center gap-3'
      }
    >
      {!compact && (
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {participants.map((p) => (
            <span
              key={p.id}
              className={`chip ${
                p.is_ready
                  ? 'border-orange-400/40 bg-orange-400/15 text-orange-300'
                  : 'text-white/45'
              }`}
            >
              {p.is_ready ? '✓' : '⋯'} {p.display_name}
            </span>
          ))}
        </div>
      )}

      <span className="text-sm text-white/45">
        {listos.length} de {participants.length} {yoListo ? `· ${esperando}` : 'listos'}
      </span>

      {!yoListo ? (
        <button
          onClick={onReady}
          disabled={busy}
          className={compact ? 'btn-primary shrink-0' : 'btn-primary px-8 py-3 text-lg'}
        >
          {busy ? 'Un segundo…' : etiqueta}
        </button>
      ) : (
        <span className="chip border-orange-400/40 text-orange-300">Confirmaste</span>
      )}

      {isHost && faltan.length > 0 && (
        <button
          onClick={onForce}
          disabled={busy}
          className="btn-ghost text-sm"
          title="Seguir sin esperar al resto"
        >
          Seguir igual ({faltan.length} sin marcar)
        </button>
      )}
    </div>
  );
}
