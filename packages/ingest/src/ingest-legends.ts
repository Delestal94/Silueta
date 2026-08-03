/**
 * Adds retired greats to the catalog.
 *
 * They cannot come through the normal pipeline: EA's feed has no retired
 * players, so there is no rating, no stats and no card. TheSportsDB does have
 * their action render, which is the only part the game truly needs — the rest
 * comes from `legends.ts`, curated by hand.
 *
 * The era curve then does the interesting part on its own: with a real birth
 * date, Maradona in 1986 and Maradona in 1996 are the same catalog entry and
 * very different buys.
 */
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { LEGENDS, type Legend } from './legends.js';

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

interface SportsDbPlayer {
  idPlayer: string;
  strPlayer: string;
  strSport: string | null;
  strTeam: string | null;
  strNationality: string | null;
  dateBorn: string | null;
  strNumber: string | null;
  strHeight: string | null;
  strWeight: string | null;
  strSide: string | null;
  strDescriptionEN: string | null;
  strRender: string | null;
  strThumb: string | null;
  strCutout: string | null;
}

async function api<T>(path: string, attempts = 4): Promise<T | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${API}/${path}`, {
        headers: { 'User-Agent': 'SiluetasGame/1.0' },
        signal: AbortSignal.timeout(20000),
      });
      if (res.status === 429 || res.status >= 500) {
        await sleep(4000 * (i + 1));
        continue;
      }
      if (!res.ok) return null;
      const body = await res.text();
      if (body.trimStart().startsWith('<')) {
        await sleep(5000 * (i + 1));
        continue;
      }
      return JSON.parse(body) as T;
    } catch {
      await sleep(2500 * (i + 1));
    }
  }
  return null;
}

async function downloadImage(url: string, attempts = 3): Promise<Buffer | null> {
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

function normalise(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’`.]/g, '')
    .toLowerCase()
    .trim();
}

async function findPlayer(query: string, expected: string): Promise<SportsDbPlayer | null> {
  const search = await api<{ player: SportsDbPlayer[] | null }>(
    `searchplayers.php?p=${encodeURIComponent(query)}`
  );
  const candidates = (search?.player || []).filter((p) => p.strSport === 'Soccer');
  if (!candidates.length) return null;

  // Exact match on the display name, never the first hit: searching "Pele"
  // otherwise lands on a living player called Bryan Pele.
  const target = normalise(expected);
  const match = candidates.find((p) => normalise(p.strPlayer) === target);
  if (!match) return null;

  await sleep(700);
  const full = await api<{ players: SportsDbPlayer[] | null }>(
    `lookupplayer.php?id=${match.idPlayer}`
  );
  return full?.players?.[0] ?? null;
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

async function upload(path: string, buffer: Buffer, contentType: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('silhouettes')
    .upload(path, buffer, { contentType, upsert: true });
  if (error) return null;
  return supabase.storage.from('silhouettes').getPublicUrl(data.path).data.publicUrl;
}

async function importLegend(legend: Legend, label: string): Promise<'ok' | 'skip' | 'fail'> {
  const { data: existing } = await supabase
    .from('players')
    .select('id')
    .eq('name', legend.name)
    .maybeSingle();

  if (existing) {
    console.log(`${label} ya estaba`);
    return 'skip';
  }

  await sleep(1200);
  const sdb = await findPlayer(legend.searchAs ?? legend.name, legend.name);

  if (!sdb) {
    console.log(`${label} no se encontró en TheSportsDB`);
    return 'fail';
  }
  if (!sdb.strRender) {
    console.log(`${label} sin render de acción — sin silueta no se puede jugar`);
    return 'fail';
  }
  if (!sdb.dateBorn) {
    console.log(`${label} sin fecha de nacimiento — la época no se podría calcular`);
    return 'fail';
  }

  const image = await downloadImage(sdb.strRender);
  if (!image) {
    console.log(`${label} no se pudo descargar el render`);
    return 'fail';
  }

  try {
    const silhouette = await createSilhouette(image);
    const silhouetteUrl = await upload(`catalog/legend-${sdb.idPlayer}.png`, silhouette, 'image/png');
    if (!silhouetteUrl) {
      console.log(`${label} no se pudo subir la silueta`);
      return 'fail';
    }

    // The same figure in colour, for the reveal.
    const trimmed = await sharp(image).ensureAlpha().trim({ threshold: 1 }).toBuffer();
    const colour = await sharp(trimmed)
      .resize(620, 800, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 82 })
      .toBuffer();
    const colourUrl = await upload(`colour/legend-${sdb.idPlayer}.webp`, colour, 'image/webp');

    const { error } = await supabase.from('players').insert({
      sportsdb_id: sdb.idPlayer,
      name: legend.name,
      position: legend.position,
      position_type: legend.position,
      gender: 'men',
      nationality: sdb.strNationality ?? 'Desconocida',
      team: sdb.strTeam ?? 'Retirado',
      club: sdb.strTeam ?? 'Retirado',
      league: 'Leyendas',
      birth_date: sdb.dateBorn,
      shirt_number: sdb.strNumber,
      height: sdb.strHeight,
      weight: sdb.strWeight,
      foot: sdb.strSide,
      description: sdb.strDescriptionEN,
      ea_overall: legend.rating,
      ea_pace: legend.pace,
      ea_shooting: legend.shooting,
      ea_passing: legend.passing,
      ea_dribbling: legend.dribbling,
      ea_defending: legend.defending,
      ea_physical: legend.physical,
      photo_url: sdb.strThumb ?? sdb.strCutout ?? sdb.strRender,
      render_url: sdb.strRender,
      silhouette_url: silhouetteUrl,
      silhouette_source: 'render',
      colour_url: colourUrl,
      submitted_by: 'Leyendas',
      // Legends are exactly the players everyone can name, so they belong in
      // the "famous" pool without waiting on a Wikipedia score.
      fame_score: 5_000_000,
      notable: true,
    });

    if (error) {
      console.log(`${label} error de base: ${error.message}`);
      return 'fail';
    }

    console.log(`${label} ok (${legend.position}, ${legend.rating})`);
    return 'ok';
  } catch (err) {
    console.log(`${label} error: ${err instanceof Error ? err.message : 'desconocido'}`);
    return 'fail';
  }
}

async function main() {
  console.log(`Importando ${LEGENDS.length} leyendas\n`);

  const counts = { ok: 0, skip: 0, fail: 0 };
  const failed: string[] = [];

  for (const [i, legend] of LEGENDS.entries()) {
    const label = `[${String(i + 1).padStart(2)}/${LEGENDS.length}] ${legend.name.slice(0, 22).padEnd(24)}`;
    const result = await importLegend(legend, label);
    counts[result]++;
    if (result === 'fail') failed.push(legend.name);
  }

  console.log(`\nimportadas=${counts.ok} yaEstaban=${counts.skip} fallaron=${counts.fail}`);
  if (failed.length) console.log(`Revisar: ${failed.join(', ')}`);

  // The famous pool is ranked per gender and position, so it has to be redone
  // for the legends to actually appear in games.
  const { error } = await supabase.rpc('refresh_fame_ranks');
  console.log(error ? `No se pudo recalcular el ranking: ${error.message}` : 'Ranking de fama recalculado');
}

main().catch(console.error);
