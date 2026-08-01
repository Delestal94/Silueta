import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. Copy packages/ingest/.env.example to .env and fill it in.`);
    process.exit(1);
  }
  return value;
}

const SUPABASE_URL = requireEnv('SUPABASE_URL');
const SUPABASE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function download(url: string, attempts = 3): Promise<Buffer | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'SiluetasGame/1.0' },
        signal: AbortSignal.timeout(25000),
      });
      if (res.status === 429) {
        await sleep(2000 * (i + 1));
        continue;
      }
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      return buf.length > 1500 ? buf : null;
    } catch {
      await sleep(1000 * (i + 1));
    }
  }
  return null;
}

// Reveal photos are served straight to players, so keep them on our own bucket
// instead of hot-linking a third-party CDN at runtime.
async function main() {
  const { data: players, error } = await supabase
    .from('players')
    .select('id, sportsdb_id, name, cutout_url, photo_url')
    .not('sportsdb_id', 'is', null)
    .not('photo_url', 'is', null);

  if (error || !players) {
    console.error('Could not load catalog:', error?.message);
    process.exit(1);
  }

  const pending = players.filter((p) => !p.photo_url!.includes(SUPABASE_URL));
  console.log(`${players.length} players, ${pending.length} still on the remote CDN\n`);

  let ok = 0;
  const failed: string[] = [];

  for (const [i, player] of pending.entries()) {
    process.stdout.write(`[${i + 1}/${pending.length}] ${player.name.slice(0, 26).padEnd(28)}`);

    const source = player.photo_url!;
    const image = await download(source);
    if (!image) {
      console.log('download failed');
      failed.push(player.name);
      continue;
    }

    try {
      const webp = await sharp(image)
        .resize(400, 400, { fit: 'cover', position: 'top' })
        .webp({ quality: 82 })
        .toBuffer();

      const { data, error: upErr } = await supabase.storage
        .from('silhouettes')
        .upload(`photos/${player.sportsdb_id}.webp`, webp, {
          contentType: 'image/webp',
          upsert: true,
        });

      if (upErr) {
        console.log(`upload failed: ${upErr.message}`);
        failed.push(player.name);
        continue;
      }

      const publicUrl = supabase.storage.from('silhouettes').getPublicUrl(data.path).data.publicUrl;

      const { error: dbErr } = await supabase
        .from('players')
        .update({ photo_url: publicUrl, source_photo_url: source })
        .eq('id', player.id);

      if (dbErr) {
        console.log(`db failed: ${dbErr.message}`);
        failed.push(player.name);
        continue;
      }

      ok++;
      console.log('ok');
    } catch (err) {
      console.log(`error: ${err instanceof Error ? err.message : 'unknown'}`);
      failed.push(player.name);
    }
  }

  console.log(`\nMirrored ${ok}/${pending.length}. Failed: ${failed.length}`);
}

main().catch(console.error);
