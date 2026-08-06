/**
 * Saca del ranking las partidas que dejaron los tests.
 *
 *   npm run purge-tests --workspace=packages/ingest          # muestra qué haría
 *   npm run purge-tests --workspace=packages/ingest -- --si  # las borra
 *
 * Los tests juegan partidas de verdad contra la base de verdad, así que sus
 * resultados terminaban en el ranking público. Se los reconoce por el nombre:
 * usan un prefijo y dígitos, que ninguna persona elige.
 *
 * Borra por sala y no por nombre. Una sala de prueba puede tener además un
 * invitado con nombre normal —los tests usan "Cobra" y "Teo"— y dejar esas
 * filas sueltas ensuciaría igual. Al revés también importa: borrar todo lo que
 * se llame "Cobra" se llevaría partidas de una persona real.
 */
import { Client } from 'pg';

const APLICAR = process.argv.includes('--si');

/** T12345, P12345, R12345, Rev123456: lo que generan los tests. */
const PATRON = String.raw`^(Rev|[TPR])[0-9]{5,6}$`;

const client = new Client({
  host: `db.${process.env.SUPABASE_PROJECT_REF}.supabase.co`,
  user: 'postgres',
  password: process.env.SUPABASE_DB_PASSWORD,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});

await client.connect();

const { rows } = await client.query(
  `select fg.room_id,
          count(*) filas,
          min(fg.finished_at) cuando,
          string_agg(distinct fg.display_name, ', ' order by fg.display_name) quienes
   from public.finished_games fg
   where fg.room_id in (
     select room_id from public.finished_games where display_name ~ $1
   )
   group by fg.room_id
   order by min(fg.finished_at)`,
  [PATRON]
);

if (!rows.length) {
  console.log('No hay partidas de prueba en el ranking.');
  await client.end();
  process.exit(0);
}

console.log(`${rows.length} sala(s) de prueba, ${rows.reduce((a, r) => a + Number(r.filas), 0)} filas:\n`);
for (const r of rows) {
  console.log(`  ${r.cuando.toISOString().slice(0, 19)}  ${String(r.filas).padStart(2)} filas  ${r.quienes}`);
}

if (!APLICAR) {
  console.log('\nNada borrado. Volvé a correrlo con --si para aplicarlo.');
  await client.end();
  process.exit(0);
}

const { rowCount } = await client.query(
  `delete from public.finished_games
   where room_id in (
     select room_id from public.finished_games where display_name ~ $1
   )`,
  [PATRON]
);

console.log(`\nBorradas ${rowCount} filas.`);

const quedan = (await client.query('select count(*) n from public.finished_games')).rows[0].n;
console.log(`Quedan ${quedan} partidas reales en el ranking.`);

await client.end();
