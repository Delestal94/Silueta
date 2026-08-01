/**
 * Pulls trophies for the "famous" pool, used as the clue in mystery rounds.
 *
 * Only that pool is fetched, and deliberately so: an envelope showing the
 * honours of someone nobody could name is not a puzzle, it's noise. The pool
 * is capped per gender and position, so this stays around 160 players no
 * matter how large the catalog grows.
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

const API = `https://www.thesportsdb.com/api/v1/json/${process.env.THESPORTSDB_KEY || '3'}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Honour {
  strHonour: string | null;
  strSeason: string | null;
  strTeam: string | null;
}

async function fetchHonours(sportsdbId: string, attempts = 5): Promise<Honour[] | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${API}/lookuphonours.php?id=${sportsdbId}`, {
        headers: { 'User-Agent': 'SiluetasGame/1.0' },
        signal: AbortSignal.timeout(20000),
      });

      if (res.status === 429 || res.status >= 500) {
        await sleep(6000 * (i + 1));
        continue;
      }
      if (!res.ok) return null;

      const body = await res.text();
      // Throttling arrives as an HTML page on a 200.
      if (body.trimStart().startsWith('<') || body.includes('error code')) {
        await sleep(6000 * (i + 1));
        continue;
      }

      return (JSON.parse(body).honours ?? []) as Honour[];
    } catch {
      await sleep(3000 * (i + 1));
    }
  }
  return null;
}

async function main() {
  const refresh = process.argv.includes('--refresh');

  const { data: players, error } = await supabase
    .from('players')
    .select('id, name, sportsdb_id, fame_rank')
    .eq('notable', true)
    .not('sportsdb_id', 'is', null)
    .lte('fame_rank', 20)
    .order('fame_rank');

  if (error || !players) {
    console.error('Could not load the pool:', error?.message);
    process.exit(1);
  }

  let pending = players;

  if (!refresh) {
    const { data: known } = await supabase.from('player_honours').select('player_id');
    const have = new Set((known || []).map((r) => r.player_id as string));
    pending = players.filter((p) => !have.has(p.id));
  }

  console.log(`${players.length} en el pool, ${pending.length} por consultar\n`);

  let withHonours = 0;
  let without = 0;
  const failed: string[] = [];

  for (const [i, player] of pending.entries()) {
    const label = `[${String(i + 1).padStart(3)}/${pending.length}] ${player.name.slice(0, 24).padEnd(26)}`;

    await sleep(2200);
    const honours = await fetchHonours(player.sportsdb_id as string);

    if (honours === null) {
      console.log(`${label} sin respuesta`);
      failed.push(player.name);
      continue;
    }

    if (!honours.length) {
      console.log(`${label} sin títulos`);
      without++;
      continue;
    }

    const rows = honours
      .filter((h) => h.strHonour)
      .map((h) => ({
        player_id: player.id,
        honour: h.strHonour as string,
        season: h.strSeason,
        team: h.strTeam,
      }));

    if (refresh) await supabase.from('player_honours').delete().eq('player_id', player.id);

    const { error: insertError } = await supabase
      .from('player_honours')
      .upsert(rows, { onConflict: 'player_id,honour,season' });

    if (insertError) {
      console.log(`${label} error de base: ${insertError.message}`);
      failed.push(player.name);
      continue;
    }

    withHonours++;
    console.log(`${label} ${rows.length} títulos`);
  }

  console.log(`\nconTítulos=${withHonours} sinTítulos=${without} fallaron=${failed.length}`);
  if (failed.length) console.log(`Reintentar: ${failed.join(', ')}`);
}

main().catch(console.error);
