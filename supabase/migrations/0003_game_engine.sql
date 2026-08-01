-- ============================================================
-- 0003: Server-authoritative game engine
-- All round/bid/finalize logic runs in one transaction so
-- concurrent clients cannot desync or double-apply anything.
-- Safe to re-run.
-- ============================================================

alter table public.rooms
  add column if not exists round_number     integer not null default 0,
  add column if not exists current_position text,
  add column if not exists round_seconds    integer not null default 20,
  add column if not exists requirements     jsonb not null default
    '{"goalkeeper":1,"defender":2,"midfielder":1,"forward":1}'::jsonb;

alter table public.rooms drop constraint if exists rooms_status_check;
alter table public.rooms
  add constraint rooms_status_check check (status in ('lobby','active','finished'));

alter table public.auction_rounds drop constraint if exists auction_rounds_status_check;
alter table public.auction_rounds
  add constraint auction_rounds_status_check
  check (status in ('pending','active','sold','unsold'));

-- ---------- helpers ----------

create or replace function public.position_order()
returns text[] language sql immutable as $$
  select array['goalkeeper','defender','midfielder','forward'];
$$;

-- How many slots of `pos` the participant still has to fill.
create or replace function public.slots_remaining(p_participant uuid, p_position text)
returns integer language sql stable as $$
  select greatest(
    0,
    coalesce((r.requirements ->> p_position)::int, 0) - (
      select count(*)
      from public.team_players tp
      join public.players pl on pl.id = tp.player_id
      where tp.participant_id = p_participant
        and pl.position_type = p_position
    )
  )
  from public.room_participants rp
  join public.rooms r on r.id = rp.room_id
  where rp.id = p_participant;
$$;

-- ---------- start / advance a round ----------

