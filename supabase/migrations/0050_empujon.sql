-- ============================================================
-- 0050: Empujón — obligar a otro a poner
--
-- Los poderes que había o le sacaban información a la víctima (apagón,
-- espejismo, soplo) o le encarecían jugar (impuesto, traba, manotazo). Ninguno
-- la obligaba a gastar.
--
-- El empujón pone por ella: apenas arranca la ronda siguiente, la víctima
-- aparece habiendo ofertado 25 sin haber decidido nada. Si no le alcanza, pone
-- todo lo que tiene — el poder obliga a jugarse, no a tener el dinero.
--
-- Cuesta 20, así que no es gratis empujar a alguien contra un jugador que
-- después le sirve.
--
-- Se puede volver a correr.
-- ============================================================

create or replace function public.forced_bid_amount()
returns integer language sql immutable as $$ select 25; $$;

create or replace function public.power_cost(p_power text)
returns integer language sql immutable as $$
  select case p_power
    when 'soplo'     then 10  -- te muestra nacionalidad y club, sólo a vos
    when 'manotazo'  then  8  -- le quema el pase
    when 'traba'     then 10  -- no puede pujar en la primera mitad
    when 'apagon'    then 12  -- sin silueta
    when 'espejismo' then 18  -- ve la silueta de otro jugador
    when 'impuesto'  then 20  -- su próxima compra le cuesta el doble
    when 'empujon'   then 20  -- oferta 25 por él, quiera o no
    else null
  end;
$$;

-- 0054 agrega 'escudo' y 'reversa' a esta misma restricción. Si ya se pasó de
-- acá, reponer la lista vieja falla contra filas que hoy son válidas.
do $$
begin
  if not exists (select 1 from public.power_effects where power in ('escudo', 'reversa')) then
    alter table public.power_effects drop constraint if exists power_effects_power_check;
    alter table public.power_effects
      add constraint power_effects_power_check
      check (power in ('soplo', 'apagon', 'espejismo', 'impuesto', 'traba', 'manotazo', 'empujon'));
  end if;
end $$;

-- ---------- la ronda ejecuta la oferta forzada ----------

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
