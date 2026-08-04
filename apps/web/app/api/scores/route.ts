import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/game/http';

export const dynamic = 'force-dynamic';

/** Argentinian Primera División on TheSportsDB. */
const LEAGUE = '4406';
const API = `https://www.thesportsdb.com/api/v1/json/${process.env.THESPORTSDB_KEY || '3'}`;

/** Where the matches are played, which is the calendar the reader lives in. */
const TZ = 'America/Argentina/Buenos_Aires';

interface Event {
  idEvent: string;
  strHomeTeam: string | null;
  strAwayTeam: string | null;
  intHomeScore: string | null;
  intAwayScore: string | null;
  intRound: string | null;
  strStatus: string | null;
  strPostponed: string | null;
  strTime: string | null;
  strTimeLocal: string | null;
  dateEvent: string | null;
  dateEventLocal: string | null;
  strVenue: string | null;
  strLeague: string | null;
  strSeason: string | null;
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
  /** 'live' | 'final' | 'upcoming' | 'off' */
  state: string;
  /** What to print in the status slot: 'Entretiempo', 'Final', '21:15'. */
  label: string;
  round: number | null;
  venue: string | null;
  time: string;
  day: string;
}

interface Day {
  date: string;
  /** 'Hoy', 'Ayer', 'Mañana' or a weekday. */
  title: string;
  /** '3 de agosto'. */
  subtitle: string;
  /** The matchday, when every game that day belongs to the same one. */
  round: number | null;
  matches: Match[];
}

/**
 * The upstream status codes, in the words a reader uses.
 *
 * The free feed carries no elapsed minute, so "1er tiempo" is as precise as
 * this can get — promiedos prints 62' because it pays for a live data feed.
 */
const PHASE: Record<string, string> = {
  '1H': '1er tiempo',
  '2H': '2do tiempo',
  HT: 'Entretiempo',
  ET: 'Alargue',
  BT: 'Descanso',
  P: 'Penales',
  LIVE: 'En vivo',
};

const ENDED: Record<string, string> = {
  FT: 'Final',
  'Match Finished': 'Final',
  AET: 'Final (alargue)',
  PEN: 'Final (penales)',
};

const CALLED_OFF: Record<string, string> = {
  PST: 'Postergado',
  CANC: 'Suspendido',
  ABD: 'Abandonado',
  SUSP: 'Suspendido',
};

/** '21:15:00' → '21:15'. */
const hhmm = (t: string | null) => (t || '').slice(0, 5);

function classify(e: Event): Match {
  const status = (e.strStatus || '').trim();
  const hasScore = e.intHomeScore !== null && e.intAwayScore !== null;
  const time = hhmm(e.strTimeLocal || e.strTime);

  let state = 'upcoming';
  let label = time;

  if (PHASE[status]) {
    state = 'live';
    label = PHASE[status];
  } else if (ENDED[status] || (hasScore && status !== 'NS')) {
    state = 'final';
    label = ENDED[status] ?? 'Final';
  } else if (CALLED_OFF[status] || e.strPostponed === 'yes') {
    state = 'off';
    label = CALLED_OFF[status] ?? 'Postergado';
  }

  const round = Number(e.intRound);

  return {
    id: e.idEvent,
    home: e.strHomeTeam ?? '—',
    away: e.strAwayTeam ?? '—',
    homeBadge: e.strHomeTeamBadge ?? null,
    awayBadge: e.strAwayTeamBadge ?? null,
    homeScore: hasScore ? Number(e.intHomeScore) : null,
    awayScore: hasScore ? Number(e.intAwayScore) : null,
    state,
    label,
    round: Number.isFinite(round) && round > 0 ? round : null,
    venue: e.strVenue || null,
    time,
    // The local date matters: a 21:15 kick-off in Buenos Aires is already the
    // next day in UTC, so grouping by dateEvent filed Sunday night's games
    // under Monday.
    day: e.dateEventLocal || e.dateEvent || '',
  };
}

/** Today where the matches are played, as YYYY-MM-DD. */
function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

