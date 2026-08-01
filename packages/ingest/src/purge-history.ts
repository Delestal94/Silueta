/**
 * Wipes every room and everything hanging off it.
 *
 * There is no match history feature, so finished rooms are dead weight — and
 * their foreign keys pin incomplete player rows in place, blocking the catalog
 * cleanup. Deleting a room cascades to its participants, rounds, bids,
 * signings and power effects.
 *
 * Destructive and deliberate: run it knowingly.
 */
import { Client } from 'pg';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}`);
    process.exit(1);
  }
  return value;
}

const client = new Client({
  host: `db.${requireEnv('SUPABASE_PROJECT_REF')}.supabase.co`,
  user: 'postgres',
  password: requireEnv('SUPABASE_DB_PASSWORD'),
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});

await client.connect();

const before = await client.query(`
  select
    (select count(*) from rooms) rooms,
    (select count(*) from room_participants) participants,
    (select count(*) from auction_rounds) rounds,
    (select count(*) from team_players) signings
`);
console.log('antes :', before.rows[0]);

// Everything cascades from rooms.
const deleted = await client.query('delete from public.rooms');
console.log(`\nsalas borradas: ${deleted.rowCount}`);

const after = await client.query(`
  select
    (select count(*) from rooms) rooms,
    (select count(*) from room_participants) participants,
    (select count(*) from auction_rounds) rounds,
    (select count(*) from team_players) signings
`);
console.log('después:', after.rows[0]);

await client.end();
