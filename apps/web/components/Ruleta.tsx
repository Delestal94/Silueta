'use client';

import { useEffect, useState } from 'react';

export interface Sorteado {
  id: string;
  display_name: string;
}

/**
 * El sorteo entre los que empataron, mostrado.
 *
 * El servidor ya eligió: esto no decide nada, lo cuenta. Empieza con todos los
 * nombres tapados, los va recorriendo cada vez más lento, y al frenar destapa
 * al que ganó.
 *
 * Los nombres arrancan tapados y no borrosos: un desenfoque sobre texto corto
 * se lee igual entrecerrando los ojos, y toda la gracia es no saber hasta que
 * frena.
 */
export function Ruleta({
  sorteados,
  ganadorId,
  meId,
}: {
  sorteados: Sorteado[];
  ganadorId: string | null;
  meId: string | null;
}) {
  const ganadorIdx = Math.max(0, sorteados.findIndex((s) => s.id === ganadorId));
  const [idx, setIdx] = useState(0);
  const [girando, setGirando] = useState(true);

  useEffect(() => {
    if (sorteados.length < 2) {
      setGirando(false);
      return;
    }

    // Vueltas completas y después frena justo en el ganador: así el recorrido
    // termina donde tiene que terminar sin que el último salto se note forzado.
    const vueltas = sorteados.length * 3 + ganadorIdx;
    let paso = 0;
    let vivo = true;
    let t: ReturnType<typeof setTimeout>;

    const tic = () => {
      if (!vivo) return;
      setIdx(paso % sorteados.length);

      if (paso >= vueltas) {
        setGirando(false);
        return;
      }

      // Arranca rápido y se va frenando: es lo que hace que parezca una ruleta
      // y no una lista parpadeando.
      const restante = vueltas - paso;
      const espera = restante > 6 ? 90 : 90 + (7 - restante) * 85;
      paso += 1;
      t = setTimeout(tic, espera);
    };

    tic();
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [sorteados.length, ganadorIdx]);

  if (!sorteados.length) return null;

  return (
    <div className="panel animate-pop p-4">
      <p className="mb-1 text-center text-xs uppercase tracking-widest text-white/45">
        Empataron la oferta
      </p>
      <p className="mb-3 text-center text-sm text-white/55">
        {girando ? 'Sorteando…' : 'Se lo lleva'}
      </p>

      <ul className="flex flex-wrap justify-center gap-2">
        {sorteados.map((s, i) => {
          const señalado = i === idx;
          const ganó = !girando && s.id === ganadorId;
          const destapado = ganó || (!girando && false);

          return (
            <li
              key={s.id}
              className={`min-w-[7rem] rounded-xl border px-3 py-2.5 text-center transition-all duration-150 ${
                ganó
                  ? 'scale-105 border-orange-400/70 bg-orange-500/15'
                  : señalado
                    ? 'border-white/40 bg-white/10'
                    : 'border-white/10 bg-white/[0.03]'
              }`}
            >
              {destapado ? (
                <span className="text-sm font-bold text-orange-300">
                  {s.display_name}
                  {s.id === meId && <span className="text-white/45"> (vos)</span>}
                </span>
              ) : (
                // Tapado de verdad: el nombre no está en el DOM hasta que
                // frena, así que tampoco se puede leer desde el inspector.
                <span
                  className="block select-none text-sm font-bold tracking-[0.3em] text-white/35"
                  aria-hidden
                >
                  ●●●●
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {!girando && (
        <p className="mt-3 text-center text-xs text-white/40">
          Los dos habían sido empujados a ofertar lo mismo.
        </p>
      )}
    </div>
  );
}
