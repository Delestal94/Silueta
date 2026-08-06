/**
 * El emparejador, probado contra TheSportsDB de verdad.
 *
 *   npm run test:match --workspace=packages/ingest
 *
 * Los casos están elegidos por lo que rompen: los mononombres son los que
 * metían a otra persona en el catálogo, y los nombres largos son el control de
 * que verificar no empezó a rechazar a los que sí estaban bien.
 */
import { elegirCandidato, type EaPlayer, type SportsDbPlayer } from './match.js';

const SPORTSDB_KEY = process.env.THESPORTSDB_KEY || '3';
const SPORTSDB_API = `https://www.thesportsdb.com/api/v1/json/${SPORTSDB_KEY}`;
const EA_API = 'https://drop-api.ea.com/rating/ea-sports-fc';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Jugadores de EA a probar, y si esperamos que TheSportsDB tenga a la persona correcta. */
const CASOS: { eaId: number; nombre: string; debeAceptar: boolean; porque: string }[] = [
  {
    eaId: 73562,
    nombre: 'Bento',
    debeAceptar: false,
    porque: 'el único Bento de TheSportsDB es otro: mediocampista del Sporting nacido en 2006',
  },
  { eaId: 231747, nombre: 'Kylian Mbappé', debeAceptar: true, porque: 'coincide la fecha exacta' },
  { eaId: 239085, nombre: 'Erling Haaland', debeAceptar: true, porque: 'coincide la fecha exacta' },
  {
    eaId: 231866,
    nombre: 'Rodri',
    debeAceptar: false,
    porque:
      'el único candidato es Jay Rodriguez, delantero inglés de 1989 — así quedó guardado el Rodri del City',
  },
  { eaId: 252371, nombre: 'Jude Bellingham', debeAceptar: true, porque: 'coincide la fecha exacta' },
];

async function eaPlayer(id: number): Promise<EaPlayer | null> {
  const r = await fetch(`${EA_API}?locale=en&limit=1&offset=0&playerId=${id}`, {
    headers: { accept: 'application/json' },
  });
  const j = (await r.json()) as { items?: EaPlayer[] };
  return j.items?.find((p) => p.id === id) ?? j.items?.[0] ?? null;
}

let fallos = 0;
const check = (label: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`);
  if (!ok) fallos++;
};

// El feed de EA no filtra por id, así que se busca por nombre dentro de la
// página en la que está cada uno; para el test alcanza con armar la ficha a
// mano desde el mismo endpoint por rank.
async function fichaEa(nombre: string, eaId: number): Promise<EaPlayer | null> {
  for (let offset = 0; offset < 600; offset += 100) {
    const r = await fetch(`${EA_API}?locale=en&limit=100&offset=${offset}`, {
      headers: { accept: 'application/json' },
    });
    const j = (await r.json()) as { items?: EaPlayer[] };
    const hit = j.items?.find((p) => p.id === eaId);
    if (hit) return hit;
    await sleep(400);
  }
  return null;
}

for (const caso of CASOS) {
  let ea = await fichaEa(caso.nombre, caso.eaId);
  if (!ea) ea = await eaPlayer(caso.eaId);
  if (!ea) {
    check(caso.nombre, false, 'no se pudo traer la ficha de EA');
    continue;
  }

  const r = await fetch(`${SPORTSDB_API}/searchplayers.php?p=${encodeURIComponent(caso.nombre)}`);
  const j = (await r.json()) as { player: SportsDbPlayer[] | null };
  const candidatos = (j.player || []).filter((p) => p.strSport === 'Soccer');

  const elegido = elegirCandidato(candidatos, ea, caso.nombre);
  const acepto = elegido !== null;

  check(
    `${caso.nombre} → ${caso.debeAceptar ? 'acepta' : 'rechaza'}`,
    acepto === caso.debeAceptar,
    acepto
      ? `eligió "${elegido!.strPlayer}" (${elegido!.dateBorn ?? 'sin fecha'})`
      : `${candidatos.length} candidato(s), ninguno verifica — ${caso.porque}`
  );

  await sleep(1200);
}

console.log(fallos ? `\n${fallos} fallaron` : '\ntodo en orden');
process.exit(fallos ? 1 : 0);
