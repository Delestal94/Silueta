/**
 * Mirrors the colour action render — the same image the silhouette is cut
 * from — onto our own storage, so the reveal can fill the shape in with
 * colour instead of cutting to an unrelated portrait.
 *
 * Re-encoded to webp at the size the game actually displays: the originals are
 * ~234 KB each and would cost about 1.5 GB across the catalog, while the
 * mirrored version is ~32 KB and fits comfortably in the free tier.
 */
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

const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
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
        await sleep(2500 * (i + 1));
        continue;
      }
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      return buf.length > 2000 ? buf : null;
    } catch {
      await sleep(1500 * (i + 1));
    }
  }
  return null;
}

async function main() {
  const batch = Number(process.env.BATCH || 500);

  // Ordered by fame rank, which is computed per gender and position: the
  // players a game is most likely to draw get their colour first, and no
  // group is left behind while another is finished. Without it the rows come
  // back in insertion order, which had covered 22% of the men and 1% of the
  // women — the reveal looked broken for entire categories.
  const { data: players, error } = await supabase
    .from('players')
    .select('id, ea_id, name, render_url')
    .eq('notable', true)
    .not('render_url', 'is', null)
    .is('colour_url', null)
    .order('fame_rank')
    .limit(batch);

  if (error || !players) {
    console.error('No se pudo leer el catálogo:', error?.message);
    process.exit(1);
  }

  console.log(`${players.length} jugadores sin imagen a color\n`);

  let done = 0;
  const failed: string[] = [];

  for (const [i, player] of players.entries()) {
    const label = `[${String(i + 1).padStart(4)}/${players.length}] ${player.name.slice(0, 24).padEnd(26)}`;

    const raw = await download(player.render_url as string);
    if (!raw) {
      console.log(`${label} no se pudo descargar`);
      failed.push(player.name as string);
      continue;
    }

    try {
      // Trimmed and framed exactly like the silhouette, so the reveal lines up
      // pixel for pixel with the shape that was on screen.
      const trimmed = await sharp(raw).ensureAlpha().trim({ threshold: 1 }).toBuffer();
      const framed = await sharp(trimmed)
        .resize(620, 800, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ quality: 82 })
        .toBuffer();

      const path = `colour/ea-${player.ea_id}.webp`;
      const { data: uploaded, error: upErr } = await supabase.storage
        .from('silhouettes')
        .upload(path, framed, { contentType: 'image/webp', upsert: true });

      if (upErr || !uploaded) {
        console.log(`${label} no se pudo subir: ${upErr?.message}`);
        failed.push(player.name as string);
        continue;
      }

      const url = supabase.storage.from('silhouettes').getPublicUrl(uploaded.path).data.publicUrl;
      const { error: dbErr } = await supabase
        .from('players')
        .update({ colour_url: url })
        .eq('id', player.id);

      if (dbErr) {
        console.log(`${label} error de base: ${dbErr.message}`);
        failed.push(player.name as string);
        continue;
      }

      done++;
      if (done % 25 === 0 || done === 1) console.log(`${label} ok (${done} listos)`);
    } catch (err) {
      console.log(`${label} error: ${err instanceof Error ? err.message : 'desconocido'}`);
      failed.push(player.name as string);
    }
  }

  console.log(`\nlistos=${done} fallaron=${failed.length}`);
  console.log('Volvé a correrlo para seguir con el siguiente lote.');
}

main().catch(console.error);
