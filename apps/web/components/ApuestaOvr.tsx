'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * El reto por el OVR del jugador que se acaba de vender.
 *
 * Lo mira toda la sala: decide el que se llevó la silueta, y el resto ve girar
 * la misma ruleta y se entera de cómo le fue. Los dos números salen sorteados
 * por separado en el servidor cuando se cierra la compra, así que puede tocar
 * una apuesta regalada o una trampa — y refrescar la página no cambia la que
 * tocó.
 *
 * Un solo componente para el dueño y para los que miran, y no dos: el estado
 * está en el fichaje, que llega a todos por el mismo canal. Con el resultado
 * afuera —el padre cambiando un componente por otro cuando ovr_bet deja de
 * estar en null— la ruleta se desmontaba a mitad de giro, porque la respuesta
 * del servidor refresca la sala antes de devolver.
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

/**
 * La ruleta: se van encendiendo una y otra fila, cada vez más lento.
 *
 * Con setInterval el paso sería siempre igual y parecería un parpadeo; con un
 * setTimeout que se reagenda solo, cada salto tarda un poco más que el anterior
 * y queda el frenado de una ruleta de verdad. El sorteo ya está hecho en el
 * servidor, así que esto es puro suspenso — no decide nada.
 */
function useRuleta(girando: boolean) {
  const [encendida, setEncendida] = useState<0 | 1>(0);

  useEffect(() => {
    if (!girando) return;

    let temporizador: ReturnType<typeof setTimeout>;
    let espera = 70;

    const saltar = () => {
      setEncendida((v) => (v === 0 ? 1 : 0));
      espera = Math.min(240, espera + 7);
      temporizador = setTimeout(saltar, espera);
    };

    temporizador = setTimeout(saltar, espera);
    return () => clearTimeout(temporizador);
  }, [girando]);

  return encendida;
}

