import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const REVEALED_COLUMNS =
  'id, name, team, league, position, position_type, nationality, birth_date, ' +
  'shirt_number, height, weight, foot, description, photo_url, silhouette_url, ' +
  'ea_overall, ea_pace, ea_shooting, ea_passing, ea_dribbling, ea_defending, ea_physical, ea_card_url, colour_url';

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
         id, display_name, is_host, remaining_budget, passes_used, is_ready,
         position_passes (position_type),
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

  // Clients no longer force a round closed, so a room whose players all left
  // would hang on an expired round. Any read sweeps it up; the function is a
  // no-op while there is still time on the clock.
  await supabase.rpc('settle_expired', { p_room: room.id });

  const { data: round } = await supabase
    .from('auction_rounds')
    .select(
      'id, player_id, status, current_bid, current_bid_by, starts_at, ends_at, position_type, round_number, season_year, era_rating, era_label, mystery'
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
  let boughtTip = false;

  if (me && round) {
    const { data: mine } = await supabase
      .from('power_effects')
      .select('power, decoy_player_id')
      .eq('target_id', me.id)
      .eq('round_id', round.id)
      .in('status', ['active', 'consumed']);

    for (const effect of mine ?? []) {
      if (effect.power === 'soplo') boughtTip = true;
      else myHex = effect;
    }
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

    // A mystery round has no silhouette for anyone; "apagon" withholds it from
    // one viewer. "niebla" only blurs it, which the client does with a CSS
    // filter — the shape still has to arrive.
    const hidden = !revealed && (round.mystery || myHex?.power === 'apagon');
    const shownPlayer = hidden && player ? { ...player, silhouette_url: null } : player;

    // The envelope trades the silhouette for facts: trophies and nationality,
    // which mislead as often as they help — a big club's third keeper collects
    // more medals than a star at a mid-table side.
    let envelope = null;
    if (round.mystery && !revealed) {
      const [honours, identity] = await Promise.all([
        supabase
          .from('player_honours')
          .select('honour, season, team')
          .eq('player_id', round.player_id)
          .order('season', { ascending: true })
          .limit(8),
        supabase.from('players').select('nationality').eq('id', round.player_id).single(),
      ]);

      envelope = {
        nationality: identity.data?.nationality ?? null,
        honours: honours.data ?? [],
      };
    }

    // "espejismo" only works if the victim trusts what they see. Warning them
    // mid-round would collapse it into a dearer "apagon": knowing the shape is
    // a lie, you would ignore it and bid blind. So it stays quiet while the
    // bidding is open and is disclosed at the reveal, which is when being
    // fooled is funny rather than merely unfair.
    const silentHex = myHex?.power === 'espejismo';

    // The clue this viewer paid for. Read from the real player, never the
    // decoy — someone who bought both a tip and a mirage should notice the
    // contradiction rather than be lied to twice.
    let tip: { nationality: string | null; team: string | null } | null = null;
    if (boughtTip && !revealed) {
      const { data } = await supabase
        .from('players')
        .select('nationality, team')
        .eq('id', round.player_id)
        .single();
      tip = data ?? null;
    }

    // The career era is part of the surprise: withhold it until the reveal,
    // except in an envelope round, where it is one of the few clues on offer.
    currentRound = revealed
      ? {
          ...round,
          revealed,
          player,
          envelope: null,
          tip: null,
          myHex: myHex ? { power: myHex.power } : null,
        }
      : {
          ...round,
          season_year: round.mystery ? round.season_year : null,
          era_rating: null,
          era_label: round.mystery ? round.era_label : null,
          revealed,
          player: shownPlayer,
          envelope,
          tip,
          // The victim is told *that* they are hexed, never the decoy's id.
          myHex: myHex && !silentHex ? { power: myHex.power } : null,
        };
  }

  return NextResponse.json({
    room,
    currentRound,
    me,
    effects: effects ?? [],
    // Anchors each client's countdown to a clock they all share. Without it,
    // a device 40 seconds fast shows a different timer to everyone else.
    serverTime: new Date().toISOString(),
  });
}
