-- ============================================================
-- 0021: Wire powers into starting, bidding and settling a round
--
-- Pending effects latch onto the round that starts next. "espejismo" picks its
-- decoy here, at the moment the real player is known, so the lie is fixed for
-- the whole round instead of changing on every poll.
-- Safe to re-run.
-- ============================================================

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
begin
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

        update public.rooms
        set current_position = v_pos,
            round_number = round_number + 1,
            status = 'active'
        where id = p_room
        returning * into v_room;

        insert into public.auction_rounds (
          room_id, player_id, status, current_bid, current_bid_by,
          starts_at, ends_at, position_type, round_number,
          season_year, era_rating, era_label
        )
        values (
          p_room, v_player.id, 'active', 0, null,
          now(), now() + make_interval(secs => v_room.round_seconds),
          v_pos, v_room.round_number,
          v_season,
          greatest(40, least(99, public.peak_rating(v_player) + public.age_curve(v_age))),
          public.era_label(v_age)
        )
        returning * into v_round;

        -- Latch pending sabotage onto this round.
        for v_effect in
          select * from public.power_effects
          where room_id = p_room and status = 'pending'
        loop
          v_decoy := null;

          if v_effect.power = 'espejismo' then
            -- A believable lie: same position, never the real player.
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

-- ---------- bidding under a hex ----------

create or replace function public.place_bid(p_round uuid, p_client_token text, p_amount integer)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_round       public.auction_rounds%rowtype;
  v_participant public.room_participants%rowtype;
  v_seconds     integer;
  v_power       text;
  v_due         integer;
  v_elapsed     numeric;
begin
  select * into v_round from public.auction_rounds where id = p_round for update;
  if not found then
    return jsonb_build_object('error', 'round_not_found');
  end if;

  if v_round.status <> 'active' then
    return jsonb_build_object('error', 'round_closed');
  end if;

  if v_round.ends_at <= now() then
    return jsonb_build_object('error', 'round_expired');
  end if;

  select * into v_participant
  from public.room_participants
  where room_id = v_round.room_id and client_token = p_client_token;

  if not found then
    return jsonb_build_object('error', 'not_a_participant');
  end if;

  if p_amount <= coalesce(v_round.current_bid, 0) then
    return jsonb_build_object('error', 'bid_too_low');
  end if;

  if public.slots_remaining(v_participant.id, v_round.position_type) <= 0 then
    return jsonb_build_object('error', 'position_already_full');
  end if;

  select round_seconds into v_seconds from public.rooms where id = v_round.room_id;
  v_power := public.active_power(v_participant.id, p_round);

  if v_power = 'traba' then
    v_elapsed := extract(epoch from (now() - v_round.starts_at));
    if v_elapsed < coalesce(v_seconds, 20) / 2.0 then
      return jsonb_build_object('error', 'locked_out');
    end if;
  end if;

  -- "impuesto" doubles what the win will actually cost, so the budget check
  -- has to be against that, not the headline bid.
  v_due := case when v_power = 'impuesto' then p_amount * 2 else p_amount end;

  if v_due > v_participant.remaining_budget then
    return jsonb_build_object('error', 'insufficient_budget');
  end if;

  insert into public.bids (round_id, participant_id, amount)
  values (p_round, v_participant.id, p_amount);

  update public.auction_rounds
  set current_bid = p_amount,
      current_bid_by = v_participant.id,
      ends_at = now() + make_interval(secs => coalesce(v_seconds, 20))
  where id = p_round
  returning * into v_round;

  return jsonb_build_object('round', to_jsonb(v_round));
end;
$$;

-- ---------- settling under a hex ----------

create or replace function public.finalize_round(p_round uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_round public.auction_rounds%rowtype;
  v_power text;
  v_paid  integer;
begin
  update public.auction_rounds
  set status = case when current_bid_by is null then 'unsold' else 'sold' end
  where id = p_round and status = 'active'
  returning * into v_round;

  if not found then
    select * into v_round from public.auction_rounds where id = p_round;
    return jsonb_build_object('round', to_jsonb(v_round), 'already_final', true);
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

  -- Every hex tied to this round has now had its chance.
  update public.power_effects
  set status = 'consumed'
  where round_id = p_round and status = 'active';

  return jsonb_build_object('round', to_jsonb(v_round));
end;
$$;

-- ---------- "manotazo" burns the victim's pass on cast ----------

create or replace function public.cast_power(
  p_room uuid,
  p_client_token text,
  p_power text,
  p_target uuid
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_caster public.room_participants%rowtype;
  v_target public.room_participants%rowtype;
  v_cost   integer;
  v_effect public.power_effects%rowtype;
begin
  v_cost := public.power_cost(p_power);
  if v_cost is null then
    return jsonb_build_object('error', 'unknown_power');
  end if;

  select * into v_caster
  from public.room_participants
  where room_id = p_room and client_token = p_client_token
  for update;

  if not found then
    return jsonb_build_object('error', 'not_a_participant');
  end if;

  if v_caster.id = p_target then
    return jsonb_build_object('error', 'cannot_target_self');
  end if;

  select * into v_target
  from public.room_participants
  where id = p_target and room_id = p_room
  for update;

  if not found then
    return jsonb_build_object('error', 'target_not_found');
  end if;

  if v_caster.remaining_budget < v_cost then
    return jsonb_build_object('error', 'insufficient_budget');
  end if;

  if p_power = 'manotazo' and v_target.passes_used >= 1 then
    return jsonb_build_object('error', 'target_has_no_pass');
  end if;

  if exists (
    select 1 from public.power_effects
    where target_id = p_target and status = 'pending'
  ) then
    return jsonb_build_object('error', 'target_already_hexed');
  end if;

  update public.room_participants
  set remaining_budget = remaining_budget - v_cost
  where id = v_caster.id;

  -- This one resolves immediately: there is nothing to observe next round.
  if p_power = 'manotazo' then
    update public.room_participants set passes_used = 1 where id = p_target;

    insert into public.power_effects (room_id, caster_id, target_id, power, cost, status)
    values (p_room, v_caster.id, p_target, p_power, v_cost, 'consumed')
    returning * into v_effect;

    return jsonb_build_object('effect', to_jsonb(v_effect), 'immediate', true);
  end if;

  insert into public.power_effects (room_id, caster_id, target_id, power, cost)
  values (p_room, v_caster.id, p_target, p_power, v_cost)
  returning * into v_effect;

  return jsonb_build_object('effect', to_jsonb(v_effect));
end;
$$;
