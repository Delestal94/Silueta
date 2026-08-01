export type PowerId = 'niebla' | 'apagon' | 'espejismo' | 'impuesto' | 'traba' | 'manotazo';

export interface Power {
  id: PowerId;
  name: string;
  icon: string;
  cost: number;
  /** Shown to the caster when choosing. */
  description: string;
  /** Shown to the victim, who is told they are hexed but not the details. */
  victimNotice: string;
}

/**
 * Costs mirror how much each power hurts: hiding information is cheap, lying
 * about it costs more, and taking money costs most. They come out of the same
 * budget used to buy players, so sabotage always weakens your own squad.
 *
 * Kept in sync with power_cost() in migration 0020.
 */
export const POWERS: Power[] = [
  {
    id: 'niebla',
    name: 'Niebla',
    icon: '🌫️',
    cost: 10,
    description: 'Ve la silueta borrosa en la próxima ronda.',
    victimNotice: 'Te tiraron Niebla: vas a ver la silueta borrosa.',
  },
  {
    id: 'manotazo',
    name: 'Manotazo',
    icon: '✋',
    cost: 12,
    description: 'Le quema el pase al instante. Sólo si todavía no lo usó.',
    victimNotice: 'Te quemaron el pase.',
  },
  {
    id: 'traba',
    name: 'Traba',
    icon: '🔒',
    cost: 15,
    description: 'No puede pujar durante la primera mitad de la próxima ronda.',
    victimNotice: 'Te trabaron: no podés pujar en la primera mitad.',
  },
  {
    id: 'apagon',
    name: 'Apagón',
    icon: '🌑',
    cost: 18,
    description: 'No ve ninguna silueta en la próxima ronda. Puja completamente a ciegas.',
    victimNotice: 'Apagón: esta ronda pujás sin ver la silueta.',
  },
  {
    id: 'espejismo',
    name: 'Espejismo',
    icon: '🪞',
    cost: 28,
    description: 'Ve la silueta de otro jugador y no se entera. Cree que puja por alguien más.',
    victimNotice: 'Algo no cuadra en esta ronda…',
  },
  {
    id: 'impuesto',
    name: 'Impuesto',
    icon: '💸',
    cost: 30,
    description: 'Si gana la próxima ronda, paga el doble.',
    victimNotice: 'Impuesto: si ganás esta ronda, pagás el doble.',
  },
];

export const POWER_BY_ID: Record<PowerId, Power> = Object.fromEntries(
  POWERS.map((p) => [p.id, p])
) as Record<PowerId, Power>;
