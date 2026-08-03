-- ============================================================
-- 0031: Separate the automatic close from a deliberate one
--
-- 0030 made the round refuse to close before its time, which is right for the
-- automatic path: every client fires it when its own clock hits zero, so the
-- fastest clock would cut the bidding short for everyone.
--
-- But it also removed a legitimate action — the host banging the gavel. That
-- is not the same thing: it is authenticated, deliberate, and the host already
-- decides when rounds begin.
--
-- So early closing now requires the host token, and the automatic path never
-- sends it.
-- Safe to re-run.
-- ============================================================

create or replace function public.finalize_round(p_round uuid, p_host_token text default null)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_round       public.auction_rounds%rowtype;
  v_power       text;
  v_paid        integer;
  v_contenders  uuid[];
  v_uncontested boolean := false;
  v_ms_left     integer;
  v_is_host     boolean := false;
begin
  select * into v_round from public.auction_rounds where id = p_round for update;

  if not found then
    return jsonb_build_object('error', 'round_not_found');
  end if;

  if v_round.status <> 'active' then
    return jsonb_build_object('round', to_jsonb(v_round), 'already_final', true);
  end if;

  if p_host_token is not null then
    select exists (
      select 1 from public.rooms
      where id = v_round.room_id and host_token = p_host_token
    ) into v_is_host;
  end if;

  if v_round.ends_at > now() and not v_is_host then
    v_ms_left := ceil(extract(epoch from (v_round.ends_at - now())) * 1000)::int;
    return jsonb_build_object('error', 'round_still_open', 'ms_left', v_ms_left);
  end if;

  update public.auction_rounds
  set status = case when current_bid_by is null then 'unsold' else 'sold' end
  where id = p_round and status = 'active'
  returning * into v_round;

  if not found then
    select * into v_round from public.auction_rounds where id = p_round;
    return jsonb_build_object('round', to_jsonb(v_round), 'already_final', true);
  end if;

  if v_round.current_bid_by is null then
    select array_agg(rp.id) into v_contenders
    from public.room_participants rp
    where rp.room_id = v_round.room_id
      and public.slots_remaining(rp.id, v_round.position_type) > 0;

    if v_contenders is not null and array_length(v_contenders, 1) = 1 then
      v_uncontested := true;
      update public.auction_rounds
      set status = 'sold', current_bid = 1, current_bid_by = v_contenders[1]
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

-- The sweep is never a deliberate close, so it passes no token.
create or replace function public.settle_expired(p_room uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_round uuid;
begin
  select id into v_round
  from public.auction_rounds
  where room_id = p_room and status = 'active' and ends_at <= now()
  limit 1;

  if v_round is null then
    return jsonb_build_object('settled', false);
  end if;

  return public.finalize_round(v_round, null) || jsonb_build_object('settled', true);
end;
$$;
