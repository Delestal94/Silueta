import { Client } from 'pg';

const c = new Client({
  host: `db.${process.env.SUPABASE_PROJECT_REF}.supabase.co`,
  user: 'postgres',
  password: process.env.SUPABASE_DB_PASSWORD,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});

await c.connect();
await c.query('select public.refresh_fame_ranks()');

const { rows } = await c.query(
  `select gender, position_type, count(*) n
   from players where notable and fame_rank <= public.famous_depth()
   group by 1,2 order by 1,2`
);
for (const r of rows) console.log(`  ${r.gender} ${r.position_type}: ${r.n}`);

const total = await c.query(
  `select count(*) n from players where ea_id is not null and notable and silhouette_url is not null`
);
console.log(`subastables: ${total.rows[0].n}`);
await c.end();
