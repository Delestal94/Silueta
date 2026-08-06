/**
 * Scores how recognisable each catalog player is, using a year of English
 * Wikipedia pageviews.
 *
 * EA's ranking is by rating, not by fame — an 88-rated Bundesliga goalkeeper
 * outranks most of the squad while almost nobody could name him. Pageviews
 * measure the thing the game actually needs: would a player at the table
 * recognise this person?
 *
 * Titles are resolved in batches of 50 through the action API (which follows
 * redirects), because per-name search gets rate-limited long before a catalog
 * of a few hundred players is done.
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

const UA = 'SiluetasGame/1.0 (educational project)';
const HEADERS = { 'User-Agent': UA, 'Api-User-Agent': UA, Accept: 'application/json' };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// A player good enough for EA's top 400 who reads as almost never looked up is
// far more likely to be a failed title match than a genuine unknown.
const IMPLAUSIBLY_LOW = 20000;

interface Player {
  id: string;
  name: string;
  fame_score: number | null;
}

function strip(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

function window12Months(): [string, string] {
  const end = new Date();
  const start = new Date(end);
  start.setFullYear(start.getFullYear() - 1);
  const fmt = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}0100`;
  return [fmt(start), fmt(end)];
}

/** Wikipedia answers 429 with a plain-text body, so a JSON parse failure is throttling. */
async function wiki<T>(url: string, attempts = 6): Promise<T | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(25000) });
      if (res.status === 404) return null;
      if (res.status === 429 || res.status >= 500) {
        await sleep(8000 * (i + 1));
        continue;
      }
      if (!res.ok) return null;

      const body = await res.text();
      try {
        return JSON.parse(body) as T;
      } catch {
        await sleep(8000 * (i + 1));
      }
    } catch {
      await sleep(4000 * (i + 1));
    }
  }
  return null;
}

interface QueryResponse {
  query?: {
    normalized?: { from: string; to: string }[];
    redirects?: { from: string; to: string }[];
    pages?: Record<string, { title: string; missing?: string }>;
  };
}

/** Resolves up to 50 names at once, following normalisation and redirects. */
async function resolveBatch(names: string[]): Promise<Map<string, string>> {
  const resolved = new Map<string, string>();

  const url =
    `https://en.wikipedia.org/w/api.php?action=query&redirects=1&format=json` +
    `&titles=${encodeURIComponent(names.join('|'))}`;

  const data = await wiki<QueryResponse>(url);
  if (!data?.query) return resolved;

  const hops = new Map<string, string>();
  for (const n of data.query.normalized ?? []) hops.set(n.from, n.to);
  for (const r of data.query.redirects ?? []) hops.set(r.from, r.to);

  const existing = new Set(
    Object.values(data.query.pages ?? {})
      .filter((p) => !p.missing)
      .map((p) => p.title)
  );

  for (const name of names) {
    let title = name;
    // normalisation then redirect, so follow the chain a couple of times
    for (let i = 0; i < 3 && hops.has(title); i++) title = hops.get(title)!;
    if (existing.has(title)) resolved.set(name, title);
  }

  return resolved;
}

/** Last resort for names Wikipedia files differently ("Vini Jr."). */
async function resolveBySearch(name: string): Promise<string | null> {
  const tokens = strip(name).split(' ').filter((t) => t.length > 2);
  if (!tokens.length) return null;

  for (const query of [`${name} footballer`, name]) {
    const url =
      `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=5` +
      `&srsearch=${encodeURIComponent(query)}`;

    const data = await wiki<{ query?: { search?: { title: string }[] } }>(url);
    const hits = data?.query?.search ?? [];

    // Rank by how much of the name each title covers. Surname alone is not
    // enough: searching "Kylian Mbappé" also surfaces "Wilfrid Mbappé".
    const best = hits
      .map((hit, order) => {
        const title = strip(hit.title);
        return { title: hit.title, covered: tokens.filter((t) => title.includes(t)).length, order };
      })
      .filter((c) => c.covered === tokens.length)
      .sort((a, b) => a.order - b.order)[0];

    if (best) return best.title;
    await sleep(1500);
  }

  return null;
}