export function ApuestaOvr({
  reto,
  playerId,
  rating,
  quien,
  mio,
  bet,
  delta,
  onDecidir,
}: {
  reto: RetoOvr;
  playerId: string;
  /** El rating con el que quedó el fichaje, para mostrar de dónde parte. */
  rating: number | null;
  /** El nombre del que se llevó la silueta. */
  quien: string;
  /** Si el que mira es el que decide. */
  mio: boolean;
  /** null mientras no decidió; después 'va' o 'paso'. */
  bet: string | null;
  delta: number | null;
  onDecidir: (decision: 'va' | 'paso') => Promise<void>;
}) {
  const [ocupado, setOcupado] = useState(false);
  /** Hasta cuándo sigue girando la ruleta, o null si no está girando. */
  const [girandoHasta, setGirandoHasta] = useState<number | null>(null);
  const betAnterior = useRef(bet);

  const girando = girandoHasta !== null;
  const encendida = useRuleta(girando);

  // El que mira arranca la ruleta cuando la apuesta pasa de "sin decidir" a
  // "se la jugó"; el que decide, ya en el clic, para no quedarse mirando un
  // panel quieto mientras va y viene el pedido. Quien entra o refresca con la
  // apuesta ya resuelta no ve nada girar: no hay suspenso que hacer de algo
  // que pasó hace dos rondas.
  useEffect(() => {
    const antes = betAnterior.current;
    betAnterior.current = bet;
    if (antes === null && bet === 'va') setGirandoHasta((v) => v ?? Date.now() + 1600);
  }, [bet]);

  useEffect(() => {
    if (girandoHasta === null) return;
    const falta = Math.max(0, girandoHasta - Date.now());
    const t = setTimeout(() => setGirandoHasta(null), falta);
    return () => clearTimeout(t);
  }, [girandoHasta]);

  const decidir = async (decision: 'va' | 'paso') => {
    if (ocupado) return;
    setOcupado(true);
    // La ruleta corre un mínimo aunque el servidor conteste al instante: sin
    // ese piso el resultado aparecía antes de que se llegara a ver girar, que
    // es justo la parte que da el nervio.
    if (decision === 'va') setGirandoHasta(Date.now() + 1800);
    try {
      await onDecidir(decision);
    } finally {
      setOcupado(false);
    }
  };

  const decidido = bet !== null && !girando;
  const subio = (delta ?? 0) > 0;
  const bajo = (delta ?? 0) < 0;

  // Durante la ruleta se turnan las dos filas. Cuando ya se sabe, queda
  // encendida la que salió; con delta en cero —un 99 que no puede subir más,
  // un 40 que no puede bajar— no se enciende ninguna, porque no pasó nada.
  const luz = (fila: 0 | 1) => {
    if (girando) {
      return encendida === fila ? 'scale-[1.04] brightness-125' : 'opacity-30 saturate-50';
    }
    if (!decidido || bet !== 'va') return '';
    const ganadora = fila === 0 ? subio : bajo;
    return ganadora ? 'scale-[1.04] brightness-125' : 'opacity-30 saturate-50';
  };

  return (
    <section className="panel animate-pop space-y-4 p-5">
      <header className="space-y-1">
        <h3 className="text-lg font-bold">
          {mio ? '¿Te la jugás por el OVR?' : `El reto de ${quien}`}
          {typeof rating === 'number' && (
            <span className="ml-2 text-sm font-medium text-white/45">
              {decidido ? 'quedó en' : 'ahora vale'} {rating}
            </span>
          )}
        </h3>
        <p className="text-sm text-white/50">
          {mio
            ? 'Una sola vez, y sólo por este jugador.'
            : 'Se lo juega quien se llevó la silueta. Vos mirás.'}
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Izquierda: lo que está en juego. El pb-5 iguala el p-5 de la caja de
            enfrente: sin él este botón llega hasta el fondo de la columna y el
            otro se queda 20px más arriba, apoyado en el borde de su caja. */}
        <div className="flex flex-col justify-between gap-4 pb-5">
          <div className="space-y-3">
            <div
              className={`flex items-center justify-between gap-3 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 transition-all duration-100 ${luz(0)}`}
            >
              <span className="flex items-center gap-2 text-lg font-bold text-emerald-300">
                <Tendencia sube /> +{reto.gana} OVR
              </span>
              <span className="rounded-full bg-emerald-400/20 px-3 py-1.5 text-sm font-bold text-emerald-300 tabular-nums">
                {reto.prob}%
              </span>
            </div>
            <div
              className={`flex items-center justify-between gap-3 rounded-xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 transition-all duration-100 ${luz(1)}`}
            >
              <span className="flex items-center gap-2 text-lg font-bold text-rose-300">
                <Tendencia sube={false} /> −{reto.pierde} OVR
              </span>
              <span className="rounded-full bg-rose-400/20 px-3 py-1.5 text-sm font-bold text-rose-300 tabular-nums">
                {100 - reto.prob}%
              </span>
            </div>
          </div>

          {mio && !decidido && (
            <p className="text-base italic leading-relaxed text-white/60">
              {frase(ARENGAS, playerId)}
            </p>
          )}

          {mio && !decidido && (
            <button
              type="button"
              className="btn-primary w-full py-3 text-base font-bold"
              disabled={ocupado || girando}
              onClick={() => decidir('va')}
            >
              {girando ? 'Girando…' : 'Me la juego'}
            </button>
          )}
        </div>

        {/* Derecha: la salida mientras se puede elegir, y lo que pasó después. */}
        <div className="flex flex-col justify-center gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-5 text-center">
          {mio && !decidido ? (
            <>
              <p className="text-base italic leading-relaxed text-white/60">
                {frase(EXCUSAS, playerId)}
              </p>
              <button
                type="button"
                className="btn-ghost w-full py-3 text-base font-bold"
                disabled={ocupado || girando}
                onClick={() => decidir('paso')}
              >
                Así está bien
              </button>
            </>
          ) : (
            <Desenlace
              mio={mio}
              quien={quien}
              bet={bet}
              delta={delta}
              rating={rating}
              girando={girando}
            />
          )}
        </div>
      </div>
    </section>
  );
}

/** El texto de la derecha para todo lo que no sea "todavía podés elegir". */
function Desenlace({
  mio,
  quien,
  bet,
  delta,
  rating,
  girando,
}: {
  mio: boolean;
  quien: string;
  bet: string | null;
  delta: number | null;
  rating: number | null;
  girando: boolean;
}) {
  if (girando) {
    return (
      <p className="animate-pulse text-lg font-bold text-orange-300">
        Girando…
      </p>
    );
  }

  if (bet === null) {
    return (
      <p className="animate-pulse text-base text-white/55">
        {quien} está decidiendo si se la juega.
      </p>
    );
  }

  if (bet === 'paso') {
    return (
      <p className="text-base text-white/55">
        {mio ? 'No te la jugaste.' : `${quien} no se la jugó.`}
        {typeof rating === 'number' && <> Queda en {rating}.</>}
      </p>
    );
  }

  const subio = (delta ?? 0) > 0;
  const bajo = (delta ?? 0) < 0;

  return (
    <div className="animate-pop space-y-1">
      <p
        className={`text-xl font-black ${
          subio ? 'text-emerald-300' : bajo ? 'text-rose-300' : 'text-white/60'
        }`}
      >
        {!subio && !bajo
          ? 'Quedó igual.'
          : subio
            ? mio
              ? '¡Entró!'
              : `¡Le entró a ${quien}!`
            : mio
              ? 'La erró.'
              : `${quien} la erró.`}
      </p>
      <p className="text-sm font-semibold tabular-nums text-white/70">
        {delta === 0 ? 'sin cambios' : `${subio ? '+' : ''}${delta} OVR`}
        {typeof rating === 'number' && (
          <span className="font-medium text-white/45"> · queda en {rating}</span>
        )}
      </p>
    </div>
  );
}
