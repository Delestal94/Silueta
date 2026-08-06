'use client';

import { POWERS } from '@/lib/game/powers';

/**
 * Single source of truth for the rules, rendered both on the landing page and
 * inside a game. Two copies would drift the moment a rule changes.
 */
export function Rules({
  compact = false,
  columns = false,
}: {
  compact?: boolean;
  /** Flow the sections into two columns on a wide screen. */
  columns?: boolean;
}) {
  return (
    <div
      className={
        compact
          ? 'space-y-5 text-sm'
          : columns
            ? // The sections are the column items; wrapping them in one block
              // that refuses to break would pile everything into column one.
              'gap-x-10 lg:columns-2 [&>section]:mb-6 [&>section]:break-inside-avoid'
            : 'space-y-6'
      }
    >
      <Section title="El objetivo" icon="🎯">
        <p>
          Armá un equipo de cinco: <strong>1 arquero, 2 defensas, 1 mediocampista y 1
          delantero</strong>. Gana quien termina con más puntos sumando los de sus cinco
          fichajes. Si hay empate, define quien gastó menos.
        </p>
      </Section>

      <Section title="Cómo salen los jugadores" icon="⚽">
        <p>
          Las rondas van por puesto: primero se subastan todos los arqueros, después los
          defensas, y así. Cuando nadie necesita más de un puesto, se pasa al siguiente
          automáticamente.
        </p>
        <p>
          De cada jugador ves <strong>sólo su silueta</strong>. Al cerrarse la ronda, esa misma
          figura se llena de color y aparece su nombre.
        </p>
      </Section>

      <Section title="La época: el riesgo de verdad" icon="⏳">
        <p>
          Cada ronda sortea además <strong>un momento de la carrera</strong> de ese jugador, y
          tampoco lo sabés mientras ofertás. Podés reconocer la silueta perfectamente y aun así
          llevarte al jugador equivocado.
        </p>
        <p className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
          No es lo mismo el Mbappé de 2017, con 18 años y 79 puntos, que el de 2024 con 91. Ni
          el Maradona del 86, que vale 95, que el del 96, que vale 86. Misma silueta, distinto
          jugador.
        </p>
        <p>
          También entran <strong>leyendas retiradas</strong>: Maradona, Pelé, Cruyff, Zidane,
          Ronaldinho y medio centenar más. Vienen encendidas, y el que arma la sala las puede
          apagar para jugar sólo con futbolistas en actividad.
        </p>
        <p>
          Los puntos que suma son los de <strong>esa</strong> época, no los de hoy.
        </p>
      </Section>

      <Section title="La ronda a ciegas" icon="🫥">
        <p>
          De vez en cuando aparece una ronda <strong>sin silueta para nadie</strong>. A cambio
          ves su nacionalidad, la temporada que se subasta y los títulos que ganó.
        </p>
        <p className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
          Cuidado con los títulos: el tercer arquero de un grande junta más medallas que la
          figura de un equipo chico.
        </p>
      </Section>

      <Section title="Ofertar" icon="💰">
        <p className="mb-2">
          El que arma la sala elige entre <strong>puja abierta</strong> y{' '}
          <strong>sobre cerrado</strong>. Las dos comparten todo lo demás: los puestos, la
          época, los poderes y el pase.
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>Puja abierta:</strong> se ve lo que puja el resto y cada puja{' '}
            <strong>reinicia el reloj completo</strong>. La subasta se cierra cuando nadie
            responde, no cuando se acaba un tiempo fijo.
          </li>
          <li>
            <strong>Sobre cerrado:</strong> cada uno anota en secreto el máximo que pagaría.
            Nadie ve el número ajeno —sólo cuántos ya pusieron el suyo— y el reloj no se
            reinicia. Al cerrar se abren todos: gana el más alto y paga exactamente eso. Podés
            cambiar tu sobre hasta que cierre.
          </li>
          <li>En los dos, nunca podés pasarte de tu presupuesto.</li>
          <li>Si ya completaste ese puesto, quedás afuera de esa ronda.</li>
          <li>
            Si <strong>nadie oferta</strong>, el jugador se sortea al precio mínimo entre los que
            todavía necesitan ese puesto <strong>y no pasaron</strong>. Quedarte quieto no te
            salva: para eso está el pase, y tenés uno solo por puesto.
          </li>
          <li>
            Si dos ofertan <strong>lo mismo</strong> —pasa cuando a varios los empujan— sale una
            ruleta con los nombres tapados y destapa al que se lo lleva.
          </li>
        </ul>
      </Section>

      <Section title="El pase" icon="🙅">
        <p>
          Tenés <strong>un pase por puesto</strong>: uno para arqueros, otro para defensas, y
          así. Gastarlo temprano ya no te deja indefenso el resto de la partida.
        </p>
        <p>
          Si <strong>pasan todos</strong>, la silueta se saltea: no se la lleva nadie, no se cobra
          nada y el puesto sigue abierto para la próxima. El pase te saca del sorteo de verdad,
          incluso si sos el último que queda.
        </p>
        <p>
          Lo único que no esquiva es el <strong>empujón</strong>: esa oferta ya entró, así que la
          ronda se resuelve por puja y no llega al sorteo.
        </p>
      </Section>

      <Section title="Poderes" icon="🪄">
        <p className="mb-3">
          Podés gastar presupuesto en sabotear a un rival en la ronda siguiente, o en darte
          una ventaja a vos. Sale de la misma plata con la que comprás, así que siempre es un
          canje. Sólo un poder por víctima a la vez.
        </p>
        <p className="mb-3 rounded-xl border border-white/10 bg-black/25 px-3 py-2">
          <strong>Espejismo no avisa.</strong> Si te lo tiran, te enterás recién cuando se
          revela el jugador — para entonces ya pujaste creyendo en una silueta que no era.
        </p>
        <ul className="space-y-1.5">
          {POWERS.map((p) => (
            <li
              key={p.id}
              className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"
            >
              <span className="text-lg leading-none" aria-hidden>
                {p.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-semibold">{p.name}</span>
                <span className="text-white/55"> — {p.description}</span>
              </span>
              <span className="shrink-0 font-black text-orange-400">{p.cost}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Entre ronda y ronda" icon="✅">
        <p>
          La próxima silueta sale cuando <strong>todos marcan que están listos</strong>, no
          cuando lo decide una sola persona. Si alguien se fue de la compu, el anfitrión puede
          arrancar igual.
        </p>
        <p>
          Podés salir de la sala cuando quieras, y el anfitrión puede echar a quien dejó de
          jugar — si no, la partida no puede terminar, porque el juego sigue ofreciendo
          jugadores para los puestos que a esa persona le faltan.
        </p>
      </Section>

      <Section title="Volver a jugar" icon="🔁">
        <p>
          Al terminar, el anfitrión puede arrancar otra partida{' '}
          <strong>en la misma sala</strong>. El código no cambia y nadie tiene que volver a
          entrar: se borran los equipos, vuelve el presupuesto y listo.
        </p>
        <p>
          Ese es además el único momento en que se puede cambiar la configuración —el modo, el
          presupuesto, los segundos, el catálogo— porque es cuando ya sabés qué te quedó corto.
        </p>
      </Section>

      <Section title="El anfitrión" icon="👑">
        <p>
          Quien crea la sala elige la configuración: el modo de subasta, el presupuesto, los
          segundos por ronda, si juegan futbolistas masculinos, femeninas o ambos, y si entran las
          leyendas retiradas.
        </p>
        <p>
          El catálogo tiene tres opciones: <strong>más famosos</strong>, sólo los reconocibles;{' '}
          <strong>todos</strong>, el catálogo entero; y <strong>equilibrado</strong>, que sortea
          en cada ronda si el jugador sale de una mitad o de la otra. Si se va, el rol pasa a otro para que la sala no quede
          trabada.
        </p>
      </Section>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 font-bold">
        <span aria-hidden>{icon}</span>
        {title}
      </h3>
      <div className="space-y-2 leading-relaxed text-white/65">{children}</div>
    </section>
  );
}
