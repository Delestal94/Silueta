-- ============================================================
-- 0055: El empujón cobra, y el empate lo decide un sorteo
--
-- Dos cambios que van juntos porque el segundo sólo aparece por culpa del
-- primero.
--
-- El empujón ahora te saca las 25 monedas al arrancar la ronda, ganes o no.
-- Antes sólo forzaba la oferta y pagaba el que ganaba, así que a un empujado
-- que perdía no le costaba nada.
--
-- Y con dos empujados la oferta queda empatada en 25. Eso lo resolvía el orden
-- en que Postgres devolvía las filas: medido seis veces seguidas, en puja
-- abierta ganaba siempre el empujado segundo, y a sobre cerrado el primero.
-- No era azar, era un accidente — y encima cada modo lo resolvía al revés.
--
-- Ahora el ganador sale de las ofertas y, si hay varias iguales, se sortea de
-- verdad. Los empatados quedan registrados para que la ruleta de la pantalla
-- muestre exactamente a quiénes se sorteó.
--
-- Se puede volver a correr.
-- ============================================================

-- Una oferta que ya se cobró al hacerse. Sin esto, al empujado que además gana
-- se le descontaría dos veces: una al ser empujado y otra al cerrar la ronda.
alter table public.bids
  add column if not exists prepaid boolean not null default false;

-- A quiénes alcanzó el sorteo. Nulo cuando no hubo empate.
alter table public.auction_rounds
  add column if not exists draw_contenders uuid[];

-- ---------- la ronda cobra el empujón y no elige ganador ----------

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
                -- La oferta forzada se cobra ya, no al ganar: el empujón te
                -- saca la plata aunque después no te lleves al jugador. Se
                -- marca como paga para que finalize_round no la cobre dos
                -- veces si además gana.
                update public.room_participants
                set remaining_budget = greatest(0, remaining_budget - v_forzada)
                where id = v_victima.id;

                if v_room.auction_mode = 'sealed' then
                  insert into public.bids (round_id, participant_id, amount, sealed, prepaid)
                  values (v_round.id, v_victima.id, v_forzada, true, true)
                  on conflict (round_id, participant_id) where sealed
                  do update set amount = excluded.amount, prepaid = true;
                else
                  insert into public.bids (round_id, participant_id, amount, prepaid)
                  values (v_round.id, v_victima.id, v_forzada, true);

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
        if v_room.auction_mode <> 'sealed' then
          update public.auction_rounds ar
          set current_bid_by = (
            -- array_agg y no min(): Postgres no define min() sobre uuid.
            select case when count(*) = 1 then (array_agg(b.participant_id))[1] end
            from public.bids b
            where b.round_id = ar.id and b.amount = ar.current_bid
          )
          where ar.id = v_round.id and ar.current_bid > 0
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

-- ---------- el cierre sortea entre los que empataron ----------

