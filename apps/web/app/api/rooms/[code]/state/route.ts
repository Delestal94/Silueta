import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

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

  let currentRound = null;

  if (round) {
    const revealed = round.status !== 'active';

    // While bidding is open the identity must stay hidden — send only the
    // silhouette, never the name, or it leaks through the network tab.
    const { data: player } = await supabase
      .from('players')
      .select(
        revealed
          ? 'id, name, team, league, position, position_type, nationality, birth_date, birth_location, shirt_number, height, weight, foot, market_value, description, photo_url, silhouette_url, ea_overall, ea_pace, ea_shooting, ea_passing, ea_dribbling, ea_defending, ea_physical, ea_card_url'
          : 'id, position_type, silhouette_url'
      )
      .eq('id', round.player_id)
      .single();

    // The career era is part of the surprise: withhold it until the reveal.
    currentRound = revealed
      ? { ...round, revealed, player }
      : {
          ...round,
          season_year: null,
          era_rating: null,
          era_label: null,
          revealed,
          player,
        };
  }

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

  const { count: remainingPlayers } = await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('position_type', room.current_position || 'goalkeeper')
    .not('silhouette_url', 'is', null)
    .not('sportsdb_id', 'is', null);

  return NextResponse.json({ room, currentRound, me, remainingPlayers: remainingPlayers ?? 0 });
}
