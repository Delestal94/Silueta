import { Client } from 'pg';
const c = new Client({ host: `db.${process.env.SUPABASE_PROJECT_REF}.supabase.co`, user: 'postgres', password: process.env.SUPABASE_DB_PASSWORD, database: 'postgres', ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async (s: string) => (await c.query(s)).rows;

console.log('TOTALES (catálogo EA)');
for (const r of await q(`select gender, count(*) total, count(*) filter (where notable and silhouette_url is not null) jugables
                         from players where ea_id is not null group by 1 order by 1`))
  console.log(`  ${String(r.gender ?? 'sin dato').padEnd(9)} ${String(r.total).padStart(4)} en base   ${String(r.jugables).padStart(4)} subastables`);

console.log('\nSUBASTABLES POR PUESTO');
const rows = await q(`select gender, position_type, count(*) n from players
                      where ea_id is not null and notable and silhouette_url is not null
                      group by 1,2 order by 1,2`);
for (const r of rows) console.log(`  ${String(r.gender).padEnd(6)} ${r.position_type.padEnd(11)} ${String(r.n).padStart(3)}`);

console.log('\nTOTAL subastables:', (await q(`select count(*) from players where ea_id is not null and notable and silhouette_url is not null`))[0].count);
await c.end();
