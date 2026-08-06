/**
 * Catalog ingest.
 *
 * EA FC is the primary source: its feed is ranked by overall rating, so taking
 * the top N gives the most recognisable players without hand-curating a list,
 * and it carries the rating, the six headline stats and the official card art.
 *
 * TheSportsDB is used for one thing only — the silhouette. EA's player image is
 * a head-and-shoulders portrait, so silhouettes cut from it are indistinguishable
 * blobs; TheSportsDB's `strRender` is a full-body action pose that actually
 * reads as a specific player. A player without a render is imported but left
 * un-auctionable (`notable = false`).
 */
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import {
  elegirCandidato,
  mapPosition,
  parseBirthdate,
  type EaPlayer,
  type PositionType,
  type SportsDbPlayer,
} from './match.js';

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
const SPORTSDB_KEY = process.env.THESPORTSDB_KEY || '3';

const EA_API = 'https://drop-api.ea.com/rating/ea-sports-fc';
const SPORTSDB_API = `https://www.thesportsdb.com/api/v1/json/${SPORTSDB_KEY}`;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Los tipos, el mapeo de posiciones y la verificación de identidad viven en
// match.ts: este archivo arranca la importación al cargarse, así que nada que
// se quiera probar por separado puede quedar acá.

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function displayName(p: EaPlayer): string {
  return (p.commonName || `${p.firstName ?? ''} ${p.lastName ?? ''}`).trim();
}

/**
 * Cuántas veces se quedó sin datos por cuota y no porque el dato no exista.
 *
 * La diferencia importa: lo primero se recupera volviendo a correr, lo segundo
 * no. Sin separarlos, un jugador bloqueado por la cuota se contaba igual que
 * uno que TheSportsDB no tiene, y el resumen final decía que faltan miles de
 * fotos cuando en realidad falta cuota.
 */
export const throttled = { hits: 0 };

async function fetchJson<T>(url: string, attempts = 6): Promise<T | null> {
  let porCuota = false;

  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'SiluetasGame/1.0', Accept: 'application/json' },
        signal: AbortSignal.timeout(25000),
      });

      if (res.status === 429 || res.status >= 500) {
        porCuota = true;
        await sleep(5000 * (i + 1));
        continue;
      }
      if (!res.ok) return null;

      const body = await res.text();
      // Throttled responses come back as an HTML page on a 200.
      if (!body.trim() || body.trimStart().startsWith('<')) {
        porCuota = true;
        // Espera larga a propósito. Con la clave gratuita la cuota se recupera
        // en decenas de segundos, y perder al jugador cuesta más que esperar:
        // volver a intentarlo después implica repetir toda la corrida.
        await sleep(6000 * (i + 1));
        continue;
      }

      return JSON.parse(body) as T;
    } catch {
      await sleep(2500 * (i + 1));
    }
  }

  if (porCuota) throttled.hits++;
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
      await sleep(1200 * (i + 1));
    }
  }
  return null;
}

// The render is a transparent PNG, so its alpha channel *is* the outline.
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

async function fetchEaPage(offset: number, limit: number): Promise<EaPlayer[]> {
  const data = await fetchJson<{ items: EaPlayer[] }>(
    `${EA_API}?locale=en&limit=${limit}&offset=${offset}`
  );
  return data?.items ?? [];
}

/** TheSportsDB is consulted purely to obtain an action-pose render. */
async function findRender(ea: EaPlayer, name: string): Promise<SportsDbPlayer | null> {
  const search = await fetchJson<{ player: SportsDbPlayer[] | null }>(
    `${SPORTSDB_API}/searchplayers.php?p=${encodeURIComponent(name)}`
  );

  const candidates = (search?.player || []).filter((p) => p.strSport === 'Soccer');
  if (!candidates.length) return null;

  // Sólo se acepta un candidato que además de llamarse igual sea la misma
  // persona; si ninguno verifica, el jugador se queda sin silueta y no entra.
  const match = elegirCandidato(candidates, ea, name);
  if (!match) return null;

  // searchplayers.php omits strRender; the full record has it.
  await sleep(700);
  const full = await fetchJson<{ players: SportsDbPlayer[] | null }>(
    `${SPORTSDB_API}/lookupplayer.php?id=${match.idPlayer}`
  );

  return full?.players?.[0] ?? null;
}

