-- ============================================================
-- 0030: The server clock decides when a round is over
--
-- finalize_round accepted any caller at any moment, and every client fires it
-- when its own Date.now() passes ends_at. So the player with the fastest clock
-- closed the auction for everyone — and anyone could cut the bidding short on
-- purpose from the console.
--
-- Now the round refuses to close while it still has time on the server, which
-- is the only clock all players share. A client asking early is simply told
-- how much is left.
--
-- Because clients no longer force the close, an abandoned round would hang
-- forever, so `settle_expired` lets any later request sweep it up.
-- Safe to re-run.
-- ============================================================

create or replace function public.finalize_round(p_round uuid)
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
begin
  select * into v_round from public.auction_rounds where id = p_round for update;

  if not found then
    return jsonb_build_object('error', 'round_not_found');
  end if;

  if v_round.status <> 'active' then
    return jsonb_build_object('round', to_jsonb(v_round), 'already_final', true);
  end if;

  -- Not over yet. Report the remainder against the shared clock rather than
  -- trusting the caller's.
  if v_round.ends_at > now() then
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

-- Closes any round in the room whose time is up. Safe to call on every read:
-- it does nothing while a round still has time left.
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

  return public.finalize_round(v_round) || jsonb_build_object('settled', true);
end;
$$;

-- Starting the next round should never be blocked by an abandoned one.
create or replace function public.next_round(p_room uuid, p_host_token text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_room      public.rooms%rowtype;
  v_positions text[] := public.position_order();
  v_start_idx int;
  v_idx       int;
  v_pos       text;
  v_needed    int;
  v_player    public.players%rowtype;
  v_round     public.auction_rounds%rowtype;
  v_birth     int;
  v_first     int;
  v_last      int;
  v_season    int;
  v_age       int;
  v_effect    public.power_effects%rowtype;
  v_decoy     uuid;
  v_mystery   boolean := false;
begin
  perform public.settle_expired(p_room);

  select * into v_room from public.rooms where id = p_room for update;
  if not found then
    return jsonb_build_object('error', 'room_not_found');
  end if;

  if v_room.host_token is distinct from p_host_token then
    return jsonb_build_object('error', 'not_host');
  end if;

  if exists (
    select 1 from public.auction_rounds where room_id = p_room and status = 'active'
  ) then
    return jsonb_build_object('error', 'round_in_progress');
  end if;

  v_start_idx := coalesce(array_position(v_positions, v_room.current_position), 1);

  for i in 0..array_length(v_positions, 1) - 1 loop
    v_idx := v_start_idx + i;
    exit when v_idx > array_length(v_positions, 1);
    v_pos := v_positions[v_idx];

    select count(*) into v_needed
    from public.room_participants rp
    where rp.room_id = p_room and public.slots_remaining(rp.id, v_pos) > 0;

    if v_needed > 0 then
      select pl.* into v_player
      from public.players pl
      where pl.position_type = v_pos
        and pl.notable
        and pl.silhouette_url is not null
        and (v_room.gender_filter = 'any' or pl.gender = v_room.gender_filter)
        and (
          v_room.pool = 'all'
          or (pl.fame_rank is not null and pl.fame_rank <= public.famous_depth())
        )
        and not exists (
          select 1 from public.auction_rounds ar
          where ar.room_id = p_room and ar.player_id = pl.id
        )
      order by random()
      limit 1;

      if v_player.id is not null then
        v_birth := extract(year from v_player.birth_date)::int;
        if v_birth is null then
          v_season := extract(year from now())::int;
          v_age := null;
        else
          v_first := v_birth + 18;
          v_last := least(extract(year from now())::int, v_birth + 36);
          if v_last < v_first then v_last := v_first; end if;
          v_season := v_first + floor(random() * (v_last - v_first + 1))::int;
          v_age := v_season - v_birth;
        end if;

        v_mystery :=
          (random() * 100) < public.mystery_chance()
          and exists (select 1 from public.player_honours where player_id = v_player.id);

        update public.rooms
        set current_position = v_pos,
            round_number = round_number + 1,
            status = 'active'
        where id = p_room
        returning * into v_room;

        insert into public.auction_rounds (
          room_id, player_id, status, current_bid, current_bid_by,
          starts_at, ends_at, position_type, round_number,
          season_year, era_rating, era_label, mystery
        )
        values (
          p_room, v_player.id, 'active', 0, null,
          now(), now() + make_interval(secs => v_room.round_seconds),
          v_pos, v_room.round_number,
          v_season,
          greatest(40, least(99, public.peak_rating(v_player) + public.age_curve(v_age))),
          public.era_label(v_age),
          v_mystery
        )
        returning * into v_round;

        for v_effect in
          select * from public.power_effects
          where room_id = p_room
            and status = 'pending'
            and (not v_mystery or power in ('impuesto', 'traba'))
        loop
          v_decoy := null;

          if v_effect.power = 'espejismo' then
            select pl.id into v_decoy
            from public.players pl
            where pl.position_type = v_pos
              and pl.notable
              and pl.silhouette_url is not null
              and pl.id <> v_player.id
              and (v_room.gender_filter = 'any' or pl.gender = v_room.gender_filter)
            order by random()
            limit 1;
          end if;

          update public.power_effects
          set status = 'active', round_id = v_round.id, decoy_player_id = v_decoy
          where id = v_effect.id;
        end loop;

        return jsonb_build_object('round', to_jsonb(v_round));
      end if;
    end if;
  end loop;

  update public.rooms set status = 'finished' where id = p_room;
  return jsonb_build_object('finished', true);
end;
$$;