/** Shifts a YYYY-MM-DD by whole days, away from any timezone edge. */
function shift(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function label(date: string, base: string): { title: string; subtitle: string } {
  const at = new Date(`${date}T12:00:00Z`);
  const named = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('es-AR', { ...opts, timeZone: 'UTC' }).format(at);

  const subtitle = named({ day: 'numeric', month: 'long' });

  if (date === base) return { title: 'Hoy', subtitle };
  if (date === shift(base, -1)) return { title: 'Ayer', subtitle };
  if (date === shift(base, 1)) return { title: 'Mañana', subtitle };

  const weekday = named({ weekday: 'long' });
  return { title: weekday[0].toUpperCase() + weekday.slice(1), subtitle };
}

async function fetchDay(date: string, query = `l=${LEAGUE}`, revalidate = 60): Promise<Event[]> {
  try {
    const res = await fetch(`${API}/eventsday.php?d=${date}&${query}`, {
      headers: { 'User-Agent': 'SilumatchGame/1.0' },
      signal: AbortSignal.timeout(9000),
      // The upstream free tier rate-limits hard, so a short shared cache is
      // what keeps a busy landing page from exhausting it. It is shared, so
      // the cost is fixed per interval no matter how many people are looking.
      next: { revalidate },
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
 * Yesterday, today and tomorrow in Buenos Aires, grouped by day.
 *
 * The upstream day index is UTC, and a local day runs three hours behind it, so
 * covering three local days takes four UTC ones.
 */
export async function GET() {
  try {
    const base = today();
    const utcDays = [shift(base, -1), base, shift(base, 1), shift(base, 2)];

    const [live, ...league] = await Promise.all([
      // The league-filtered day endpoint answers with a stale status — it was
      // still reporting "not started" for matches already in the first half.
      // The sport-wide one is fresh, so it supplies the status and, while a
      // match is running, the score too. It is the only thing here that
      // changes minute to minute, so it is the only one worth asking twice as
      // often; fixtures and finished results do not move.
      fetchDay(base, 's=Soccer', 30),
      ...utcDays.map((d) => fetchDay(d)),
    ]);

    const fresh = new Map(live.filter((e) => e.idEvent).map((e) => [e.idEvent, e]));

    const wanted = new Set([shift(base, -1), base, shift(base, 1)]);
    const seen = new Set<string>();
    const byDay = new Map<string, Match[]>();
    let league_name: string | null = null;
    let season: string | null = null;

    for (const e of league.flat()) {
      if (!e.idEvent || seen.has(e.idEvent)) continue;
      seen.add(e.idEvent);

      const patched = fresh.get(e.idEvent);
      const match = classify(patched ? { ...e, ...patched } : e);
      if (!wanted.has(match.day)) continue;

      league_name ??= e.strLeague;
      season ??= e.strSeason;

      byDay.set(match.day, [...(byDay.get(match.day) ?? []), match]);
    }

    // Today first — it is what the reader came for — then what is next, then
    // what they may have missed.
    const order = [base, shift(base, 1), shift(base, -1)];
    const rank: Record<string, number> = { live: 0, upcoming: 1, off: 2, final: 3 };

    const days: Day[] = order
      .filter((d) => byDay.has(d))
      .map((date) => {
        const matches = (byDay.get(date) ?? []).sort(
          (a, b) => rank[a.state] - rank[b.state] || a.time.localeCompare(b.time)
        );
        const rounds = new Set(matches.map((m) => m.round).filter((r) => r !== null));

        return {
          date,
          ...label(date, base),
          // Only claim a matchday when the day does not straddle two of them.
          round: rounds.size === 1 ? [...rounds][0]! : null,
          matches,
        };
      });

    return NextResponse.json(
      { league: league_name, season, days },
      {
        // max-age=0 keeps this out of the browser's own cache: with max-age=60
        // and a 60s poll the client kept answering itself with the copy it
        // already had instead of going to the network. The shared CDN cache is
        // what protects the upstream quota, and 30s there is the freshness a
        // panel labelled "en vivo" has to earn.
        headers: {
          'Cache-Control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=120',
        },
      }
    );
  } catch (error) {
    return errorResponse('GET /api/scores', error);
  }
}
