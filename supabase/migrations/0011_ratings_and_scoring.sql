-- ============================================================
-- 0011: Career-era ratings and a scored winner
--
-- Recognising the silhouette is no longer the whole game: each round also
-- auctions a random moment of that player's career. Mbappé at 18 is not
-- Mbappé at 26, and you only learn which one you bought at the reveal.
-- Whoever ends with the most rating points wins.
--
-- EA's public ratings feed supplies the present-day overall and the six
-- headline stats. The era adjustment on top of it is ours, not EA data.
-- Safe to re-run.
-- ============================================================

alter table public.players
  add column if not exists ea_overall    integer,
  add column if not exists ea_pace       integer,
  add column if not exists ea_shooting   integer,
  add column if not exists ea_passing    integer,
  add column if not exists ea_dribbling  integer,
  add column if not exists ea_defending  integer,
  add column if not exists ea_physical   integer,
  add column if not exists ea_card_url   text,
  add column if not exists prime_rating  integer;

alter table public.auction_rounds
  add column if not exists season_year integer,
  add column if not exists era_rating  integer,
  add column if not exists era_label   text;

alter table public.team_players
  add column if not exists rating      integer,
  add column if not exists season_year integer,
  add column if not exists era_label   text;

-- ---------- era model ----------

-- Footballers climb to a plateau in their mid-twenties and taper afterwards.
-- Returns the delta to apply to a player's peak rating at a given age.
create or replace function public.age_curve(p_age integer)
returns integer language sql immutable as $$
  select case
    when p_age is null then 0
    when p_age < 18 then -16
    when p_age < 20 then -12
    when p_age < 22 then  -8
    when p_age < 24 then  -4
    when p_age < 26 then  -1
    when p_age <= 30 then  0
    when p_age <= 32 then -2
    when p_age <= 34 then -5
    else -9
  end;
$$;

create or replace function public.era_label(p_age integer)
returns text language sql immutable as $$
  select case
    when p_age is null then 'Carrera'
    when p_age < 21 then 'Promesa'
    when p_age < 24 then 'En ascenso'
    when p_age <= 30 then 'Prime'
    when p_age <= 33 then 'Veterano'
    else 'Último tramo'
  end;
$$;

-- Peak rating: what the player is (or was) worth at their best.
-- EA reports today's overall, so a young or fading player is scaled back up.
create or replace function public.peak_rating(p_player public.players)
returns integer language sql stable as $$
  select greatest(40, least(99, coalesce(
    p_player.prime_rating,
    p_player.ea_overall - public.age_curve(
      extract(year from age(p_player.birth_date))::int
    ),
    70
  )));
$$;

-- ---------- round selection with a random career moment ----------

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
        and not exists (
          select 1 from public.auction_rounds ar
          where ar.room_id = p_room and ar.player_id = pl.id
        )
      order by (pl.silhouette_source = 'render') desc, random()
      limit 1;

      if v_player.id is not null then
        -- Pick a season somewhere in the player's career.
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

-- ---------- finalize snapshots the rating that was won ----------

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
    -- Store the era rating on the signing so later rating edits cannot
    -- retroactively change a finished auction.
    insert into public.team_players (
      room_id, participant_id, player_id, purchase_price,
      rating, season_year, era_label
    )
    values (
      v_round.room_id, v_round.current_bid_by, v_round.player_id, v_round.current_bid,
      v_round.era_rating, v_round.season_year, v_round.era_label
    )
    on conflict (room_id, participant_id, player_id) do nothing;

    update public.room_participants
    set remaining_budget = greatest(0, remaining_budget - v_round.current_bid)
    where id = v_round.current_bid_by;
  end if;

  return jsonb_build_object('round', to_jsonb(v_round));
end;
$$;

-- ---------- standings ----------

create or replace view public.room_standings as
select
  rp.room_id,
  rp.id                                        as participant_id,
  rp.display_name,
  count(tp.id)                                 as signings,
  coalesce(sum(tp.rating), 0)                  as points,
  coalesce(sum(tp.purchase_price), 0)          as spent,
  rp.remaining_budget
from public.room_participants rp
left join public.team_players tp on tp.participant_id = rp.id
group by rp.id;

grant select on public.room_standings to anon, authenticated;
