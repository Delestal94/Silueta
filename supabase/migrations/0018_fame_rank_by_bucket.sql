-- ============================================================
-- 0018: Rank fame inside each gender + position bucket
--
-- A single global pageviews threshold does not work:
--
--   * women's players draw far fewer views than men's (Mary Earps 378k vs
--     Mbappé 6.2M), so one cutoff would empty the women's pool entirely;
--   * goalkeepers are less looked-up than forwards in every league, so a
--     global cutoff would leave rooms unable to fill their GK slot.
--
-- Ranking within (gender, position) keeps every bucket populated while still
-- picking the most recognisable players in each.
-- Safe to re-run.
-- ============================================================

alter table public.players
  add column if not exists fame_rank integer;

create index if not exists idx_players_fame_rank on public.players (fame_rank);

-- How deep into each bucket the "famous" pool reaches.
create or replace function public.famous_depth()
returns integer language sql immutable as $$ select 20; $$;

create or replace function public.refresh_fame_ranks()
returns void
language sql
as $$
  with ranked as (
    select
      id,
      row_number() over (
        partition by gender, position_type
        order by coalesce(fame_score, 0) desc, ea_rank asc
      ) as rn
    from public.players
    where ea_id is not null and notable
  )
  update public.players p
  set fame_rank = ranked.rn
  from ranked
  where ranked.id = p.id;
$$;

select public.refresh_fame_ranks();

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
        and (
          v_room.pool = 'all'
          or (pl.fame_rank is not null and pl.fame_rank <= public.famous_depth())
        )
        and not exists (
          select 1 from public.auction_rounds ar
          where ar.room_id = p_room and ar.player_id = pl.id
        )
      -- Random inside the pool: the filter already guarantees they are known,
      -- and this keeps games from repeating the same faces.
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
