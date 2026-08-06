-- ============================================================
-- 0057: Si pasan todos, la silueta se saltea y no se la lleva nadie
--
-- Hasta acá el sorteo tenía una red: si todos pasaban, el pase se anulaba y
-- volvían a entrar todos, porque "alguien se lo tiene que llevar". Eso hacía
-- que pasar no fuera una decisión sino una apuesta a que otro no pasara — con
-- dos jugadores, si los dos pasaban, uno igual se comía al jugador que ninguno
-- quería, y encima pagaba por él.
--
-- Ahora el pase significa lo que dice. El sorteo se hace sólo entre los que no
-- pasaron, y si no queda nadie la ronda cierra sin dueño: la silueta se
-- saltea, no se cobra nada y el puesto sigue abierto para la próxima.
--
-- Eso cubre también el caso de quedar solo: el último que necesita el puesto,
-- si pasa sin haber ofertado, ya no se lo lleva por descarte.
--
-- Al empujado no lo alcanza esto. El empujón mete una oferta de verdad, así
-- que la ronda se resuelve por puja y nunca llega al sorteo: la ronda sin
-- ofertas es exactamente la que nadie quiso.
--
-- Hay que tocar las dos funciones. pass_round tenía su propia copia de la
-- regla —cuando pasaba el último, elegía ganador ahí mismo y le fijaba el
-- precio— así que cambiar sólo finalize_round no cambiaba nada: la ronda ya
-- llegaba adjudicada. Ahora pass_round se limita a cerrar el reloj y quién se
-- lo lleva se decide en un solo lugar.
--
-- Se puede volver a correr.
-- ============================================================

-- ---------- pasar ya no adjudica ----------

CREATE OR REPLACE FUNCTION public.pass_round(p_round uuid, p_client_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_round       public.auction_rounds%rowtype;
  v_participant public.room_participants%rowtype;
  v_contenders  uuid[];
  v_passed      int;
begin
  select * into v_round from public.auction_rounds where id = p_round for update;
  if not found then
    return jsonb_build_object('error', 'round_not_found');
  end if;

  if v_round.status <> 'active' then
    return jsonb_build_object('error', 'round_closed');
  end if;

  select * into v_participant
  from public.room_participants
  where room_id = v_round.room_id and client_token = p_client_token;

  if not found then
    return jsonb_build_object('error', 'not_a_participant');
  end if;

  if public.slots_remaining(v_participant.id, v_round.position_type) <= 0 then
    return jsonb_build_object('error', 'position_already_full');
  end if;

  if not public.has_pass(v_participant.id, v_round.position_type) then
    return jsonb_build_object('error', 'no_pass_left');
  end if;

  -- Se anota en qué ronda se gastó: el pase es por puesto, pero proteger del
  -- sorteo tiene que valer sólo para la ronda en la que se usó. Sin esto, quien
  -- pasó una vez quedaba afuera de todos los sorteos de ese puesto, incluso ya
  -- sin pase.
  insert into public.position_passes (participant_id, position_type, round_id)
  values (v_participant.id, v_round.position_type, p_round)
  on conflict do nothing;

  -- Keep the legacy counter roughly in step for anything still reading it.
  update public.room_participants
  set passes_used = (
    select count(*) from public.position_passes where participant_id = v_participant.id
  )
  where id = v_participant.id;

  select array_agg(rp.id) into v_contenders
  from public.room_participants rp
  where rp.room_id = v_round.room_id
    and public.slots_remaining(rp.id, v_round.position_type) > 0;

  select count(*) into v_passed
  from public.position_passes pp
  where pp.round_id = p_round
    and pp.participant_id = any(v_contenders);

  -- Pasaron todos los que necesitaban el puesto: no hay nada más que esperar,
  -- así que se cierra el reloj y listo. Antes acá mismo se elegía un ganador al
  -- azar y se le cobraba, que es justo lo que dejaba sin sentido al pase.
  -- Quién se lo lleva —o nadie— lo decide finalize_round, que es el único lugar
  -- que liquida una ronda.
  if v_passed >= array_length(v_contenders, 1) then
    update public.auction_rounds set ends_at = now() where id = p_round;
    return jsonb_build_object('passed', true, 'todos_pasaron', true);
  end if;

  return jsonb_build_object('passed', true);
end;
$function$
;

-- ---------- y el sorteo respeta el pase ----------

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
  v_empatados  uuid[];
  v_tope       integer;
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

  -- Nadie puso nada. Se sortea entre los que todavía necesitan el puesto y no
  -- pasaron, al precio mínimo: quedarse quieto no es una forma de saltear la
  -- ronda, y con el piso en 1 tampoco salía casi gratis.
  if v_round.current_bid_by is null then
    select array_agg(rp.id) into v_contenders
    from public.room_participants rp
    where rp.room_id = v_round.room_id
      and public.slots_remaining(rp.id, v_round.position_type) > 0
      and not exists (
        select 1 from public.position_passes pp
        where pp.participant_id = rp.id and pp.round_id = p_round
      );

    -- Sin el rescate de antes: si pasaron todos, no hay a quién sortear y la
    -- ronda queda sin dueño. Volver a meterlos a todos convertía el pase en
    -- una apuesta a que otro no pasara, y le encajaba el jugador —cobrado— a
    -- alguien que había dicho explícitamente que no lo quería.
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

    update public.room_participants
    set remaining_budget = greatest(0, remaining_budget - v_paid)
    where id = v_round.current_bid_by;
  end if;

  update public.power_effects
  set status = 'consumed'
  where round_id = p_round and status = 'active';

  return jsonb_build_object('round', to_jsonb(v_round), 'raffled', v_raffled);
end;
$function$
;
