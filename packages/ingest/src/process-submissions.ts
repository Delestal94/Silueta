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
  // Approved proposals live in the queue until the image is ready. The player
  // row is created here, complete, in one step: the catalog rejects partial
  // rows outright (migration 0026).
  const { data: approved, error } = await supabase
    .from('player_submissions')
    .select('id, payload')
    .eq('kind', 'new')
    .eq('status', 'approved');

  if (error || !approved) {
    console.error('No se pudo leer la cola:', error?.message);
    process.exit(1);
  }

  // Skip the ones already turned into players.
  const names = approved.map((s) => String((s.payload as Record<string, unknown>).name));
  const { data: existing } = names.length
    ? await supabase.from('players').select('name').in('name', names)
    : { data: [] };
  const already = new Set((existing ?? []).map((p) => p.name as string));

  const pending = approved.filter(
    (s) => !already.has(String((s.payload as Record<string, unknown>).name))
  );

  console.log(`${pending.length} propuestas aprobadas esperando silueta
`);

  let done = 0;
  const rejected: string[] = [];

  for (const submission of pending) {
    const p = submission.payload as Record<string, string | number>;
    const name = String(p.name);
    process.stdout.write(`  ${name.slice(0, 28).padEnd(30)}`);

    const image = await download(String(p.imageUrl));
    if (!image) {
      console.log('no se pudo descargar');
      rejected.push(name);
      continue;
    }

    if (!(await hasUsableAlpha(image))) {
      console.log('la imagen no tiene fondo transparente');
      rejected.push(name);
      continue;
    }

    try {
      const silhouette = await createSilhouette(image);
      const path = `catalog/community-${submission.id}.png`;

      const { data: uploaded, error: upErr } = await supabase.storage
        .from('silhouettes')
        .upload(path, silhouette, { contentType: 'image/png', upsert: true });

      if (upErr || !uploaded) {
        console.log(`no se pudo subir: ${upErr?.message}`);
        rejected.push(name);
        continue;
      }

      const url = supabase.storage.from('silhouettes').getPublicUrl(uploaded.path).data.publicUrl;

      const { error: dbErr } = await supabase.from('players').insert({
        name,
        position: String(p.positionType),
        position_type: String(p.positionType),
        gender: String(p.gender),
        nationality: String(p.nationality),
        team: String(p.team),
        club: String(p.team),
        league: 'Comunidad',
        birth_date: String(p.birthDate),
        ea_overall: Number(p.rating),
        prime_rating: Number(p.rating),
        ea_pace: Number(p.pace),
        ea_shooting: Number(p.shooting),
        ea_passing: Number(p.passing),
        ea_dribbling: Number(p.dribbling),
        ea_defending: Number(p.defending),
        ea_physical: Number(p.physical),
        silhouette_url: url,
        silhouette_source: 'render',
        submitted_by: String(p.submittedBy),
        notable: true,
      });

      if (dbErr) {
        console.log(`error de base: ${dbErr.message}`);
        rejected.push(name);
        continue;
      }

      done++;
      console.log('listo — ya se puede subastar');
    } catch (err) {
      console.log(`error: ${err instanceof Error ? err.message : 'desconocido'}`);
      rejected.push(name);
    }
  }

  console.log(`
procesados=${done} rechazados=${rejected.length}`);
  if (rejected.length) {
    console.log(`Revisar la imagen de: ${rejected.join(', ')}`);
  }
}

main().catch(console.error);