async function pageviews(title: string): Promise<number | null> {
  const [start, end] = window12Months();
  const url =
    `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia` +
    `/all-access/user/${encodeURIComponent(title.replace(/ /g, '_'))}/monthly/${start}/${end}`;

  const data = await wiki<{ items?: { views: number }[] }>(url);
  if (!data) return null;
  return (data.items || []).reduce((sum, item) => sum + item.views, 0);
}

async function main() {
  const refresh = process.argv.includes('--refresh');
  const repair = process.argv.includes('--repair');

  // Paginado a mano: PostgREST corta en 1000 filas sin avisar —la respuesta
  // llega completa y con éxito, sólo que recortada— y acá eso importa más que
  // en otros lados, porque de fame_score sale fame_rank y de ahí quién entra
  // al pool de famosos. Con --refresh sobre un catálogo de 6810, se estaban
  // recalculando los primeros 1000 y el resto quedaba con el valor viejo.
  const TAMANO = 1000;
  const players: Player[] = [];

  for (let desde = 0; ; desde += TAMANO) {
    let query = supabase
      .from('players')
      .select('id, name, fame_score')
      .not('ea_id', 'is', null)
      .order('ea_rank')
      .range(desde, desde + TAMANO - 1);

    if (repair) query = query.or(`fame_score.is.null,fame_score.lt.${IMPLAUSIBLY_LOW}`);
    else if (!refresh) query = query.is('fame_score', null);

    const { data, error } = await query;
    if (error || !data) {
      console.error('Could not load catalog:', error?.message);
      process.exit(1);
    }

    players.push(...(data as Player[]));
    if (data.length < TAMANO) break;
  }
  console.log(`Scoring ${players.length} players\n`);

  // Step 1: batch-resolve titles.
  const titles = new Map<string, string>();
  for (let i = 0; i < players.length; i += 50) {
    const chunk = players.slice(i, i + 50);
    const resolved = await resolveBatch(chunk.map((p) => p.name));
    for (const [name, title] of resolved) titles.set(name, title);
    console.log(`  titles ${i + chunk.length}/${players.length} (${titles.size} resolved)`);
    await sleep(2500);
  }

  // Step 2: search for whatever the batch could not match.
  const unresolved = players.filter((p) => !titles.has(p.name));
  console.log(`\n${unresolved.length} need a search fallback\n`);

  for (const player of unresolved) {
    const title = await resolveBySearch(player.name);
    if (title) {
      titles.set(player.name, title);
      console.log(`  ${player.name.padEnd(26)} -> ${title}`);
    } else {
      console.log(`  ${player.name.padEnd(26)} -> sin artículo`);
    }
    await sleep(2000);
  }

  // Step 3: pageviews.
  console.log(`\nFetching pageviews\n`);
  let scored = 0;
  const missing: string[] = [];

  for (const [i, player] of players.entries()) {
    const label = `[${String(i + 1).padStart(3)}/${players.length}] ${player.name.slice(0, 24).padEnd(26)}`;
    const title = titles.get(player.name);

    if (!title) {
      await supabase.from('players').update({ fame_score: 0 }).eq('id', player.id);
      missing.push(player.name);
      console.log(`${label} sin artículo`);
      continue;
    }

    await sleep(900);
    const views = await pageviews(title);

    if (views === null) {
      missing.push(player.name);
      console.log(`${label} sin datos de visitas`);
      continue;
    }

    await supabase.from('players').update({ fame_score: views }).eq('id', player.id);
    scored++;
    console.log(`${label} ${views.toLocaleString('es').padStart(11)}  ${title}`);
  }

  console.log(`\nscored=${scored} unresolved=${missing.length}`);
  if (missing.length) console.log(`\nSin resolver: ${missing.join(', ')}`);
}

main().catch(console.error);
