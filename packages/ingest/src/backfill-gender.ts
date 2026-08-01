/**
 * Fills players.gender from EA for rows imported before the column existed.
 * Metadata only — no image work, so it runs in a couple of minutes.
 */
import { createClient } from '@supabase/supabase-js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. Copy packages/ingest/.env.example to .env and fill it in.`);
    process.exit(1);
  }
  return value;
}

const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const EA_API = 'https://drop-api.ea.com/rating/ea-sports-fc';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface EaItem {
  id: number;
  rank: number;
  gender?: { label: string } | null;
}

async function fetchPage(offset: number, attempts = 4): Promise<EaItem[]> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${EA_API}?locale=en&limit=100&offset=${offset}`, {
        headers: { 'User-Agent': 'SiluetasGame/1.0', Accept: 'application/json' },
        signal: AbortSignal.timeout(25000),
      });
      if (res.status === 429 || res.status >= 500) {
        await sleep(3000 * (i + 1));
        continue;
      }
      if (!res.ok) return [];
      const body = await res.text();
      if (!body.trim() || body.trimStart().startsWith('<')) {
        await sleep(3000 * (i + 1));
        continue;
      }
      return (JSON.parse(body).items || []) as EaItem[];
    } catch {
      await sleep(2000 * (i + 1));
    }
  }
  return [];
}

async function main() {
  const { data: rows } = await supabase
    .from('players')
    .select('ea_id')
    .not('ea_id', 'is', null)
    .is('gender', null);

  const pending = new Set((rows || []).map((r) => r.ea_id as number));
  console.log(`${pending.size} players need a gender\n`);
  if (!pending.size) return;

  let updated = 0;

  for (let offset = 0; offset < 1200 && pending.size; offset += 100) {
    const page = await fetchPage(offset);
    if (!page.length) break;

    for (const item of page) {
      if (!pending.has(item.id)) continue;
      const gender = /women/i.test(item.gender?.label ?? '') ? 'women' : 'men';
      const { error } = await supabase
        .from('players')
        .update({ gender, ea_rank: item.rank })
        .eq('ea_id', item.id);
      if (!error) {
        updated++;
        pending.delete(item.id);
      }
    }

    console.log(`  offset ${offset}: ${updated} updated, ${pending.size} left`);
    await sleep(700);
  }

  console.log(`\nDone. updated=${updated} stillMissing=${pending.size}`);
}

main().catch(console.error);
