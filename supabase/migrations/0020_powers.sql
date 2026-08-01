-- ============================================================
-- 0020: Sabotage powers
--
-- A player spends budget to hamper a rival on the next round. The cost comes
-- out of the same pot used to buy players, so every power is a real trade-off
-- rather than free harassment.
--
-- Effects are per-viewer: two people looking at the same round can legitimately
-- see different silhouettes. That has to be resolved on the server — a client
-- that receives the true silhouette and hides it is one devtools panel away
-- from being useless.
-- Safe to re-run.
-- ============================================================

create table if not exists public.power_effects (
  id              uuid primary key default uuid_generate_v4(),
  room_id         uuid not null references public.rooms(id) on delete cascade,
  caster_id       uuid not null references public.room_participants(id) on delete cascade,
  target_id       uuid not null references public.room_participants(id) on delete cascade,
  power           text not null,
  cost            integer not null,
  round_id        uuid references public.auction_rounds(id) on delete cascade,
  decoy_player_id uuid references public.players(id),
  status          text not null default 'pending',
  created_at      timestamp with time zone default now()
);

alter table public.power_effects drop constraint if exists power_effects_power_check;
alter table public.power_effects
  add constraint power_effects_power_check
  check (power in ('niebla', 'apagon', 'espejismo', 'impuesto', 'traba', 'manotazo'));

alter table public.power_effects drop constraint if exists power_effects_status_check;
alter table public.power_effects
  add constraint power_effects_status_check
  check (status in ('pending', 'active', 'consumed'));

create index if not exists idx_power_effects_target on public.power_effects (target_id, status);
create index if not exists idx_power_effects_round on public.power_effects (round_id, status);

alter table public.power_effects enable row level security;

-- Readable so the UI can show what is in play; the interesting column
-- (decoy_player_id) is never sent to the affected player by the API.
grant select (id, room_id, caster_id, target_id, power, cost, round_id, status, created_at)
  on public.power_effects to anon, authenticated;

drop policy if exists "Power effects readable within their room" on public.power_effects;
create policy "Power effects readable within their room"
  on public.power_effects for select using (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'power_effects'
  ) then
    alter publication supabase_realtime add table public.power_effects;
  end if;
end $$;

alter table public.power_effects replica identity full;

-- ---------- catalogue ----------
-- Cost tracks how much the power hurts: hiding information is cheap, lying
-- about it is dear, and taking money is dearest.

create or replace function public.power_cost(p_power text)
returns integer language sql immutable as $$
  select case p_power
    when 'niebla'    then 10  -- silueta borrosa
    when 'manotazo'  then 12  -- le quema el pase
    when 'traba'     then 15  -- no puede pujar en la primera mitad
    when 'apagon'    then 18  -- sin silueta
    when 'espejismo' then 28  -- ve la silueta de otro jugador
    when 'impuesto'  then 30  -- su próxima compra le cuesta el doble
    else null
  end;
$$;

-- ---------- casting ----------

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
  where id = p_target and room_id = p_room;

  if not found then
    return jsonb_build_object('error', 'target_not_found');
  end if;

  if v_caster.remaining_budget < v_cost then
    return jsonb_build_object('error', 'insufficient_budget');
  end if;

  -- One pending power per victim at a time, so a rich player cannot stack
  -- every effect onto one rival and remove them from the game.
  if exists (
    select 1 from public.power_effects
    where target_id = p_target and status = 'pending'
  ) then
    return jsonb_build_object('error', 'target_already_hexed');
  end if;

  update public.room_participants
  set remaining_budget = remaining_budget - v_cost
  where id = v_caster.id;

  insert into public.power_effects (room_id, caster_id, target_id, power, cost)
  values (p_room, v_caster.id, p_target, p_power, v_cost)
  returning * into v_effect;

  return jsonb_build_object('effect', to_jsonb(v_effect));
end;
$$;

-- ---------- helpers used by the round flow ----------

create or replace function public.active_power(p_participant uuid, p_round uuid)
returns text language sql stable as $$
  select power from public.power_effects
  where target_id = p_participant and round_id = p_round and status = 'active'
  limit 1;
$$;
