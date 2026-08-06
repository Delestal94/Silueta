-- ============================================================
-- 0058: La ronda recién creada se devolvía vacía
--
-- next_round terminaba con un update que fija quién figura arriba cuando hay
-- ofertas forzadas, y lo condicionaba dentro del where:
--
--   where ar.id = v_round.id and ar.current_bid > 0
--   returning * into v_round;
--
-- Cuando ese where no encuentra fila, PL/pgSQL no deja la variable como
-- estaba: la llena de nulos. Y sin empujón la puja arranca en 0, así que no
-- encontraba fila en ninguna ronda normal y la función devolvía un round con
-- todos los campos en null.
--
-- Jugando no se notaba, porque el cliente vuelve a pedir el estado enseguida y
-- ahí la ronda aparece bien. Se nota desde la API, que es donde lo encontró el
-- test del pase: sin id de ronda no hay a qué pasarle.
--
-- La condición se mueve al if, que es donde se decide si hay algo que
-- actualizar.
--
-- Se puede volver a correr.
-- ============================================================

CREATE OR REPLACE FUNCTION public.next_round(p_room uuid, p_host_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
        -- Tampoco los de partidas anteriores de esta misma sala: la revancha
        -- borra auction_rounds, que es donde vivía esa memoria.
        and not exists (
          select 1 from public.room_seen_players sp
          where sp.room_id = p_room and sp.player_id = pl.id
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
          -- Tampoco los de partidas anteriores de esta misma sala: la revancha
          -- borra auction_rounds, que es donde vivía esa memoria.
          and not exists (
            select 1 from public.room_seen_players sp
            where sp.room_id = p_room and sp.player_id = pl.id
          )
        order by random()
        limit 1;
      end if;

      -- Sala muy jugada: el pool se quedó sin caras nuevas. Antes que saltear el
      -- puesto y cortar la partida, se permite repetir alguna de una partida
      -- anterior — nunca de la que se está jugando.
      if v_player.id is null then
        select pl.* into v_player
        from public.players pl
        where pl.position_type = v_pos
          and pl.notable
          and pl.silhouette_url is not null
          and (v_room.gender_filter = 'any' or pl.gender = v_room.gender_filter)
          and (
            v_room.pool = 'all'
            or (v_room.pool = 'famous' and public.es_famoso(pl.fame_rank))
            or (v_room.pool = 'balanced' and public.es_famoso(pl.fame_rank) = v_del_pool)
          )
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
                -- Sólo una oferta: la plata se cobra al ganar, como cualquier
                -- otra. Que perder también costara convertía al empujón en una
                -- multa, y la idea es obligarte a jugarte, no a pagar.
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
                  set current_bid = v_forzada
                  where id = v_round.id
                  returning * into v_round;
                end if;
              end if;
            end if;
          end if;
        end loop;

        -- Quién figura arriba con las ofertas forzadas. Con una sola, esa
        -- persona; con varias están empatadas y no hay líder que mostrar —
        -- antes ganaba la última que Postgres devolviera del bucle, que es un
        -- orden sin garantía y terminaba siendo siempre la misma.
        -- La condición de la puja va acá y no en el where: si el update no
        -- encuentra fila, "returning into" deja v_round en nulos y la ronda
        -- recién creada se devuelve vacía. Sin empujón la puja arranca en 0,
        -- así que eso pasaba en toda ronda normal.
        if v_room.auction_mode <> 'sealed' and coalesce(v_round.current_bid, 0) > 0 then
          update public.auction_rounds ar
          set current_bid_by = (
            -- array_agg y no min(): Postgres no define min() sobre uuid.
            select case when count(*) = 1 then (array_agg(b.participant_id))[1] end
            from public.bids b
            where b.round_id = ar.id and b.amount = ar.current_bid
          )
          where ar.id = v_round.id
          returning * into v_round;
        end if;

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
$function$
;
;
