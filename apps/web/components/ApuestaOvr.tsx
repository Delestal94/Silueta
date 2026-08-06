'use client';

import { useState } from 'react';

/**
 * El reto por el OVR del jugador que acabás de comprar.
 *
 * Dos columnas: a la izquierda lo que se gana y lo que se pierde con la
 * probabilidad que te tocó, a la derecha la salida. Los dos números salen
 * sorteados por separado en el servidor cuando se cierra la compra, así que
 * puede tocarte una apuesta regalada o una trampa — y refrescar la página no
 * cambia la que te tocó.
 */

/**
 * Las frases, elegidas por el id del jugador.
 *
 * Con Math.random() cambiarían en cada dibujado —React redibuja cada vez que
 * llega algo por el canal de la sala— y el texto parpadearía mientras lo estás
 * leyendo. Con el id, cada silueta tiene la suya y se queda quieta.
 */
const ARENGAS = [
  'El técnico lo mira desde el banco. Si la mete, es titular el domingo.',
  'Está pidiendo la pelota para patear el penal. Vos decidís si se la das.',
  'Dice que en su barrio no la erraba nunca.',
  'Le prometió el gol a la abuela. Habrá que ver.',
  'Se está sacando la campera. Quiere entrar.',
  'Mano a mano con el arquero. No hay vuelta atrás.',
];

const EXCUSAS = [
  'Mejor no. Está lindo el equipo así.',
  'No, pibe, andá a bañarte.',
  'Lo dejamos en el banco. Que mire y aprenda.',
  'Ya bastante caro salió como para arriesgarlo.',
  'El técnico prefiere no tocar lo que funciona.',
  'Paso. No estoy para infartos.',
];

const frase = (lista: string[], semilla: string) => {
  let h = 0;
  for (let i = 0; i < semilla.length; i++) h = (h * 31 + semilla.charCodeAt(i)) | 0;
  return lista[Math.abs(h) % lista.length];
};

export interface RetoOvr {
  prob: number;
  gana: number;
  pierde: number;
}

/**
 * La flecha de tendencia, dibujada.
 *
 * Con los caracteres ↗ y ↘ el navegador los resuelve como emoji y salen dos
 * cuadraditos azules que no combinan con nada; un trazo propio hereda el color
 * del texto.
 */
function Tendencia({ sube }: { sube: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {sube ? (
        <>
          <path d="M3 17l6-6 4 4 8-8" />
          <path d="M15 7h6v6" />
        </>
      ) : (
        <>
          <path d="M3 7l6 6 4-4 8 8" />
          <path d="M15 17h6v-6" />
        </>
      )}
    </svg>
  );
}

export function ApuestaOvr({
  reto,
  playerId,
  rating,
  onDecidir,
}: {
  reto: RetoOvr;
  playerId: string;
  /** El rating con el que quedó el fichaje, para mostrar de dónde parte. */
  rating: number | null;
  onDecidir: (decision: 'va' | 'paso') => Promise<void>;
}) {
  const [ocupado, setOcupado] = useState(false);

  const decidir = async (decision: 'va' | 'paso') => {
    if (ocupado) return;
    setOcupado(true);
    try {
      await onDecidir(decision);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <section className="panel animate-pop space-y-4 p-5">
      <header className="space-y-1">
        <h3 className="text-lg font-bold">
          ¿Te la jugás por el OVR?
          {typeof rating === 'number' && (
            <span className="ml-2 text-sm font-medium text-white/45">ahora vale {rating}</span>
          )}
        </h3>
        <p className="text-sm text-white/50">Una sola vez, y sólo por este jugador.</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Izquierda: lo que está en juego. */}
        <div className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3">
              <span className="flex items-center gap-2 text-lg font-bold text-emerald-300">
                <Tendencia sube /> +{reto.gana} OVR
              </span>
              <span className="rounded-full bg-emerald-400/20 px-3 py-1.5 text-sm font-bold text-emerald-300 tabular-nums">
                {reto.prob}%
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-400/25 bg-rose-400/10 px-4 py-3">
              <span className="flex items-center gap-2 text-lg font-bold text-rose-300">
                <Tendencia sube={false} /> −{reto.pierde} OVR
              </span>
              <span className="rounded-full bg-rose-400/20 px-3 py-1.5 text-sm font-bold text-rose-300 tabular-nums">
                {100 - reto.prob}%
              </span>
            </div>
          </div>

          <p className="text-base italic leading-relaxed text-white/60">
            {frase(ARENGAS, playerId)}
          </p>

          <button
            type="button"
            className="btn-primary w-full py-3 text-base font-bold"
            disabled={ocupado}
            onClick={() => decidir('va')}
          >
            Me la juego
          </button>
        </div>

        {/* Derecha: la salida. */}
        <div className="flex flex-col justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <p className="text-base italic leading-relaxed text-center text-white/60">
            {frase(EXCUSAS, playerId)}
          </p>
          <button
            type="button"
            className="btn-ghost w-full py-3 text-base font-bold"
            disabled={ocupado}
            onClick={() => decidir('paso')}
          >
            Así está bien
          </button>
        </div>
      </div>
    </section>
  );
}

/** Lo que pasó, una vez que ya se decidió. */
export function ResultadoOvr({ bet, delta, rating }: { bet: string; delta: number | null; rating: number | null }) {
  if (bet === 'paso') {
    return (
      <p className="panel px-4 py-3 text-sm text-white/50">
        No te la jugaste. Queda en {rating ?? '—'}.
      </p>
    );
  }

  const subio = (delta ?? 0) > 0;
  return (
    <p
      className={`panel animate-pop px-4 py-3 text-sm font-semibold ${
        subio ? 'text-emerald-300' : 'text-rose-300'
      }`}
    >
      {subio ? '¡Entró!' : 'La erró.'}{' '}
      <span className="tabular-nums">
        {delta === 0 ? 'sin cambios' : `${subio ? '+' : ''}${delta} OVR`}
      </span>
      {typeof rating === 'number' && (
        <span className="font-medium text-white/45"> · queda en {rating}</span>
      )}
    </p>
  );
}
