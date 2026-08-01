-- ============================================================
-- 0022: Assign the player when nobody is left to bid against
--
-- If only one participant still needs the position and the round closes with
-- no bids, the player is theirs. Leaving it unsold was not just unfair — it
-- could stall the game: the position stays unfilled, next_round offers another
-- player for the same slot, and with nobody to outbid there is no reason for
-- that to ever resolve.
--
-- With two or more still needing it, an empty round stays unsold: they all had
-- the chance to bid, and a fresh player comes up next.
-- Safe to re-run.
-- ============================================================

create or replace function public.finalize_round(p_round uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_round      public.auction_rounds%rowtype;
  v_power      text;
  v_paid       integer;
  v_contenders uuid[];
  v_uncontested boolean := false;
begin
  update public.auction_rounds
  set status = case when current_bid_by is null then 'unsold' else 'sold' end
  where id = p_round and status = 'active'
  returning * into v_round;

  if not found then
    select * into v_round from public.auction_rounds where id = p_round;
    return jsonb_build_object('round', to_jsonb(v_round), 'already_final', true);
  end if;

  -- Nobody bid: hand the player over if exactly one participant still needs
  -- this position.
  if v_round.current_bid_by is null then
    select array_agg(rp.id) into v_contenders
    from public.room_participants rp
    where rp.room_id = v_round.room_id
      and public.slots_remaining(rp.id, v_round.position_type) > 0;

    if v_contenders is not null and array_length(v_contenders, 1) = 1 then
      v_uncontested := true;
      update public.auction_rounds
      set status = 'sold',
          current_bid = 1,
          current_bid_by = v_contenders[1]
      where id = p_round
      returning * into v_round;
    end if;
  end if;

  if v_round.current_bid_by is not null and coalesce(v_round.current_bid, 0) > 0 then
    v_power := public.active_power(v_round.current_bid_by, p_round);
    v_paid := case when v_power = 'impuesto' then v_round.current_bid * 2 else v_round.current_bid end;

    insert into public.team_players (
      room_id, participant_id, player_id, purchase_price,
      rating, season_year, era_label, position_type
    )
    values (
      v_round.room_id, v_round.current_bid_by, v_round.player_id, v_paid,
      v_round.era_rating, v_round.season_year, v_round.era_label, v_round.position_type
    )
    on conflict (room_id, participant_id, player_id) do nothing;

    update public.room_participants
    set remaining_budget = greatest(0, remaining_budget - v_paid)
    where id = v_round.current_bid_by;
  end if;

  update public.power_effects
  set status = 'consumed'
  where round_id = p_round and status = 'active';

  return jsonb_build_object('round', to_jsonb(v_round), 'uncontested', v_uncontested);
end;
$$;
