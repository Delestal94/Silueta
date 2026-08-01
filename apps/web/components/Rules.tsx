'use client';

import { POWERS } from '@/lib/game/powers';

/**
 * Single source of truth for the rules, rendered both on the landing page and
 * inside a game. Two copies would drift the moment a rule changes.
 */
export function Rules({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? 'space-y-5 text-sm' : 'space-y-6'}>
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
          De cada jugador ves <strong>sólo su silueta</strong>. El nombre aparece recién cuando
          se cierra la puja.
        </p>
      </Section>

      <Section title="La época: el riesgo de verdad" icon="⏳">
        <p>
          Cada ronda sortea además <strong>un momento de la carrera</strong> de ese jugador, y
          tampoco lo sabés mientras pujás. Podés reconocer la silueta perfectamente y aun así
          llevarte al jugador equivocado.
        </p>
        <p className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
          No es lo mismo el Mbappé de 2017, con 18 años y 79 puntos, que el de 2024 con 91. Es
          el mismo jugador y la misma silueta.
        </p>
        <p>
          Los puntos que suma son los de <strong>esa</strong> época, no los de hoy.
        </p>
      </Section>

      <Section title="Pujar" icon="💰">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Cada puja <strong>reinicia el reloj completo</strong>. La subasta se cierra cuando
            nadie responde, no cuando se acaba un tiempo fijo.
          </li>
          <li>Tu puja tiene que superar la actual, y no podés pasarte de tu presupuesto.</li>
          <li>Si ya completaste ese puesto, no podés seguir pujando en esa ronda.</li>
          <li>
            Si sos <strong>el único</strong> que todavía necesita ese puesto y nadie puja, el
            jugador es tuyo al precio mínimo.
          </li>
        </ul>
      </Section>

      <Section title="El pase" icon="🙅">
        <p>
          Tenés <strong>un solo pase en toda la partida</strong>. Pasar te saca de esa ronda. Si
          todos los que necesitaban ese puesto pasan, se sortea entre ellos y a alguien le toca
          igual.
        </p>
      </Section>

      <Section title="Poderes" icon="🪄">
        <p className="mb-3">
          Podés gastar presupuesto en sabotear a un rival en la ronda siguiente. Sale de la
          misma plata con la que comprás, así que molestar siempre te debilita. Sólo un poder
          por víctima a la vez.
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
              <span className="shrink-0 font-black text-lime-300">{p.cost}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="El anfitrión" icon="👑">
        <p>
          Quien crea la sala controla cuándo sale cada silueta y elige la configuración:
          presupuesto, segundos por ronda, si juegan futbolistas masculinos, femeninas o ambos,
          y si el catálogo se limita a los más famosos o entra completo.
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
