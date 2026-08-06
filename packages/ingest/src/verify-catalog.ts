/**
 * Saca del juego a los jugadores que tienen la silueta de otra persona.
 *
 *   npm run verify --workspace=packages/ingest             # muestra qué haría
 *   npm run verify --workspace=packages/ingest -- --si     # aplica
 *   npm run verify --workspace=packages/ingest -- --si --red   # además consulta TheSportsDB
 *
 * El emparejador viejo aceptaba `candidates[0]` cuando ningún candidato
 * coincidía, así que a un jugador cuyo nombre TheSportsDB no conoce le pegaba
 * el render del primer resultado que hubiera. Rodri, el número 2 del mundo,
 * quedó con el cuerpo de Jay Rodriguez; Bento, arquero de Al Nassr, con el de
 * un mediocampista del Sporting nacido en 2006.
 *
 * Hay dos formas de detectarlo:
 *
 *   - Sin red: la biografía que guardamos viene de TheSportsDB y suele abrir
 *     con "(born <fecha>)". Si esa fecha no es la que da EA, la biografía —y
 *     por lo tanto el render— son de otro. Es instantáneo y no gasta cuota.
 *   - Con --red: se le vuelve a preguntar a TheSportsDB por el id guardado y se
 *     compara fecha y posición. Cubre también a los que no tienen fecha en la
 *     biografía, pero gasta un pedido por jugador.
 *
 * A los que fallan se les pone notable = false, que es lo que next_round mira
 * para elegir. No se borra la fila: `ingest --resume` los reintenta después con
 * el emparejador ya arreglado, y si esta vez encuentra a la persona correcta
 * vuelven a entrar solos.
 */
import { Client } from 'pg';
import { mismaFechaDeNacimiento, sportsDbPositionType, type SportsDbPlayer } from './match.js';

const APLICAR = process.argv.includes('--si');
const CON_RED = process.argv.includes('--red');
const SPORTSDB_KEY = process.env.THESPORTSDB_KEY || '3';
const SPORTSDB_API = `https://www.thesportsdb.com/api/v1/json/${SPORTSDB_KEY}`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const MESES: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/** La fecha de nacimiento que declara la biografía, si la declara. */
function fechaDeLaBio(bio: string): string | null {
  const m =
    bio.match(/born\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/) ||
    bio.match(/born\s+([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (!m) return null;

  const empiezaConNumero = /^\d/.test(m[1]);
  const mes = MESES[(empiezaConNumero ? m[2] : m[1]).toLowerCase()];
  const dia = Number(empiezaConNumero ? m[1] : m[2]);
  if (!mes) return null;

  return `${m[3]}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

const client = new Client({
  host: `db.${process.env.SUPABASE_PROJECT_REF}.supabase.co`,
  user: 'postgres',
  password: process.env.SUPABASE_DB_PASSWORD,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});

await client.connect();

interface Fila {
  id: string;
  name: string;
  ea_id: number;
  sportsdb_id: string | null;
  birth_date: string | null;
  position_type: string;
  description: string | null;
}

const { rows } = await client.query<Fila>(
  `select id, name, ea_id, sportsdb_id, birth_date, position_type, description
   from public.players
   where notable = true and silhouette_url is not null
   order by ea_rank nulls last`
);

console.log(`Revisando ${rows.length} jugadores en juego.\n`);

const culpables: { fila: Fila; motivo: string }[] = [];
let verificados = 0;
let sinDatos = 0;

for (const fila of rows) {
  const nacEa = fila.birth_date ? new Date(fila.birth_date).toISOString().slice(0, 10) : null;

  // Primero, gratis: la fecha que declara la propia biografía guardada.
  const nacBio = fila.description ? fechaDeLaBio(fila.description) : null;
  if (nacEa && nacBio) {
    if (!mismaFechaDeNacimiento(nacEa, nacBio)) {
      culpables.push({ fila, motivo: `EA dice ${nacEa}, la biografía dice ${nacBio}` });
    } else {
      verificados++;
    }
    continue;
  }

  if (!CON_RED) {
    sinDatos++;
    continue;
  }

  // Sin fecha en la biografía hay que preguntarle a TheSportsDB por el id guardado.
  if (!fila.sportsdb_id) {
    sinDatos++;
    continue;
  }

  await sleep(750);
  let sdb: SportsDbPlayer | null = null;
  try {
    const r = await fetch(`${SPORTSDB_API}/lookupplayer.php?id=${fila.sportsdb_id}`);
    const j = (await r.json()) as { players: SportsDbPlayer[] | null };
    sdb = j.players?.[0] ?? null;
  } catch {
    /* la cuota o la red: se reintenta en otra corrida */
  }

  if (!sdb) {
    sinDatos++;
    continue;
  }

  const nacSdb = sdb.dateBorn?.match(/^\d{4}-\d{2}-\d{2}$/) ? sdb.dateBorn : null;
  if (nacEa && nacSdb && !mismaFechaDeNacimiento(nacEa, nacSdb)) {
    culpables.push({ fila, motivo: `EA dice ${nacEa}, TheSportsDB dice ${nacSdb}` });
    continue;
  }

  // El arquero es el caso que más se nota: la silueta sale con la pose de un
  // jugador de campo y la ronda pedía arquero.
  const posSdb = sportsDbPositionType(sdb.strPosition);
  if (posSdb && posSdb !== fila.position_type) {
    culpables.push({ fila, motivo: `es ${fila.position_type} y el render es de un ${posSdb}` });
    continue;
  }

  verificados++;
}

console.log(`  verificados como correctos: ${verificados}`);
console.log(`  sin datos para verificar:   ${sinDatos}${CON_RED ? '' : ' (volvé a correr con --red)'}`);
console.log(`  CON LA SILUETA DE OTRO:     ${culpables.length}\n`);

if (!culpables.length) {
  console.log('No hay nada que sacar.');
  await client.end();
  process.exit(0);
}

for (const { fila, motivo } of culpables.slice(0, 40)) {
  console.log(`  ${fila.name.slice(0, 26).padEnd(28)} ${motivo}`);
}
if (culpables.length > 40) console.log(`  … y ${culpables.length - 40} más`);

if (!APLICAR) {
  console.log('\nNada cambiado. Volvé a correrlo con --si para sacarlos del juego.');
  await client.end();
  process.exit(0);
}

// Sólo se los saca de circulación: no se borra nada. next_round exige
// `notable`, así que con esto dejan de salir, y si el reingreso encuentra
// después a la persona correcta pisa la biografía y el render de una. Borrar
// acá obligaría a volver a bajar datos que ya tenemos por los que sí estaban
// bien emparejados y no cambiaría en nada lo que ve el jugador.
const { rowCount } = await client.query(
  `update public.players set notable = false where id = any($1::uuid[])`,
  [culpables.map((c) => c.fila.id)]
);

console.log(`\n${rowCount} sacados del juego.`);

const quedan = (
  await client.query('select count(*) n from public.players where notable and silhouette_url is not null')
).rows[0].n;
console.log(`Quedan ${quedan} jugadores subastables.`);
console.log('\nPara intentar recuperarlos con el emparejador arreglado:');
console.log('  CATALOG_SIZE=all npm run ingest:resume --workspace=packages/ingest');

await client.end();
