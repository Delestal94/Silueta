/**
 * Turns approved community submissions into playable catalog entries.
 *
 * Image work stays here rather than in the web app: the submitted URL points
 * at a stranger's host, and downloading it inside a serverless function would
 * make the site fetch arbitrary remote content on request. Here it is fetched
 * once, converted, and stored on our own bucket — nothing a submitter linked
 * to is ever served to players.
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

const MAX_BYTES = 8 * 1024 * 1024;

async function download(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'SiluetasGame/1.0' },
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return null;

    const length = Number(res.headers.get('content-length') ?? 0);
    if (length > MAX_BYTES) return null;

    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 2000 && buf.length <= MAX_BYTES ? buf : null;
  } catch {
    return null;
  }
}

async function createSilhouette(source: Buffer): Promise<Buffer> {
  const trimmed = await sharp(source).ensureAlpha().trim({ threshold: 1 }).toBuffer();
  const resized = await sharp(trimmed)
    .resize(620, 800, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  const { width, height } = await sharp(resized).metadata();
  const alpha = await sharp(resized).extractChannel('alpha').toBuffer();

  return sharp({
    create: { width: width!, height: height!, channels: 3, background: { r: 12, g: 14, b: 20 } },
  })
    .joinChannel(alpha)
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** A flat photo has no transparency and would silhouette into a rectangle. */
async function hasUsableAlpha(image: Buffer): Promise<boolean> {
  const meta = await sharp(image).metadata();
  if (!meta.hasAlpha) return false;

  const stats = await sharp(image).stats();
  const alpha = stats.channels[3];
  if (!alpha) return false;

  // A genuine cut-out leaves a good share of the frame transparent.
  return alpha.mean < 245;
}

async function main() {
  const { data: pending, error } = await supabase
    .from('players')
    .select('id, name, source_image_url, submitted_by')
    .not('source_image_url', 'is', null)
    .is('silhouette_url', null);

  if (error || !pending) {
    console.error('No se pudo leer la cola:', error?.message);
    process.exit(1);
  }

  console.log(`${pending.length} jugadores aprobados esperando silueta\n`);

  let done = 0;
  const rejected: string[] = [];

  for (const player of pending) {
    process.stdout.write(`  ${player.name.slice(0, 28).padEnd(30)}`);

    const image = await download(player.source_image_url as string);
    if (!image) {
      console.log('no se pudo descargar');
      rejected.push(player.name as string);
      continue;
    }

    if (!(await hasUsableAlpha(image))) {
      console.log('la imagen no tiene fondo transparente');
      rejected.push(player.name as string);
      continue;
    }

    try {
      const silhouette = await createSilhouette(image);
      const path = `catalog/community-${player.id}.png`;

      const { data: uploaded, error: upErr } = await supabase.storage
        .from('silhouettes')
        .upload(path, silhouette, { contentType: 'image/png', upsert: true });

      if (upErr || !uploaded) {
        console.log(`no se pudo subir: ${upErr?.message}`);
        rejected.push(player.name as string);
        continue;
      }

      const url = supabase.storage.from('silhouettes').getPublicUrl(uploaded.path).data.publicUrl;

      const { error: dbErr } = await supabase
        .from('players')
        .update({
          silhouette_url: url,
          silhouette_source: 'render',
          notable: true,
        })
        .eq('id', player.id);

      if (dbErr) {
        console.log(`error de base: ${dbErr.message}`);
        rejected.push(player.name as string);
        continue;
      }

      done++;
      console.log('listo — ya se puede subastar');
    } catch (err) {
      console.log(`error: ${err instanceof Error ? err.message : 'desconocido'}`);
      rejected.push(player.name as string);
    }
  }

  console.log(`\nprocesados=${done} rechazados=${rejected.length}`);
  if (rejected.length) {
    console.log(`Revisar la imagen de: ${rejected.join(', ')}`);
  }
}

main().catch(console.error);
