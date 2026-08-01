import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const REVEALED_COLUMNS =
  'id, name, team, league, position, position_type, nationality, birth_date, birth_location, ' +
  'shirt_number, height, weight, foot, market_value, description, photo_url, silhouette_url, ' +
  'ea_overall, ea_pace, ea_shooting, ea_passing, ea_dribbling, ea_defending, ea_physical, ea_card_url';

const HIDDEN_COLUMNS = 'id, position_type, silhouette_url';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const clientToken = request.headers.get('x-client-token');
  const supabase = createAdminClient();

  const { data: room, error } = await supabase
    .from('rooms')
    .select(
      `id, code, status, starting_budget, round_number, current_position, round_seconds, requirements,
       room_participants (
         id, display_name, is_host, remaining_budget, passes_used,
         team_players (
           purchase_price, rating, season_year, era_label,
           players (id, name, team, position, position_type, nationality, photo_url, silhouette_url)
         )
       )`
    )
    .eq('code', code.toUpperCase())
    .single();

  if (error || !room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  const { data: round } = await supabase
    .from('auction_rounds')
    .select(
      'id, player_id, status, current_bid, current_bid_by, starts_at, ends_at, position_type, round_number, season_year, era_rating, era_label'
    )
    .eq('room_id', room.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const me = clientToken
    ? (
        await supabase
          .from('room_participants')
          .select('id, display_name, is_host, remaining_budget, passes_used')
          .eq('room_id', room.id)
          .eq('client_token', clientToken)
          .maybeSingle()
      ).data
    : null;

  // Sabotage aimed at whoever is asking. Resolved here rather than in the
  // browser: a client that receives the real silhouette and merely hides it
  // is one devtools panel away from being useless.
  let myHex: { power: string; decoy_player_id: string | null } | null = null;
  if (me && round?.status === 'active') {
    myHex =
      (
        await supabase
          .from('power_effects')
          .select('power, decoy_player_id')
          .eq('target_id', me.id)
          .eq('round_id', round.id)
          .eq('status', 'active')
          .maybeSingle()
      ).data ?? null;
  }

  const { data: effects } = round
    ? await supabase
        .from('power_effects')
        .select('id, power, caster_id, target_id, status')
        .eq('room_id', room.id)
        .in('status', ['pending', 'active'])
    : { data: [] };

  let currentRound = null;

  if (round) {
    const revealed = round.status !== 'active';

    // "espejismo" swaps in another player of the same position, so the victim
    // bids on someone who is not up for auction at all.
    const shownPlayerId =
      !revealed && myHex?.power === 'espejismo' && myHex.decoy_player_id
        ? myHex.decoy_player_id
        : round.player_id;

    // While bidding is open the identity must stay hidden — send only the
    // silhouette, never the name, or it leaks through the network tab.
    // The column list is built as a plain string so supabase-js does not try
    // to type-parse a conditional select.
    const columns: string = revealed ? REVEALED_COLUMNS : HIDDEN_COLUMNS;

    const { data } = await supabase
      .from('players')
      .select(columns)
      .eq('id', shownPlayerId)
      .single();

    const player = data as Record<string, unknown> | null;

    // "apagon" withholds the image outright; "niebla" only blurs it, which the
    // client does with a CSS filter — the shape still has to arrive.
    const hidden = !revealed && myHex?.power === 'apagon';
    const shownPlayer = hidden && player ? { ...player, silhouette_url: null } : player;

    // The career era is part of the surprise: withhold it until the reveal.
    currentRound = revealed
      ? { ...round, revealed, player, myHex: null }
      : {
          ...round,
          season_year: null,
          era_rating: null,
          era_label: null,
          revealed,
          player: shownPlayer,
          // The victim is told *that* they are hexed, never the decoy's id.
          myHex: myHex ? { power: myHex.power } : null,
        };
  }

  return NextResponse.json({ room, currentRound, me, effects: effects ?? [] });
}
