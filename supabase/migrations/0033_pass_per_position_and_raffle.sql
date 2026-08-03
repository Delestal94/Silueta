-- ============================================================
-- 0033: One pass per position, and nobody escapes a round for free
--
-- Two rule changes that work together:
--
--   * The pass was one for the whole game, so spending it early left you
--     defenceless for four positions. Now it is one per position group.
--
--   * A round with no bids used to go to the single remaining contender, or
--     unsold when several still needed the slot. Not bidding was therefore a
--     free way to dodge a player nobody wanted. Now it is raffled among
--     everyone who still needs that position, at the minimum price — passing
--     is the only way out, and you only get one.
-- Safe to re-run.
-- ============================================================

create table if not exists public.position_passes (
  participant_id uuid not null references public.room_participants(id) on delete cascade,
  position_type  text not null,
  used_at        timestamp with time zone default now(),
  primary key (participant_id, position_type)
);

alter table public.position_passes enable row level security;
grant select on public.position_passes to anon, authenticated;

drop policy if exists "Position passes readable" on public.position_passes;
create policy "Position passes readable" on public.position_passes for select using (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'position_passes'
  ) then
    alter publication supabase_realtime add table public.position_passes;
  end if;
end $$;

alter table public.position_passes replica identity full;

-- Carry the old single pass over as spent on the position it was used for.
insert into public.position_passes (participant_id, position_type)
select rp.id, coalesce(r.current_position, 'goalkeeper')
from public.room_participants rp
join public.rooms r on r.id = rp.room_id
where rp.passes_used >= 1
on conflict do nothing;

create or replace function public.has_pass(p_participant uuid, p_position text)
returns boolean language sql stable as $$
  select not exists (
    select 1 from public.position_passes
    where participant_id = p_participant and position_type = p_position
  );
$$;

-- ---------- passing ----------

create or replace function public.pass_round(p_round uuid, p_client_token text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_round       public.auction_rounds%rowtype;
  v_participant public.room_participants%rowtype;
  v_contenders  uuid[];
  v_passed      int;
  v_winner      uuid;
begin
  select * into v_round from public.auction_rounds where id = p_round for update;
  if not found then
    return jsonb_build_object('error', 'round_not_found');
  end if;

  if v_round.status <> 'active' then
    return jsonb_build_object('error', 'round_closed');
  end if;

  select * into v_participant
  from public.room_participants
  where room_id = v_round.room_id and client_token = p_client_token;

  if not found then
    return jsonb_build_object('error', 'not_a_participant');
  end if;

  if public.slots_remaining(v_participant.id, v_round.position_type) <= 0 then
    return jsonb_build_object('error', 'position_already_full');
  end if;

  if not public.has_pass(v_participant.id, v_round.position_type) then
    return jsonb_build_object('error', 'no_pass_left');
  end if;

  insert into public.position_passes (participant_id, position_type)
  values (v_participant.id, v_round.position_type)
  on conflict do nothing;

  -- Keep the legacy counter roughly in step for anything still reading it.
  update public.room_participants
  set passes_used = (
    select count(*) from public.position_passes where participant_id = v_participant.id
  )
  where id = v_participant.id;

  select array_agg(rp.id) into v_contenders
  from public.room_participants rp
  where rp.room_id = v_round.room_id
    and public.slots_remaining(rp.id, v_round.position_type) > 0;

  select count(*) into v_passed
  from public.position_passes pp
  where pp.position_type = v_round.position_type
    and pp.participant_id = any(v_contenders);

  -- Everyone who still needs this position has bowed out: somebody has to
  -- take him.
  if v_passed >= array_length(v_contenders, 1) then
    v_winner := v_contenders[1 + floor(random() * array_length(v_contenders, 1))::int];

    update public.auction_rounds
    set current_bid = 1,
        current_bid_by = v_winner,
        ends_at = now()
    where id = p_round;

    return jsonb_build_object('coin_flip_winner', v_winner, 'coin_flip', true, 'passed', true);
  end if;

  return jsonb_build_object('passed', true);
end;
$$;

-- ---------- settling ----------

create or replace function public.finalize_round(p_round uuid, p_host_token text default null)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_round      public.auction_rounds%rowtype;
  v_power      text;
  v_paid       integer;
  v_contenders uuid[];
  v_raffled    boolean := false;
  v_ms_left    integer;
  v_is_host    boolean := false;
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
      select 1 from public.rooms where id = v_round.room_id and host_token = p_host_token
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

  -- Nobody bid. Raffle him among everyone who still needs the position, at the
  -- minimum price: sitting on your hands is not a way to skip a round.
  if v_round.current_bid_by is null then
    select array_agg(rp.id) into v_contenders
    from public.room_participants rp
    where rp.room_id = v_round.room_id
      and public.slots_remaining(rp.id, v_round.position_type) > 0;

    if v_contenders is not null and array_length(v_contenders, 1) >= 1 then
      v_raffled := true;
      update public.auction_rounds
      set status = 'sold',
          current_bid = 1,
          current_bid_by = v_contenders[1 + floor(random() * array_length(v_contenders, 1))::int]
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

  return jsonb_build_object('round', to_jsonb(v_round), 'raffled', v_raffled,
                            'uncontested', v_raffled);
end;
$$;

-- "manotazo" now burns the pass for the position being played, not the only
-- pass of the game.
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
  v_round  public.auction_rounds%rowtype;
  v_pos    text;
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

  if v_caster.remaining_budget < v_cost then
    return jsonb_build_object('error', 'insufficient_budget');
  end if;

  if p_power = 'soplo' then
    select * into v_round
    from public.auction_rounds
    where room_id = p_room and status = 'active'
    order by created_at desc
    limit 1;

    if not found then
      return jsonb_build_object('error', 'no_active_round');
    end if;

    if exists (
      select 1 from public.power_effects
      where target_id = v_caster.id and round_id = v_round.id and power = 'soplo'
    ) then
      return jsonb_build_object('error', 'already_bought_tip');
    end if;

    update public.room_participants
    set remaining_budget = remaining_budget - v_cost
    where id = v_caster.id;

    insert into public.power_effects (
      room_id, caster_id, target_id, power, cost, round_id, status
    )
    values (p_room, v_caster.id, v_caster.id, p_power, v_cost, v_round.id, 'active')
    returning * into v_effect;

    return jsonb_build_object('effect', to_jsonb(v_effect), 'immediate', true);
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

  select current_position into v_pos from public.rooms where id = p_room;
  v_pos := coalesce(v_pos, 'goalkeeper');

  if p_power = 'manotazo' and not public.has_pass(p_target, v_pos) then
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

  if p_power = 'manotazo' then
    insert into public.position_passes (participant_id, position_type)
    values (p_target, v_pos)
    on conflict do nothing;

    update public.room_participants
    set passes_used = (
      select count(*) from public.position_passes where participant_id = p_target
    )
    where id = p_target;

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
