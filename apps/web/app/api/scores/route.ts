import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/game/http';

export const dynamic = 'force-dynamic';

/** Argentinian Primera División on TheSportsDB. */
const LEAGUE = '4406';
const API = `https://www.thesportsdb.com/api/v1/json/${process.env.THESPORTSDB_KEY || '3'}`;

interface Event {
  idEvent: string;
  strHomeTeam: string | null;
  strAwayTeam: string | null;
  intHomeScore: string | null;
  intAwayScore: string | null;
  strStatus: string | null;
  strTime: string | null;
  dateEvent: string | null;
  strHomeTeamBadge?: string | null;
  strAwayTeamBadge?: string | null;
}

interface Match {
  id: string;
  home: string;
  away: string;
  homeBadge: string | null;
  awayBadge: string | null;
  homeScore: number | null;
  awayScore: number | null;
  /** 'live' | 'final' | 'upcoming' */
  state: string;
  label: string;
}

const LIVE = new Set(['1H', '2H', 'HT', 'ET', 'P', 'BT', 'LIVE']);
const DONE = new Set(['FT', 'AET', 'PEN', 'Match Finished']);

function classify(e: Event): Match {
  const status = (e.strStatus || '').trim();
  const home = Number(e.intHomeScore);
  const away = Number(e.intAwayScore);
  const hasScore = e.intHomeScore !== null && e.intAwayScore !== null;

  let state = 'upcoming';
  let label = (e.strTime || '').slice(0, 5);

  if (LIVE.has(status)) {
    state = 'live';
    label = status === 'HT' ? 'Entretiempo' : 'En vivo';
  } else if (DONE.has(status) || (hasScore && status !== 'NS')) {
    state = 'final';
    label = 'Final';
  }

  return {
    id: e.idEvent,
    home: e.strHomeTeam ?? '—',
    away: e.strAwayTeam ?? '—',
    homeBadge: e.strHomeTeamBadge ?? null,
    awayBadge: e.strAwayTeamBadge ?? null,
    homeScore: hasScore ? home : null,
    awayScore: hasScore ? away : null,
    state,
    label,
  };
}

function day(offset: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

async function fetchDay(date: string, query = `l=${LEAGUE}`): Promise<Event[]> {
  try {
    const res = await fetch(`${API}/eventsday.php?d=${date}&${query}`, {
      headers: { 'User-Agent': 'SilumatchGame/1.0' },
      signal: AbortSignal.timeout(9000),
      // The upstream free tier rate-limits hard, so a short shared cache is
      // what keeps a busy landing page from exhausting it.
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    const body = await res.text();
    if (!body.trim() || body.trimStart().startsWith('<')) return [];
    return (JSON.parse(body).events ?? []) as Event[];
  } catch {
    return [];
  }
}

/**
 * Today's fixtures, plus yesterday's results — a single day is often empty
 * mid-week, and an empty scoreboard looks broken rather than quiet.
 */
export async function GET() {
  try {
    const [yesterday, today, tomorrow, liveFeed] = await Promise.all([
      fetchDay(day(-1)),
      fetchDay(day(0)),
      fetchDay(day(1)),
      // The league-filtered day endpoint answers with a stale status — it was
      // still reporting "not started" for matches already in the first half.
      // The sport-wide one is fresh, so it supplies the status.
      fetchDay(day(0), 's=Soccer'),
    ]);

    const freshStatus = new Map(
      liveFeed.filter((e) => e.idEvent).map((e) => [e.idEvent, e])
    );

    const seen = new Set<string>();
    const matches: Match[] = [];

    for (const e of [...today, ...yesterday, ...tomorrow]) {
      if (!e.idEvent || seen.has(e.idEvent)) continue;
      seen.add(e.idEvent);

      const live = freshStatus.get(e.idEvent);
      matches.push(classify(live ? { ...e, ...live } : e));
    }

    // Live first, then what just finished, then what is coming.
    const order: Record<string, number> = { live: 0, final: 1, upcoming: 2 };
    matches.sort((a, b) => order[a.state] - order[b.state]);

    return NextResponse.json(
      { matches: matches.slice(0, 10) },
      { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } }
    );
  } catch (error) {
    return errorResponse('GET /api/scores', error);
  }
}
