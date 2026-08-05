-- ============================================================
-- 0016: Room settings (gender / pool) and squad snapshots
--
-- Two things:
--
-- 1. A squad used to be counted by joining players.position_type live, so
--    re-classifying a player in the catalog retroactively rewrote finished
--    signings — a keeper fix mid-game turned two bought defenders into
--    goalkeepers and left the room stuck at ARQ 2/1, DEF 0/2. The position is
--    now frozen onto the signing, like the rating already was.
--
-- 2. Rooms can pick which slice of the catalog they play with.
--
-- Safe to re-run.
-- ============================================================

alter table public.players
  add column if not exists gender text;

alter table public.players drop constraint if exists players_gender_check;
alter table public.players
  add constraint players_gender_check
  check (gender is null or gender in ('men', 'women'));

alter table public.team_players
  add column if not exists position_type text;

-- Backfill existing signings from the catalog as it stands today.
update public.team_players tp
set position_type = pl.position_type
from public.players pl
where pl.id = tp.player_id and tp.position_type is null;

alter table public.rooms
  add column if not exists gender_filter text not null default 'any',
  add column if not exists pool          text not null default 'famous';

alter table public.rooms drop constraint if exists rooms_gender_filter_check;
alter table public.rooms
  add constraint rooms_gender_filter_check
  check (gender_filter in ('men', 'women', 'any'));

-- 0051 agrega 'balanced' a esta misma restricción. En una base que ya pasó por
-- ahí, reponer la lista vieja falla contra salas que hoy son válidas — y como
-- el lote se corre entero cada vez, esa falla salía en cada corrida.
do $$
begin
  if not exists (select 1 from public.rooms where pool = 'balanced') then
    alter table public.rooms drop constraint if exists rooms_pool_check;
    alter table public.rooms
      add constraint rooms_pool_check check (pool in ('famous', 'all'));
  end if;
end $$;

grant select (
  id, code, status, starting_budget, round_number,
  current_position, round_seconds, requirements, created_at,
  gender_filter, pool
) on public.rooms to anon, authenticated;

-- Top-of-the-ranking cutoff for the "famous" pool.
create or replace function public.famous_cutoff()
returns integer language sql immutable as $$ select 150; $$;

-- ---------- squad counting off the frozen position ----------

create or replace function public.slots_remaining(p_participant uuid, p_position text)
returns integer language sql stable as $$
  select greatest(
    0,
    coalesce((r.requirements ->> p_position)::int, 0) - (
      select count(*)
      from public.team_players tp
      where tp.participant_id = p_participant
        and coalesce(
              tp.position_type,
              (select pl.position_type from public.players pl where pl.id = tp.player_id)
            ) = p_position
    )
  )
  from public.room_participants rp
  join public.rooms r on r.id = rp.room_id
  where rp.id = p_participant;
$$;

-- ---------- round selection honouring the room's filters ----------

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
        and (v_room.pool = 'all' or pl.ea_rank <= public.famous_cutoff())
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

        return jsonb_build_object('round', to_jsonb(v_round));
      end if;
    end if;
  end loop;

  update public.rooms set status = 'finished' where id = p_room;
  return jsonb_build_object('finished', true);
end;
$$;

-- ---------- finalize freezes the position too ----------

create or replace function public.finalize_round(p_round uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_round public.auction_rounds%rowtype;
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
    insert into public.team_players (
      room_id, participant_id, player_id, purchase_price,
      rating, season_year, era_label, position_type
    )
    values (
      v_round.room_id, v_round.current_bid_by, v_round.player_id, v_round.current_bid,
      v_round.era_rating, v_round.season_year, v_round.era_label, v_round.position_type
    )
    on conflict (room_id, participant_id, player_id) do nothing;

    update public.room_participants
    set remaining_budget = greatest(0, remaining_budget - v_round.current_bid)
    where id = v_round.current_bid_by;
  end if;

  return jsonb_build_object('round', to_jsonb(v_round));
end;
$$;
