-- ============================================================
-- 0046: Un interruptor para las leyendas
--
-- Recién ahora que las leyendas entran de verdad al pool se ve el problema de
-- fondo: su fama está fijada a mano en un número enorme, porque no hay de
-- dónde medirla, y eso las pone al tope de cada puesto. En "más famosos", que
-- son veinte por puesto, terminaban siendo el 70% de las rondas de delanteros.
--
-- Son parte del juego, no un modo aparte, así que quedan encendidas por
-- defecto. Pero quien arma la sala puede apagarlas y jugar sólo con
-- futbolistas en actividad.
--
-- Se puede volver a correr.
-- ============================================================

alter table public.rooms
  add column if not exists include_legends boolean not null default true;

-- ---------- la ronda respeta el interruptor ----------

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
  v_era       text;
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
        -- Las leyendas tienen la fama fijada a mano y bien alta, así que sin
        -- este filtro se comen la mayoría del pool de "más famosos".
        and (v_room.include_legends or not coalesce(pl.rating_is_peak, false))
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
          -- Se sortea primero la época y después el año dentro de ella, no un
          -- año suelto de toda la carrera. Sorteando el año, Prime se llevaba
          -- casi el doble que las otras por ser la ventana más ancha, y las
          -- tres tenían que pesar lo mismo para que la apuesta sea la apuesta.
          select era, low, high into v_era, v_first, v_last
          from public.player_eras(v_birth)
          order by random()
          limit 1;

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
          coalesce(v_era, public.era_label(v_age)),
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

  -- Se archiva acá y no sólo en la revancha. El ranking se calcula sobre
  -- finished_games, y la mayoría de las partidas terminan y nadie vuelve a
  -- jugar: si esperáramos a la revancha, esas no aparecerían nunca.
  perform public.archive_game(p_room);

  return jsonb_build_object('finished', true);
end;
$$;

-- ---------- la revancha también lo puede cambiar ----------

create or replace function public.rematch(
  p_room uuid,
  p_host_token text,
  p_starting_budget integer default null,
  p_round_seconds integer default null,
  p_gender_filter text default null,
  p_pool text default null,
  p_auction_mode text default null,
  p_include_legends boolean default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_room public.rooms%rowtype;
begin
  select * into v_room from public.rooms where id = p_room for update;
  if not found then
    return jsonb_build_object('error', 'room_not_found');
  end if;

  if v_room.host_token is distinct from p_host_token then
    return jsonb_build_object('error', 'not_host');
  end if;

  -- Primero el archivo: en cuanto se borren los fichajes, el resultado de la
  -- partida anterior deja de existir.
  perform public.archive_game(p_room);

  delete from public.team_players where room_id = p_room;
  delete from public.power_effects where room_id = p_room;
  delete from public.position_passes
    where participant_id in (select id from public.room_participants where room_id = p_room);
  delete from public.auction_rounds where room_id = p_room;

  update public.rooms
  set status           = 'lobby',
      round_number     = 0,
      current_position = null,
      starting_budget  = coalesce(p_starting_budget, starting_budget),
      round_seconds    = coalesce(p_round_seconds, round_seconds),
      gender_filter    = coalesce(p_gender_filter, gender_filter),
      pool             = coalesce(p_pool, pool),
      auction_mode     = coalesce(p_auction_mode, auction_mode),
      include_legends  = coalesce(p_include_legends, include_legends)
  where id = p_room
  returning * into v_room;

  update public.room_participants
  set remaining_budget = v_room.starting_budget,
      passes_used      = 0,
      is_ready         = false
  where room_id = p_room;

  return jsonb_build_object('room', to_jsonb(v_room), 'rematch', true);
end;
$$;
