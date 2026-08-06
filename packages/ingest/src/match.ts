/**
 * Decidir si un candidato de TheSportsDB es la misma persona que la ficha de EA.
 *
 * Vive separado de index.ts porque ese archivo arranca la importación al
 * cargarse: para poder probar esta decisión sin salir a buscar 17.000
 * jugadores, tiene que ser un módulo aparte.
 *
 * Hace falta verificar porque el nombre solo no alcanza, y de lejos. Los
 * mononombres brasileños y portugueses —Bento, Thiago, Sergio, Madson— tienen
 * varios futbolistas activos cada uno, así que "se llama igual" no dice nada.
 * El caso que lo destapó: EA manda a Bento, arquero brasileño de Al Nassr, la
 * búsqueda devuelve un único Bento —mediocampista del Sporting nacido en
 * 2006— y se lo aceptaba igual, así que la silueta salía con el cuerpo de otro.
 */

export type PositionType = 'goalkeeper' | 'defender' | 'midfielder' | 'forward';

export interface EaPlayer {
  id: number;
  rank: number;
  overallRating: number;
  firstName: string;
  lastName: string;
  commonName: string | null;
  birthdate: string | null;
  height: number | null;
  weight: number | null;
  skillMoves: number | null;
  weakFootAbility: number | null;
  preferredFoot: number | null;
  leagueName: string | null;
  avatarUrl: string | null;
  shieldUrl: string | null;
  gender?: { label: string } | null;
  team?: { label: string } | null;
  nationality?: { label: string } | null;
  position?: {
    label: string;
    shortLabel: string;
    positionType?: { name: string };
  } | null;
  stats?: Record<string, { value: number }>;
}

export interface SportsDbPlayer {
  idPlayer: string;
  strPlayer: string;
  strSport: string | null;
  strDescriptionEN: string | null;
  strNumber: string | null;
  strRender: string | null;
  strCutout: string | null;
  // Los cuatro que sirven para confirmar la identidad. Vienen ya en
  // searchplayers.php, así que verificar no cuesta un pedido extra.
  dateBorn: string | null;
  strPosition: string | null;
  strTeam: string | null;
  strNationality: string | null;
}

const POSITION_BY_EA_TYPE: Record<string, PositionType> = {
  goalkeeper: 'goalkeeper',
  defender: 'defender',
  defense: 'defender',
  midfielder: 'midfielder',
  midfield: 'midfielder',
  attack: 'forward',
  attacker: 'forward',
  forward: 'forward',
};

export function normalise(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’`.]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

export function parseBirthdate(raw: string | null): string | null {
  // EA sends "12/20/1998 12:00:00 AM".
  if (!raw) return null;
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const [, month, day, year] = m;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

export function mapPosition(p: EaPlayer): PositionType | null {
  const short = p.position?.shortLabel?.toUpperCase();

  // EA files goalkeepers under positionType "Defense", so the specific
  // position has to win over the broad category or every keeper becomes a
  // defender.
  if (short === 'GK') return 'goalkeeper';
  if (short && ['CB', 'LB', 'RB', 'LWB', 'RWB'].includes(short)) return 'defender';
  if (short && ['CDM', 'CM', 'CAM', 'LM', 'RM'].includes(short)) return 'midfielder';
  if (short && ['ST', 'CF', 'LW', 'RW'].includes(short)) return 'forward';

  const typeName = p.position?.positionType?.name?.toLowerCase();
  if (typeName && POSITION_BY_EA_TYPE[typeName]) return POSITION_BY_EA_TYPE[typeName];
  return null;
}

/** Las posiciones de TheSportsDB, en texto libre, llevadas a nuestros cuatro tipos. */
export function sportsDbPositionType(raw: string | null): PositionType | null {
  if (!raw) return null;
  const t = raw.toLowerCase();
  if (t.includes('keeper')) return 'goalkeeper';
  if (t.includes('back') || t.includes('defen')) return 'defender';
  if (t.includes('midfield')) return 'midfielder';
  if (t.includes('forward') || t.includes('striker') || t.includes('wing') || t.includes('attack'))
    return 'forward';
  return null;
}

/**
 * ¿Nacieron el mismo día, admitiendo que las dos fuentes no se pongan de acuerdo?
 *
 * El año es lo que decide. EA y TheSportsDB discrepan seguido en el día exacto
 * —Jacob Ramsey figura el 21 y el 28 de mayo de 2001, Sander Berge el 18 y el
 * 14 de febrero de 1998— y son la misma persona con el dato cargado distinto.
 * Cuando el año no coincide, en cambio, siempre resultó ser otro futbolista:
 * el Balde de EA es de 2003 y el de la biografía de 1995.
 *
 * Exigir la fecha exacta sacaba del catálogo a decenas de jugadores correctos.
 */
export function mismaFechaDeNacimiento(a: string, b: string): boolean {
  return a.slice(0, 4) === b.slice(0, 4);
}

/**
 * ¿Son la misma persona?
 *
 * La fecha de nacimiento decide sola cuando los dos lados la tienen: es la
 * única señal que no comparten dos futbolistas distintos. Cuando falta, se
 * exige juntar dos señales débiles entre posición, club, nacionalidad y nombre
 * exacto — cualquiera sola deja pasar al Bento equivocado.
 */
export function esLaMismaPersona(c: SportsDbPlayer, ea: EaPlayer, nombre: string): boolean {
  const nacEa = parseBirthdate(ea.birthdate);
  const nacSdb = c.dateBorn?.match(/^\d{4}-\d{2}-\d{2}$/) ? c.dateBorn : null;

  if (nacEa && nacSdb) return mismaFechaDeNacimiento(nacEa, nacSdb);

  const posEa = mapPosition(ea);
  const posSdb = sportsDbPositionType(c.strPosition);
  // Un arquero nunca es un jugador de campo: eso descarta solo, sin contar señales.
  if (posEa && posSdb && posEa !== posSdb) return false;

  const igual = (a: string | null | undefined, b: string | null | undefined) =>
    !!a && !!b && normalise(a) === normalise(b);

  const señales =
    Number(igual(c.strTeam, ea.team?.label)) +
    Number(igual(c.strNationality, ea.nationality?.label)) +
    Number(!!posEa && posEa === posSdb) +
    Number(normalise(c.strPlayer) === normalise(nombre));

  return señales >= 2;
}

/**
 * El mejor candidato verificado, o null si ninguno lo es.
 *
 * No hay recurso a candidates[0]: quedarse con el primero de la lista cuando
 * ninguno verifica es justamente lo que metía la silueta de un desconocido en
 * el catálogo, y es preferible un jugador de menos que uno equivocado.
 */
export function elegirCandidato(
  candidatos: SportsDbPlayer[],
  ea: EaPlayer,
  nombre: string
): SportsDbPlayer | null {
  const target = normalise(nombre);
  const verificados = candidatos.filter((p) => esLaMismaPersona(p, ea, nombre));
  if (!verificados.length) return null;

  return (
    verificados.find((p) => normalise(p.strPlayer) === target) ||
    verificados.find((p) => normalise(p.strPlayer).endsWith(target.split(' ').slice(-1)[0])) ||
    verificados[0]
  );
}
