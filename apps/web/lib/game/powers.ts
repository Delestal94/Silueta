export type PowerId =
  | 'soplo'
  | 'apagon'
  | 'espejismo'
  | 'impuesto'
  | 'traba'
  | 'manotazo'
  | 'empujon'
  | 'escudo'
  | 'reversa';

export interface Power {
  id: PowerId;
  name: string;
  icon: string;
  cost: number;
  /** Shown to the caster when choosing. */
  description: string;
  /** Shown to the victim, who is told they are hexed but not the details. */
  victimNotice: string;
  /** Aimed at yourself rather than a rival. */
  selfTargeted?: boolean;
}

/**
 * Costs mirror how much each power hurts: hiding information is cheap, lying
 * about it costs more, and taking money costs most. They come out of the same
 * budget used to buy players, so sabotage always weakens your own squad.
 *
 * Kept in sync with power_cost(), whose latest version is migration 0050 —
 * and that one is the authority: esta lista sólo los muestra.
 */
export const POWERS: Power[] = [
  {
    id: 'soplo',
    name: 'Soplo',
    icon: '🔍',
    cost: 10,
    description: 'Te revela la nacionalidad y el club del jugador de esta ronda. Sólo a vos.',
    victimNotice: '',
    selfTargeted: true,
  },
  {
    id: 'manotazo',
    name: 'Manotazo',
    icon: '✋',
    cost: 8,
    description: 'Le quema el pase al instante. Sólo si todavía no lo usó.',
    victimNotice: 'Te quemaron el pase.',
  },
  {
    id: 'traba',
    name: 'Traba',
    icon: '🔒',
    cost: 10,
    description: 'No puede pujar durante la primera mitad de la próxima ronda.',
    victimNotice: 'Te trabaron: no podés pujar en la primera mitad.',
  },
  {
    id: 'apagon',
    name: 'Apagón',
    icon: '🌑',
    cost: 12,
    description: 'No ve ninguna silueta en la próxima ronda. Puja completamente a ciegas.',
    victimNotice: 'Apagón: esta ronda pujás sin ver la silueta.',
  },
  {
    id: 'espejismo',
    name: 'Espejismo',
    icon: '🪞',
    cost: 18,
    description: 'Ve la silueta de otro jugador y no se entera. Cree que puja por alguien más.',
    victimNotice: 'Algo no cuadra en esta ronda…',
  },
  {
    id: 'impuesto',
    name: 'Impuesto',
    icon: '💸',
    cost: 20,
    description: 'Si gana la próxima ronda, paga el doble.',
    victimNotice: 'Impuesto: si ganás esta ronda, pagás el doble.',
  },
  {
    id: 'escudo',
    icon: '🛡️',
    name: 'Escudo',
    cost: 14,
    description:
      'Para el próximo poder que te tiren. Se gasta al hacerlo, y el que tiró pierde lo que puso.',
    victimNotice: '',
    selfTargeted: true,
  },
  {
    id: 'reversa',
    icon: '↩️',
    name: 'Reversa',
    cost: 20,
    description:
      'El próximo poder que te tiren le cae a quien lo tiró. No se entera hasta la ronda siguiente.',
    victimNotice: '',
    selfTargeted: true,
  },
  {
    id: 'empujon',
    name: 'Empujón',
    icon: '👊',
    cost: 20,
    description:
      'Oferta 25 por él apenas arranca la próxima ronda, quiera o no. Si no le alcanza, pone todo lo que tiene.',
    // Se entera al ver la ronda: su oferta ya está puesta y no la puso él.
    victimNotice: 'Te empujaron: ya ofertaste en esta ronda sin quererlo.',
  },
];

/**
 * Los que uno se compra para defenderse.
 *
 * Importa distinguirlos porque se guardan como un efecto pendiente apuntando a
 * uno mismo, igual que un poder hostil. Contándolos como tales, el panel leía
 * "ya tiene un poder esperando" y no dejaba apuntarle a nadie que tuviera
 * escudo — que lo convertía en invulnerabilidad, y de paso lo delataba.
 */
export const DEFENSIVE_POWERS: ReadonlySet<PowerId> = new Set<PowerId>(['escudo', 'reversa']);

export const POWER_BY_ID: Record<PowerId, Power> = Object.fromEntries(
  POWERS.map((p) => [p.id, p])
) as Record<PowerId, Power>;
