import { readFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Client } from 'pg';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../supabase/migrations');

async function connect(): Promise<Client> {
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!password) throw new Error('SUPABASE_DB_PASSWORD is not set');

  const ref = process.env.SUPABASE_PROJECT_REF;
  if (!ref) throw new Error('SUPABASE_PROJECT_REF is not set');

  // Direct host is IPv6-only on some projects; fall back to the IPv4 poolers.
  const candidates = [
    { host: `db.${ref}.supabase.co`, port: 5432, user: 'postgres' },
    ...['us-east-1', 'us-west-1', 'eu-central-1', 'sa-east-1', 'ap-southeast-1'].flatMap((region) =>
      [`aws-0-${region}.pooler.supabase.com`, `aws-1-${region}.pooler.supabase.com`].map((host) => ({
        host,
        port: 5432,
        user: `postgres.${ref}`,
      }))
    ),
  ];

  for (const c of candidates) {
    const client = new Client({
      host: c.host,
      port: c.port,
      user: c.user,
      password,
      database: 'postgres',
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 8000,
    });

    try {
      await client.connect();
      console.log(`connected via ${c.host}`);
      return client;
    } catch {
      await client.end().catch(() => {});
    }
  }

  throw new Error('Could not reach the database on any known host');
}

async function main() {
  const only = process.argv[2];
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .filter((f) => !only || f.includes(only))
    .sort();

  if (!files.length) throw new Error('No migrations matched');

  const client = await connect();

  try {
    for (const file of files) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      process.stdout.write(`applying ${file} ... `);
      try {
        await client.query(sql);
        console.log('ok');
      } catch (err) {
        console.log(`failed: ${err instanceof Error ? err.message : err}`);
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
