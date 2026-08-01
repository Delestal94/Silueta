-- ============================================================
-- 0007: Pass = opt out of this round; if everyone who still needs
-- the position opts out, the server flips for it.
--
-- The flip must be decided server-side: if each client rolled its own
-- random number they would all disagree about who got the player.
-- Safe to re-run.
-- ============================================================

create table if not exists public.round_passes (
  round_id       uuid not null references public.auction_rounds(id) on delete cascade,
  participant_id uuid not null references public.room_participants(id) on delete cascade,
  created_at     timestamp with time zone default now(),
  primary key (round_id, participant_id)
);

alter table public.round_passes enable row level security;

grant select on public.round_passes to anon, authenticated;

drop policy if exists "Round passes readable within their room" on public.round_passes;
create policy "Round passes readable within their room"
  on public.round_passes for select using (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'round_passes'
  ) then
    alter publication supabase_realtime add table public.round_passes;
  end if;
end $$;

alter table public.round_passes replica identity full;

create or replace function public.pass_round(p_round uuid, p_client_token text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_round        public.auction_rounds%rowtype;
  v_participant  public.room_participants%rowtype;
  v_contenders   uuid[];
  v_passed       int;
  v_winner       uuid;
  v_price        int;
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

  if public.slots_remaining(v_participant.id, v_round.position_type) <= 0 then
    return jsonb_build_object('error', 'position_already_full');
  end if;

  if exists (select 1 from public.round_passes
             where round_id = p_round and participant_id = v_participant.id) then
    return jsonb_build_object('error', 'already_passed');
  end if;

  if v_participant.passes_used >= 1 then
    return jsonb_build_object('error', 'no_passes_left');
  end if;

  insert into public.round_passes (round_id, participant_id)
  values (p_round, v_participant.id);

  update public.room_participants
  set passes_used = passes_used + 1
  where id = v_participant.id;

  -- Everyone who could still use this position.
  select array_agg(rp.id) into v_contenders
  from public.room_participants rp
  where rp.room_id = v_round.room_id
    and public.slots_remaining(rp.id, v_round.position_type) > 0;

  select count(*) into v_passed
  from public.round_passes
  where round_id = p_round
    and participant_id = any(v_contenders);

  -- Someone is still bidding, or still could: let the timer run.
  if v_round.current_bid_by is not null
     or v_contenders is null
     or v_passed < array_length(v_contenders, 1) then
    return jsonb_build_object('passed', true);
  end if;

  -- Everyone opted out: flip for it and close the round immediately.
  v_winner := v_contenders[1 + floor(random() * array_length(v_contenders, 1))::int];
  v_price := 1;

  update public.auction_rounds
  set current_bid = v_price,
      current_bid_by = v_winner,
      ends_at = now()
  where id = p_round
  returning * into v_round;

  return jsonb_build_object(
    'round', to_jsonb(v_round),
    'coin_flip_winner', v_winner,
    'coin_flip', true
  );
end;
$$;