async function main() {
  const resume = process.argv.includes('--resume');
  // "all" walks EA's entire roster; a number caps it.
  const requested = process.env.CATALOG_SIZE ?? '400';
  const wanted = requested === 'all' ? Number.POSITIVE_INFINITY : Number(requested);

  console.log(`Pulling the top ${wanted} EA FC players\n`);

  const roster: EaPlayer[] = [];
  for (let offset = 0; roster.length < wanted; offset += 100) {
    const page = await fetchEaPage(offset, 100);
    if (!page.length) break;
    roster.push(...page);
    console.log(`  offset ${offset}: +${page.length} (total ${roster.length})`);
    await sleep(700);
  }

  const catalog = Number.isFinite(wanted) ? roster.slice(0, wanted) : roster;
  console.log(`\nProcessing ${catalog.length} players\n`);

  const alreadyNotable = new Set<number>();
  if (resume) {
    // Paginado a mano porque PostgREST corta en 1000 filas y no avisa: la
    // respuesta llega completa y con éxito, sólo que recortada. Con el
    // catálogo en 6810, --resume creía que había 1000 hechos y volvía a
    // procesar a los otros 5810 —horas de cuota de TheSportsDB— para
    // terminar subiendo de nuevo la silueta que ya tenían.
    const TAMANO = 1000;
    for (let desde = 0; ; desde += TAMANO) {
      const { data, error } = await supabase
        .from('players')
        .select('ea_id')
        .eq('notable', true)
        .eq('silhouette_source', 'render')
        .range(desde, desde + TAMANO - 1);

      if (error) {
        console.error(`No se pudo leer lo ya hecho: ${error.message}`);
        process.exit(1);
      }

      for (const r of data || []) alreadyNotable.add(r.ea_id as number);
      if (!data || data.length < TAMANO) break;
    }
    console.log(`Resuming: ${alreadyNotable.size} already have render silhouettes\n`);
  }

  let withSilhouette = 0;
  let noSilhouette = 0;
  let skipped = 0;
  let incomplete = 0;

  for (const [i, ea] of catalog.entries()) {
    const name = displayName(ea);
    const label = `[${String(i + 1).padStart(3)}/${catalog.length}] ${name.slice(0, 24).padEnd(26)}`;

    const positionType = mapPosition(ea);
    if (!positionType) {
      console.log(`${label} unmapped position (${ea.position?.shortLabel})`);
      continue;
    }

    if (alreadyNotable.has(ea.id)) {
      skipped++;
      continue;
    }

    const stat = (k: string) => ea.stats?.[k]?.value ?? null;

    // The catalog only accepts complete rows (migration 0026). Check here so a
    // player EA reports partially is skipped with a readable reason, instead of
    // the insert failing against a constraint further down.
    const missing = [
      ['equipo', ea.team?.label],
      ['nacionalidad', ea.nationality?.label],
      ['nacimiento', parseBirthdate(ea.birthdate)],
      ['overall', ea.overallRating],
      ['ritmo', stat('pac')],
      ['tiro', stat('sho')],
      ['pase', stat('pas')],
      ['regate', stat('dri')],
      ['defensa', stat('def')],
      ['físico', stat('phy')],
    ]
      .filter(([, value]) => value === null || value === undefined || value === '')
      .map(([field]) => field);

    if (missing.length) {
      console.log(`${label} incompleto en EA (falta ${missing.join(', ')})`);
      incomplete++;
      continue;
    }

    const row: Record<string, unknown> = {
      ea_id: ea.id,
      ea_rank: ea.rank,
      name,
      team: ea.team?.label ?? null,
      club: ea.team?.label ?? null,
      league: ea.leagueName ?? null,
      ea_league: ea.leagueName ?? null,
      nationality: ea.nationality?.label ?? null,
      gender: /women/i.test(ea.gender?.label ?? '') ? 'women' : 'men',
      birth_date: parseBirthdate(ea.birthdate),
      height: ea.height ? `${ea.height} cm` : null,
      weight: ea.weight ? `${ea.weight} kg` : null,
      foot: ea.preferredFoot === 2 ? 'Left' : ea.preferredFoot === 1 ? 'Right' : null,
      position: ea.position?.label ?? null,
      ea_position: ea.position?.shortLabel ?? null,
      position_type: positionType,
      ea_overall: ea.overallRating,
      ea_pace: stat('pac'),
      ea_shooting: stat('sho'),
      ea_passing: stat('pas'),
      ea_dribbling: stat('dri'),
      ea_defending: stat('def'),
      ea_physical: stat('phy'),
      ea_skill_moves: ea.skillMoves,
      ea_weak_foot: ea.weakFootAbility,
      ea_card_url: ea.shieldUrl,
      photo_url: ea.avatarUrl,
    };

    // The silhouette needs an action pose, which only TheSportsDB provides.
    await sleep(900);
    const sdb = await findRender(ea, name);

    if (sdb?.strRender) {
      const image = await downloadImage(sdb.strRender);
      if (image) {
        try {
          const silhouette = await createSilhouette(image);
          const url = await upload(`catalog/ea-${ea.id}.png`, silhouette, 'image/png');
          if (url) {
            row.silhouette_url = url;
            row.silhouette_source = 'render';
            row.render_url = sdb.strRender;
            row.sportsdb_id = sdb.idPlayer;
            row.description = sdb.strDescriptionEN ?? null;
            row.shirt_number = sdb.strNumber ?? null;
            row.notable = true;
          }
        } catch {
          /* fall through to data-only */
        }
      }
    }

    if (!row.notable) {
      // No usable silhouette means no player. Storing the EA data anyway would
      // leave a row that can never be auctioned, and the catalog no longer
      // accepts partial entries. `--resume` retries these on a later pass.
      noSilhouette++;
      console.log(`${label} sin silueta jugable — no se guarda`);
      continue;
    }

    const { error } = await supabase.from('players').upsert(row, { onConflict: 'ea_id' });

    if (error) {
      console.log(`${label} db error: ${error.message}`);
      continue;
    }

    withSilhouette++;
    console.log(`${label} ok ${ea.overallRating} ${positionType} + silueta`);
  }

  console.log(
    `
subastables=${withSilhouette} sinSilueta=${noSilhouette} yaEstaban=${skipped} incompletos=${incomplete}` +
      `
de los que fallaron, ${throttled.hits} fue por cuota agotada y no porque falte el dato` +
      `
Volvé a correr con --resume para reintentar los que quedaron sin silueta.`
  );
}

main().catch(console.error);
