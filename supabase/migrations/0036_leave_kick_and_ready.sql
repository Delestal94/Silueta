-- ============================================================
-- 0036: Leaving, kicking, and starting by agreement
--
-- Three gaps in how a room is run:
--
--   * Nobody could leave. A player who closed the tab still counted as
--     needing every position, so the auction kept offering players for slots
--     that would never be filled and the game could not finish.
--   * The host could not remove someone who had wandered off, for the same
--     reason.
--   * Only the host could advance, so everyone else waited on one person
--     between rounds. Now the round starts when everybody says they are ready.
--
-- Safe to re-run.
-- ============================================================

alter table public.room_participants
  add column if not exists is_ready boolean not null default false;

-- ---------- leaving ----------

create or replace function public.leave_room(p_room uuid, p_client_token text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_participant public.room_participants%rowtype;
  v_room        public.rooms%rowtype;
  v_heir        uuid;
  v_left        int;
begin
  select * into v_room from public.rooms where id = p_room for update;
  if not found then
    return jsonb_build_object('error', 'room_not_found');
  end if;

  select * into v_participant
  from public.room_participants
  where room_id = p_room and client_token = p_client_token;

  if not found then
    return jsonb_build_object('error', 'not_a_participant');
  end if;

  -- Never leave a live round pointing at someone who is gone.
  update public.auction_rounds
  set current_bid = 0, current_bid_by = null
  where room_id = p_room and status = 'active' and current_bid_by = v_participant.id;

  delete from public.room_participants where id = v_participant.id;

  select count(*) into v_left from public.room_participants where room_id = p_room;

  if v_left = 0 then
    update public.rooms set status = 'finished' where id = p_room;
    return jsonb_build_object('left', true, 'room_closed', true);
  end if;

  -- The host walking out must not lock the room: hand the badge on.
  if v_participant.is_host then
    select id into v_heir
    from public.room_participants
    where room_id = p_room
    order by created_at
    limit 1;

    update public.room_participants set is_host = true where id = v_heir;
  end if;

  return jsonb_build_object('left', true, 'new_host', v_heir);
end;
$$;

-- ---------- kicking ----------

create or replace function public.kick_participant(
  p_room uuid,
  p_host_token text,
  p_target uuid
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_target public.room_participants%rowtype;
begin
  if not exists (
    select 1 from public.rooms where id = p_room and host_token = p_host_token
  ) then
    return jsonb_build_object('error', 'not_host');
  end if;

  select * into v_target
  from public.room_participants
  where id = p_target and room_id = p_room;

  if not found then
    return jsonb_build_object('error', 'target_not_found');
  end if;

  if v_target.is_host then
    return jsonb_build_object('error', 'cannot_kick_host');
  end if;

  update public.auction_rounds
  set current_bid = 0, current_bid_by = null
  where room_id = p_room and status = 'active' and current_bid_by = v_target.id;

  delete from public.room_participants where id = v_target.id;

  return jsonb_build_object('kicked', true, 'display_name', v_target.display_name);
end;
$$;

-- ---------- starting by agreement ----------

create or replace function public.mark_ready(p_room uuid, p_client_token text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_participant public.room_participants%rowtype;
  v_room        public.rooms%rowtype;
  v_total       int;
  v_ready       int;
begin
  select * into v_room from public.rooms where id = p_room for update;
  if not found then
    return jsonb_build_object('error', 'room_not_found');
  end if;

  if exists (
    select 1 from public.auction_rounds
    where room_id = p_room and status = 'active' and ends_at > now()
  ) then
    return jsonb_build_object('error', 'round_in_progress');
  end if;

  select * into v_participant
  from public.room_participants
  where room_id = p_room and client_token = p_client_token;

  if not found then
    return jsonb_build_object('error', 'not_a_participant');
  end if;

  update public.room_participants set is_ready = true where id = v_participant.id;

  select count(*), count(*) filter (where is_ready)
  into v_total, v_ready
  from public.room_participants
  where room_id = p_room;

  if v_ready < v_total then
    return jsonb_build_object('ready', v_ready, 'total', v_total, 'started', false);
  end if;

  -- Everyone agreed. Start on their behalf rather than making them wait for
  -- the host to press a button they already voted for.
  return public.next_round(p_room, v_room.host_token)
    || jsonb_build_object('started', true, 'ready', v_ready, 'total', v_total);
end;
$$;

-- A new round clears the votes for the next one.
create or replace function public.clear_ready_on_round()
returns trigger
language plpgsql
as $$
begin
  update public.room_participants set is_ready = false where room_id = new.room_id;
  return new;
end;
$$;

drop trigger if exists clear_ready_on_new_round on public.auction_rounds;
create trigger clear_ready_on_new_round
  after insert on public.auction_rounds
  for each row execute function public.clear_ready_on_round();