create or replace function public.next_round(p_room uuid, p_host_token text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_room        public.rooms%rowtype;
  v_positions   text[] := public.position_order();
  v_start_idx   int;
  v_idx         int;
  v_pos         text;
  v_needed      int;
  v_player      uuid;
  v_round       public.auction_rounds%rowtype;
begin
  select * into v_room from public.rooms where id = p_room for update;
  if not found then
    return jsonb_build_object('error', 'room_not_found');
  end if;

  if v_room.host_token is distinct from p_host_token then
    return jsonb_build_object('error', 'not_host');
  end if;

  -- An already-running round must finish first.
  if exists (
    select 1 from public.auction_rounds
    where room_id = p_room and status = 'active'
  ) then
    return jsonb_build_object('error', 'round_in_progress');
  end if;

  v_start_idx := coalesce(array_position(v_positions, v_room.current_position), 1);

  -- Walk positions from the current one; skip any that nobody needs
  -- or that has no catalog players left in this room.
  for i in 0..array_length(v_positions, 1) - 1 loop
    v_idx := v_start_idx + i;
    exit when v_idx > array_length(v_positions, 1);
    v_pos := v_positions[v_idx];

    select count(*) into v_needed
    from public.room_participants rp
    where rp.room_id = p_room
      and public.slots_remaining(rp.id, v_pos) > 0;

    if v_needed > 0 then
      select pl.id into v_player
      from public.players pl
      where pl.position_type = v_pos
        and pl.silhouette_url is not null
        and pl.sportsdb_id is not null
        and not exists (
          select 1 from public.auction_rounds ar
          where ar.room_id = p_room and ar.player_id = pl.id
        )
      order by random()
      limit 1;

      if v_player is not null then
        update public.rooms
        set current_position = v_pos,
            round_number = round_number + 1,
            status = 'active'
        where id = p_room
        returning * into v_room;

        insert into public.auction_rounds (
          room_id, player_id, status, current_bid, current_bid_by,
          starts_at, ends_at, position_type, round_number
        )
        values (
          p_room, v_player, 'active', 0, null,
          now(), now() + make_interval(secs => v_room.round_seconds),
          v_pos, v_room.round_number
        )
        returning * into v_round;

        return jsonb_build_object('round', to_jsonb(v_round));
      end if;
    end if;
  end loop;

  update public.rooms set status = 'finished' where id = p_room;
  return jsonb_build_object('finished', true);
end;
$$;

-- ---------- place a bid ----------

create or replace function public.place_bid(p_round uuid, p_client_token text, p_amount integer)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_round       public.auction_rounds%rowtype;
  v_participant public.room_participants%rowtype;
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

  if p_amount > v_participant.remaining_budget then
    return jsonb_build_object('error', 'insufficient_budget');
  end if;

  if public.slots_remaining(v_participant.id, v_round.position_type) <= 0 then
    return jsonb_build_object('error', 'position_already_full');
  end if;

  insert into public.bids (round_id, participant_id, amount)
  values (p_round, v_participant.id, p_amount);

  update public.auction_rounds
  set current_bid = p_amount,
      current_bid_by = v_participant.id,
      -- Anti-sniping: a late bid keeps the auction alive briefly.
      ends_at = greatest(ends_at, now() + interval '5 seconds')
  where id = p_round
  returning * into v_round;

  return jsonb_build_object('round', to_jsonb(v_round));
end;
$$;

-- ---------- finalize ----------

create or replace function public.finalize_round(p_round uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_round public.auction_rounds%rowtype;
begin
  -- Only the first caller flips it out of 'active'; everyone else no-ops.
  update public.auction_rounds
  set status = case when current_bid_by is null then 'unsold' else 'sold' end
  where id = p_round and status = 'active'
  returning * into v_round;

  if not found then
    select * into v_round from public.auction_rounds where id = p_round;
    return jsonb_build_object('round', to_jsonb(v_round), 'already_final', true);
  end if;

  if v_round.current_bid_by is not null and coalesce(v_round.current_bid, 0) > 0 then
    insert into public.team_players (room_id, participant_id, player_id, purchase_price)
    values (v_round.room_id, v_round.current_bid_by, v_round.player_id, v_round.current_bid)
    on conflict (room_id, participant_id, player_id) do nothing;

    update public.room_participants
    set remaining_budget = greatest(0, remaining_budget - v_round.current_bid)
    where id = v_round.current_bid_by;
  end if;

  return jsonb_build_object('round', to_jsonb(v_round));
end;
$$;

-- ---------- pass / coin flip ----------
-- The flip result must be identical for every client, so the server decides it.

create or replace function public.pass_round(p_round uuid, p_client_token text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_round       public.auction_rounds%rowtype;
  v_participant public.room_participants%rowtype;
  v_eligible    uuid[];
  v_winner      uuid;
begin
  select * into v_round from public.auction_rounds where id = p_round for update;
  if not found or v_round.status <> 'active' then
    return jsonb_build_object('error', 'round_closed');
  end if;

  select * into v_participant
  from public.room_participants
  where room_id = v_round.room_id and client_token = p_client_token
  for update;

  if not found then
    return jsonb_build_object('error', 'not_a_participant');
  end if;

  if v_participant.passes_used >= 1 then
    return jsonb_build_object('error', 'no_passes_left');
  end if;

  update public.room_participants
  set passes_used = passes_used + 1
  where id = v_participant.id;

  -- With no bids on the table, a pass hands the player to a random
  -- participant who still needs that position.
  select array_agg(rp.id) into v_eligible
  from public.room_participants rp
  where rp.room_id = v_round.room_id
    and rp.id <> v_participant.id
    and public.slots_remaining(rp.id, v_round.position_type) > 0;

  if v_round.current_bid_by is null and v_eligible is not null and array_length(v_eligible, 1) > 0 then
    v_winner := v_eligible[1 + floor(random() * array_length(v_eligible, 1))::int];
    update public.auction_rounds
    set current_bid = greatest(coalesce(current_bid, 0), 1),
        current_bid_by = v_winner
    where id = p_round
    returning * into v_round;

    return jsonb_build_object('round', to_jsonb(v_round), 'coin_flip_winner', v_winner);
  end if;

  return jsonb_build_object('round', to_jsonb(v_round));
end;
$$;
