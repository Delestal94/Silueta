-- ============================================================
-- 0051: Catálogo equilibrado, y reponer el filtro de leyendas
--
-- Un tercer catálogo entre "más famosos" y "todos": mitad y mitad. Cada ronda
-- tira una moneda y saca al jugador de los famosos o del resto.
--
-- Es una moneda por ronda y no un filtro más ancho a propósito. Mezclar los dos
-- conjuntos en una sola consulta no equilibra nada: los famosos son doscientos
-- contra miles, así que el azar caería casi siempre del lado de los
-- desconocidos y el resultado sería indistinguible de "todos".
--
-- De paso repara algo que rompí yo: 0050 redefinió next_round partiendo de la
-- versión de 0044, que es anterior a 0046, y en el camino se llevó puesto el
-- filtro de include_legends. El checkbox de leyendas quedó sin efecto desde
-- entonces. Es el mismo error que ya pasó con 0018 y con 0031 — redefinir una
-- función a partir de una copia vieja en lugar de la última.
--
-- Se puede volver a correr.
-- ============================================================

alter table public.rooms drop constraint if exists rooms_pool_check;
alter table public.rooms
  add constraint rooms_pool_check check (pool in ('famous', 'all', 'balanced'));

/**
 * Si un jugador entra en el pool de los reconocibles.
 *
 * Existe para que la regla viva en un solo lugar: estaba escrita a mano en
 * cada consulta que la necesitaba, y el modo equilibrado la necesita tres
 * veces más.
 */
create or replace function public.es_famoso(p_rank integer)
returns boolean language sql immutable as $$
  select p_rank is not null and p_rank <= public.famous_depth();
$$;

-- ---------- la ronda, con las tres reglas juntas ----------

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
  v_victima   public.room_participants%rowtype;
  v_forzada   integer;
  v_del_pool  boolean;
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
      -- Una moneda por ronda, no por jugador. Mezclar los dos conjuntos en una
      -- sola consulta no serviría: los famosos son doscientos contra miles, y
      -- el azar caería casi siempre del lado de los desconocidos.
      v_del_pool := random() < 0.5;

      select pl.* into v_player
      from public.players pl
      where pl.position_type = v_pos
        and pl.notable
        and pl.silhouette_url is not null
        and (v_room.gender_filter = 'any' or pl.gender = v_room.gender_filter)
        and (
          v_room.pool = 'all'
          or (v_room.pool = 'famous' and public.es_famoso(pl.fame_rank))
          -- Equilibrado: la moneda de arriba decide de qué mitad sale.
          or (v_room.pool = 'balanced' and public.es_famoso(pl.fame_rank) = v_del_pool)
        )
        -- Las leyendas tienen la fama fijada a mano y bien alta, así que sin
        -- este filtro se comen la mayor parte del pool de "más famosos".
        and (v_room.include_legends or not coalesce(pl.rating_is_peak, false))
        and not exists (
          select 1 from public.auction_rounds ar
          where ar.room_id = p_room and ar.player_id = pl.id
        )
      order by random()
      limit 1;

      -- Si esa mitad se quedó sin jugadores sin usar, se cae a la otra: sin
      -- esto el puesto se saltearía entero por culpa de la moneda.
      if v_player.id is null and v_room.pool = 'balanced' then
        select pl.* into v_player
        from public.players pl
        where pl.position_type = v_pos
          and pl.notable
          and pl.silhouette_url is not null
          and (v_room.gender_filter = 'any' or pl.gender = v_room.gender_filter)
          and public.es_famoso(pl.fame_rank) <> v_del_pool
          and (v_room.include_legends or not coalesce(pl.rating_is_peak, false))
          and not exists (
            select 1 from public.auction_rounds ar
            where ar.room_id = p_room and ar.player_id = pl.id
          )
        order by random()
        limit 1;
      end if;

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
            -- El empujón no depende de ver la silueta, así que también corre
            -- en una ronda a ciegas.
            and (not v_mystery or power in ('impuesto', 'traba', 'empujon'))
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

          -- El empujón se resuelve al instante: la víctima entra a la ronda ya
          -- habiendo puesto, sin haber decidido nada.
          if v_effect.power = 'empujon' then
            select * into v_victima
            from public.room_participants where id = v_effect.target_id;

            -- Si ya completó el puesto no participa de esta ronda, así que no
            -- hay nada que forzar ni nada que cobrarle.
            if found and public.slots_remaining(v_victima.id, v_pos) > 0 then
              -- Lo que no llega, se pone entero: el poder obliga a jugarse, no
              -- a tener el dinero.
              v_forzada := least(public.forced_bid_amount(), v_victima.remaining_budget);

              if v_forzada >= 1 then
                if v_room.auction_mode = 'sealed' then
                  insert into public.bids (round_id, participant_id, amount, sealed)
                  values (v_round.id, v_victima.id, v_forzada, true)
                  on conflict (round_id, participant_id) where sealed
                  do update set amount = excluded.amount;
                else
                  insert into public.bids (round_id, participant_id, amount)
                  values (v_round.id, v_victima.id, v_forzada);

                  -- Sin tocar ends_at: la ronda recién arranca, y reiniciar el
                  -- reloj acá sólo le regalaría tiempo a la mesa.
                  update public.auction_rounds
                  set current_bid = v_forzada, current_bid_by = v_victima.id
                  where id = v_round.id
                  returning * into v_round;
                end if;
              end if;
            end if;
          end if;
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
