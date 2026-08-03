import { Client } from 'pg';
const c = new Client({ host: `db.${process.env.SUPABASE_PROJECT_REF}.supabase.co`, user: 'postgres', password: process.env.SUPABASE_DB_PASSWORD, database: 'postgres', ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async (s: string) => (await c.query(s)).rows;
console.log('firmas de finalize_round:');
for (const r of await q(`select pg_get_function_identity_arguments(oid) a from pg_proc where proname='finalize_round'`))
  console.log(`  finalize_round(${r.a})`);
console.log('rondas vencidas sin cerrar:', (await q(`select count(*) n from auction_rounds where status='active' and ends_at <= now()`))[0].n);
await c.end();
