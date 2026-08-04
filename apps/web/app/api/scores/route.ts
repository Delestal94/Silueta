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

/** Guards the `?d=` parameter: a date, and one we are willing to look up. */
function requestedDay(raw: string | null, base: string): string {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return base;

  const at = new Date(`${raw}T12:00:00Z`);
  if (Number.isNaN(at.getTime())) return base;

  // A crawler walking the arrows forever would be one upstream call per step,
  // against a quota we do not control. A season either side is plenty.
  const days = (Date.parse(`${raw}T12:00:00Z`) - Date.parse(`${base}T12:00:00Z`)) / 86_400_000;
  return Math.abs(days) > 240 ? base : raw;
}

/**
 * One day in Buenos Aires, plus the days either side so the arrows have
 * somewhere to go.
 *
 * The upstream day index is UTC and a local day runs three hours behind it, so
 * a single local day straddles two UTC ones.
 */
export async function GET(request: Request) {
  try {
    const base = today();
    const asked = new URL(request.url).searchParams.get('d');
    const day = requestedDay(asked, base);

    // Nobody picked a day, so we get to pick a good one. The league plays
    // Friday to Monday, which would leave the panel empty half the week; when
    // today has nothing, fall back to the last day that did. Asking for a day
    // explicitly is different — then an empty Tuesday is the answer.
    const explicit = asked !== null && day === asked;
    const back = explicit ? 0 : 4;
    const utcDays = [];
    for (let i = -back; i <= 1; i++) utcDays.push(shift(day, i));

    const [live, ...league] = await Promise.all([
      // The league-filtered day endpoint answers with a stale status — it was
      // still reporting "not started" for matches already in the first half.
      // The sport-wide one is fresh, so it supplies the status and, while a
      // match is running, the score too. It is the only thing here that
      // changes minute to minute, so it is the only one worth asking twice as
      // often; fixtures and finished results do not move. Only worth asking at
      // all for days that can still have a match in progress.
      day === base || day === shift(base, -1) ? fetchDay(base, 's=Soccer', 30) : [],
      ...utcDays.map((d) => fetchDay(d)),
    ]);

    const fresh = new Map(live.filter((e) => e.idEvent).map((e) => [e.idEvent, e]));

    const seen = new Set<string>();
    const byDay = new Map<string, Match[]>();
    let league_name: string | null = null;
    let season: string | null = null;

    for (const e of league.flat()) {
      if (!e.idEvent || seen.has(e.idEvent)) continue;
      seen.add(e.idEvent);

      const patched = fresh.get(e.idEvent);
      const match = classify(patched ? { ...e, ...patched } : e);

      league_name ??= e.strLeague;
      season ??= e.strSeason;
      byDay.set(match.day, [...(byDay.get(match.day) ?? []), match]);
    }

    let shown = day;
    for (let i = 1; i <= back && !byDay.get(shown)?.length; i++) shown = shift(day, -i);

    const rank: Record<string, number> = { live: 0, upcoming: 1, off: 2, final: 3 };
    const matches = (byDay.get(shown) ?? []).sort(
      (a, b) => rank[a.state] - rank[b.state] || a.time.localeCompare(b.time)
    );

    const rounds = new Set(matches.map((m) => m.round).filter((r) => r !== null));

    const result: Day = {
      date: shown,
      ...label(shown, base),
      // Only claim a matchday when the day does not straddle two of them.
      round: rounds.size === 1 ? [...rounds][0]! : null,
      matches,
    };

    return NextResponse.json(
      { league: league_name, season, today: base, day: result },
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
