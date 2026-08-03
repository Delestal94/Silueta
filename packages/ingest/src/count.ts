import { Client } from 'pg';
const c = new Client({ host: `db.${process.env.SUPABASE_PROJECT_REF}.supabase.co`, user: 'postgres', password: process.env.SUPABASE_DB_PASSWORD, database: 'postgres', ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async (s: string) => (await c.query(s)).rows;
console.log('subastables ahora :', (await q(`select count(*) n from players where notable`))[0].n);
console.log('agregados hoy     :', (await q(`select count(*) n from players where created_at > now() - interval '3 hours'`))[0].n);
console.log('\npor puesto:');
for (const r of await q(`select gender, position_type, count(*) n from players where notable group by 1,2 order by 1,2`))
  console.log(`  ${String(r.gender).padEnd(6)} ${r.position_type.padEnd(11)} ${String(r.n).padStart(4)}`);
await c.end();