CREATE OR REPLACE FUNCTION public.finalize_round(p_round uuid, p_host_token text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_round      public.auction_rounds%rowtype;
  v_power      text;
  v_paid       integer;
  v_contenders uuid[];
  v_raffled    boolean := false;
  v_ms_left    integer;
  v_is_host    boolean := false;
  v_mode       text;
  v_best       public.bids%rowtype;
  v_empatados  uuid[];
  v_tope       integer;
  v_prepago    boolean := false;
  v_sorteado   boolean := false;
begin
  select * into v_round from public.auction_rounds where id = p_round for update;

  if not found then
    return jsonb_build_object('error', 'round_not_found');
  end if;

  if v_round.status <> 'active' then
    return jsonb_build_object('round', to_jsonb(v_round), 'already_final', true);
  end if;

  if p_host_token is not null then
    select exists (
      select 1 from public.rooms where id = v_round.room_id and host_token = p_host_token
    ) into v_is_host;
  end if;

  if v_round.ends_at > now() and not v_is_host then
    v_ms_left := ceil(extract(epoch from (v_round.ends_at - now())) * 1000)::int;
    return jsonb_build_object('error', 'round_still_open', 'ms_left', v_ms_left);
  end if;

  select auction_mode into v_mode from public.rooms where id = v_round.room_id;

  -- Se abren los sobres: gana el monto más alto y, si empatan, el que llegó
  -- primero.
  -- Quién ganó sale de las ofertas, no de current_bid_by: con varias iguales
  -- —dos empujados, por ejemplo— hay empate de verdad y lo tiene que resolver
  -- un sorteo. Antes lo decidía el orden de inserción, que no es azar sino un
  -- accidente: en puja abierta ganaba siempre el empujado segundo.
  select max(amount) into v_tope
  from public.bids
  where round_id = p_round and (v_mode <> 'sealed' or sealed);

  if v_tope is not null and v_tope > 0 then
    select array_agg(participant_id) into v_empatados
    from public.bids
    where round_id = p_round and amount = v_tope and (v_mode <> 'sealed' or sealed);

    v_sorteado := array_length(v_empatados, 1) > 1;

    update public.auction_rounds
    set current_bid = v_tope,
        current_bid_by = v_empatados[1 + floor(random() * array_length(v_empatados, 1))::int],
        draw_contenders = case when v_sorteado then v_empatados end
    where id = p_round
    returning * into v_round;
  end if;

  update public.auction_rounds
  set status = case when current_bid_by is null then 'unsold' else 'sold' end
  where id = p_round and status = 'active'
  returning * into v_round;

  if not found then
    select * into v_round from public.auction_rounds where id = p_round;
    return jsonb_build_object('round', to_jsonb(v_round), 'already_final', true);
  end if;

  -- Nadie puso nada. Se sortea entre los que todavía necesitan el puesto, al
  -- precio mínimo: quedarse quieto no es una forma de saltear la ronda, y con
  -- el piso en 1 tampoco salía casi gratis.
  if v_round.current_bid_by is null then
    -- Quien pasó en esta ronda queda afuera del sorteo: para eso gastó el
    -- pase. Si pasaron todos no queda a quién sortear, así que ahí vuelven a
    -- entrar todos — alguien se lo tiene que llevar.
    select array_agg(rp.id) into v_contenders
    from public.room_participants rp
    where rp.room_id = v_round.room_id
      and public.slots_remaining(rp.id, v_round.position_type) > 0
      and not exists (
        select 1 from public.position_passes pp
        where pp.participant_id = rp.id and pp.round_id = p_round
      );

    if v_contenders is null or array_length(v_contenders, 1) = 0 then
      select array_agg(rp.id) into v_contenders
      from public.room_participants rp
      where rp.room_id = v_round.room_id
        and public.slots_remaining(rp.id, v_round.position_type) > 0;
    end if;

    if v_contenders is not null and array_length(v_contenders, 1) >= 1 then
      v_raffled := true;
      update public.auction_rounds
      set status = 'sold',
          current_bid = public.raffle_price(),
          current_bid_by = v_contenders[1 + floor(random() * array_length(v_contenders, 1))::int]
      where id = p_round
      returning * into v_round;
    end if;
  end if;

  if v_round.current_bid_by is not null and coalesce(v_round.current_bid, 0) > 0 then
    v_power := public.active_power(v_round.current_bid_by, p_round);
    v_paid := case when v_power = 'impuesto' then v_round.current_bid * 2 else v_round.current_bid end;

    insert into public.team_players (
      room_id, participant_id, player_id, purchase_price,
      rating, season_year, era_label, position_type
    )
    values (
      v_round.room_id, v_round.current_bid_by, v_round.player_id, v_paid,
      v_round.era_rating, v_round.season_year, v_round.era_label, v_round.position_type
    )
    on conflict (room_id, participant_id, player_id) do nothing;

    -- La oferta forzada del empujón ya se cobró al arrancar la ronda. Cobrarla
    -- otra vez acá le sacaría el doble al que además la ganó.
    select coalesce(bool_or(prepaid), false) into v_prepago
    from public.bids
    where round_id = p_round
      and participant_id = v_round.current_bid_by
      and amount = v_round.current_bid;

    if not v_prepago then
      update public.room_participants
      set remaining_budget = greatest(0, remaining_budget - v_paid)
      where id = v_round.current_bid_by;
    end if;
  end if;

  update public.power_effects
  set status = 'consumed'
  where round_id = p_round and status = 'active';

  return jsonb_build_object('round', to_jsonb(v_round), 'raffled', v_raffled);
end;
$function$
;

-- ---------- el estado publica a quiénes se sorteó ----------

CREATE OR REPLACE FUNCTION public.room_state(p_code text, p_client_token text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_room     public.rooms%rowtype;
  v_round    public.auction_rounds%rowtype;
  v_me       public.room_participants%rowtype;
  v_revealed boolean;
  v_hex      public.power_effects%rowtype;
  v_tip      boolean := false;
  v_shown    uuid;
  v_player   jsonb;
  v_envelope jsonb;
  v_hidden   boolean;
  v_sealed   jsonb;
  v_mine     integer;
  v_count    integer := 0;
  v_rivals   integer := 0;
begin
  select * into v_room from public.rooms where code = upper(p_code);
  if not found then
    return jsonb_build_object('error', 'room_not_found');
  end if;

  perform public.settle_expired(v_room.id);
  select * into v_room from public.rooms where id = v_room.id;

  select * into v_round
  from public.auction_rounds
  where room_id = v_room.id
  order by created_at desc
  limit 1;

  if p_client_token is not null then
    select * into v_me
    from public.room_participants
    where room_id = v_room.id and client_token = p_client_token;
  end if;

  if v_round.id is not null then
    v_revealed := v_round.status <> 'active';

    -- A sobre cerrado. Mientras la ronda vive sólo pueden viajar dos cosas: el
    -- propio sobre y cuánta gente ya puso el suyo. El monto ajeno se manda
    -- recién al abrirlos — si saliera antes, alcanzaría con mirar la pestaña
    -- de red para ganar siempre por uno.
    if v_room.auction_mode = 'sealed' then
      select count(*) into v_count from public.bids b where b.round_id = v_round.id and b.sealed;

      select count(*) into v_rivals
      from public.room_participants rp
      where rp.room_id = v_room.id
        and public.slots_remaining(rp.id, v_round.position_type) > 0;

      if v_me.id is not null then
        select amount into v_mine
        from public.bids
        where round_id = v_round.id and participant_id = v_me.id and sealed;
      end if;

      if v_revealed then
        select coalesce(jsonb_agg(jsonb_build_object(
          'participant_id', b.participant_id,
          'display_name', rp.display_name,
          'amount', b.amount
        ) order by b.amount desc, b.created_at asc), '[]'::jsonb)
        into v_sealed
        from public.bids b
        join public.room_participants rp on rp.id = b.participant_id
        where b.round_id = v_round.id and b.sealed;
      end if;
    end if;

    if v_me.id is not null then
      select * into v_hex
      from public.power_effects
      where target_id = v_me.id
        and round_id = v_round.id
        and status in ('active', 'consumed')
        and power <> 'soplo'
      limit 1;

      v_tip := exists (
        select 1 from public.power_effects
        where target_id = v_me.id and round_id = v_round.id and power = 'soplo'
      );
    end if;

    -- "espejismo" swaps the figure for another player of the same position.
    v_shown := case
      when not v_revealed and v_hex.power = 'espejismo' and v_hex.decoy_player_id is not null
        then v_hex.decoy_player_id
      else v_round.player_id
    end;

    -- A mystery round hides the silhouette from everyone; "apagon" from one.
    v_hidden := not v_revealed and (v_round.mystery or v_hex.power = 'apagon');

    select case
      when v_revealed then jsonb_build_object(
        'id', p.id, 'name', p.name, 'team', p.team, 'league', p.league,
        'position', p.position, 'position_type', p.position_type,
        'nationality', p.nationality, 'birth_date', p.birth_date,
        'shirt_number', p.shirt_number, 'height', p.height, 'weight', p.weight,
        'foot', p.foot, 'description', p.description, 'photo_url', p.photo_url,
        'silhouette_url', p.silhouette_url, 'colour_url', p.colour_url,
        'ea_overall', p.ea_overall, 'ea_pace', p.ea_pace, 'ea_shooting', p.ea_shooting,
        'ea_passing', p.ea_passing, 'ea_dribbling', p.ea_dribbling,
        'ea_defending', p.ea_defending, 'ea_physical', p.ea_physical,
        'ea_card_url', p.ea_card_url
      )
      -- Bidding is open: the name must not travel, or it leaks through the
      -- network tab and the guessing game is over.
      else jsonb_build_object(
        'id', p.id,
        'position_type', p.position_type,
        'silhouette_url', case when v_hidden then null else p.silhouette_url end
      )
    end
    into v_player
    from public.players p
    where p.id = v_shown;

    if v_round.mystery and not v_revealed then
      select jsonb_build_object(
        'nationality', (select nationality from public.players where id = v_round.player_id),
        'honours', coalesce(
          (select jsonb_agg(jsonb_build_object('honour', h.honour, 'season', h.season, 'team', h.team)
                            order by h.season)
           from (select * from public.player_honours
                 where player_id = v_round.player_id limit 8) h),
          '[]'::jsonb
        )
      ) into v_envelope;
    end if;
  end if;

  return jsonb_build_object(
    'room', jsonb_build_object(
      'id', v_room.id, 'code', v_room.code, 'status', v_room.status,
      'starting_budget', v_room.starting_budget, 'round_number', v_room.round_number,
      'current_position', v_room.current_position, 'round_seconds', v_room.round_seconds,
      'auction_mode', v_room.auction_mode,
      -- Sin estos dos, el panel de revancha no tenía de dónde leer la
      -- configuración vigente y los fijaba a mano: repetir partida reseteaba en
      -- silencio el filtro de género y el catálogo elegidos por el anfitrión.
      'gender_filter', v_room.gender_filter,
      'pool', v_room.pool,
      'include_legends', v_room.include_legends,
      'requirements', v_room.requirements,
      'room_participants', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', rp.id, 'display_name', rp.display_name, 'is_host', rp.is_host,
          'remaining_budget', rp.remaining_budget, 'passes_used', rp.passes_used,
          'is_ready', rp.is_ready,
          'position_passes', coalesce((
            select jsonb_agg(jsonb_build_object('position_type', pp.position_type))
            from public.position_passes pp where pp.participant_id = rp.id
          ), '[]'::jsonb),
          'team_players', coalesce((
            select jsonb_agg(jsonb_build_object(
              'purchase_price', tp.purchase_price, 'rating', tp.rating,
              'season_year', tp.season_year, 'era_label', tp.era_label,
              'players', jsonb_build_object(
                'id', pl.id, 'name', pl.name, 'team', pl.team, 'position', pl.position,
                'position_type', pl.position_type, 'nationality', pl.nationality,
                'photo_url', pl.photo_url, 'silhouette_url', pl.silhouette_url
              )
            ))
            from public.team_players tp
            join public.players pl on pl.id = tp.player_id
            where tp.participant_id = rp.id
          ), '[]'::jsonb)
        ) order by rp.created_at)
        from public.room_participants rp where rp.room_id = v_room.id
      ), '[]'::jsonb)
    ),
    'currentRound', case
      when v_round.id is null then null
      else jsonb_build_object(
        'id', v_round.id, 'player_id', v_round.player_id, 'status', v_round.status,
        'current_bid', v_round.current_bid, 'current_bid_by', v_round.current_bid_by,
        'starts_at', v_round.starts_at, 'ends_at', v_round.ends_at,
        'position_type', v_round.position_type, 'round_number', v_round.round_number,
        'mystery', v_round.mystery,
        'revealed', v_revealed,
        -- Los nombres que giran en la ruleta. Sólo al cerrar la ronda: antes
        -- diría quién fue empujado, que es justamente lo que el empujón
        -- esconde.
        'draw', case
          when v_revealed and v_round.draw_contenders is not null then (
            select jsonb_agg(jsonb_build_object('id', rp.id, 'display_name', rp.display_name)
                             order by rp.created_at)
            from public.room_participants rp
            where rp.id = any(v_round.draw_contenders)
          )
        end,
        'sealed', v_room.auction_mode = 'sealed',
        'myEnvelope', v_mine,
        'envelopesIn', v_count,
        'envelopesExpected', v_rivals,
        -- Todos los sobres, sólo una vez abiertos.
        'envelopes', v_sealed,
        'player', v_player,
        'envelope', v_envelope,
        -- The era is part of the surprise, except in an envelope round where
        -- it is one of the few clues on offer.
        'season_year', case when v_revealed or v_round.mystery then v_round.season_year end,
        'era_label', case when v_revealed or v_round.mystery then v_round.era_label end,
        'era_rating', case when v_revealed then v_round.era_rating end,
        -- "espejismo" says nothing until the reveal: warned, the victim would
        -- simply ignore the figure and the power would collapse into a
        -- dearer "apagon".
        'myHex', case
          when v_hex.power is null then null
          when not v_revealed and v_hex.power = 'espejismo' then null
          else jsonb_build_object('power', v_hex.power)
        end,
        'tip', case
          when v_tip and not v_revealed then (
            select jsonb_build_object('nationality', nationality, 'team', team)
            from public.players where id = v_round.player_id
          )
        end
      )
    end,
    'me', case
      when v_me.id is null then null
      else jsonb_build_object(
        'id', v_me.id, 'display_name', v_me.display_name, 'is_host', v_me.is_host,
        'remaining_budget', v_me.remaining_budget, 'passes_used', v_me.passes_used
      )
    end,
    'effects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pe.id, 'power', pe.power, 'caster_id', pe.caster_id,
        'target_id', pe.target_id, 'status', pe.status
      ))
      from public.power_effects pe
      where pe.room_id = v_room.id and pe.status in ('pending', 'active')
    ), '[]'::jsonb),
    'serverTime', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
end;
$function$
;
