-- ============================================================
-- 0043: Pasar te saca del sorteo
--
-- Cuando nadie ofertaba, el jugador se sorteaba entre todos los que todavía
-- necesitaban el puesto — incluido el que acababa de gastar su pase. Con eso
-- el pase no servía para nada en la única situación para la que existe.
--
-- Ahora quien pasó en esa ronda queda afuera. Si pasaron todos no queda a quién
-- sortear, así que ahí vuelven a entrar todos: alguien se lo tiene que llevar,
-- que es lo que evita que la mesa entera esquive a un jugador que nadie quiere.
--
-- El pase se sigue teniendo una vez por puesto, pero ahora se registra en qué
-- ronda se gastó. Sin eso, quien pasó en la primera ronda de arqueros quedaba
-- excluido de todos los sorteos de arqueros que vinieran después, ya sin pase
-- y sin forma de defenderse.
--
-- Se puede volver a correr.
-- ============================================================

alter table public.position_passes
  add column if not exists round_id uuid references public.auction_rounds(id) on delete cascade;

create index if not exists position_passes_round_idx
  on public.position_passes (round_id)
  where round_id is not null;

-- ---------- pasar deja constancia de la ronda ----------

create or replace function public.pass_round(p_round uuid, p_client_token text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_round       public.auction_rounds%rowtype;
  v_participant public.room_participants%rowtype;
  v_contenders  uuid[];
  v_passed      int;
  v_winner      uuid;
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

  -- Everyone who still needs this position has bowed out: somebody has to
  -- take him.
  if v_passed >= array_length(v_contenders, 1) then
    v_winner := v_contenders[1 + floor(random() * array_length(v_contenders, 1))::int];

    update public.auction_rounds
    set current_bid = public.raffle_price(),
        current_bid_by = v_winner,
        ends_at = now()
    where id = p_round;

    return jsonb_build_object('coin_flip_winner', v_winner, 'coin_flip', true, 'passed', true);
  end if;

  return jsonb_build_object('passed', true);
end;
$$;

-- ---------- el sorteo respeta el pase ----------

create or replace function public.finalize_round(p_round uuid, p_host_token text default null)
returns jsonb
language plpgsql
security definer
as $$
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
  if v_mode = 'sealed' then
    select * into v_best
    from public.bids
    where round_id = p_round and sealed
    order by amount desc, created_at asc
    limit 1;

    if found then
      update public.auction_rounds
      set current_bid = v_best.amount, current_bid_by = v_best.participant_id
      where id = p_round
      returning * into v_round;
    end if;
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

    update public.room_participants
    set remaining_budget = greatest(0, remaining_budget - v_paid)
    where id = v_round.current_bid_by;
  end if;

  update public.power_effects
  set status = 'consumed'
  where round_id = p_round and status = 'active';

  return jsonb_build_object('round', to_jsonb(v_round), 'raffled', v_raffled);
end;
$$;
