import { Client } from 'pg';
const c = new Client({ host: `db.${process.env.SUPABASE_PROJECT_REF}.supabase.co`, user: 'postgres', password: process.env.SUPABASE_DB_PASSWORD, database: 'postgres', ssl: { rejectUnauthorized: false } });
await c.connect();
const { rows } = await c.query(
  `select name, position_type, silhouette_source, render_url is not null as has_render, cutout_url is not null as has_cutout
   from players where notable and position_type='defender' limit 8`
);
for (const r of rows) console.log(`${r.name.padEnd(22)} src=${String(r.silhouette_source).padEnd(7)} render=${r.has_render} cutout=${r.has_cutout}`);
await c.end();
