-- ============================================================
-- 0040: Modo a sobre cerrado
--
-- La subasta de siempre premia el reflejo: se ve la puja del otro y se
-- responde. A sobre cerrado premia otra cosa —cuánto vale de verdad para vos—
-- porque se escribe el máximo sin saber qué escribieron los demás y los sobres
-- se abren todos juntos al cerrar la ronda.
--
-- Reglas:
--   · Un sobre por persona por ronda. Se puede cambiar hasta que cierra: el
--     sobre no está abierto todavía, así que arrepentirse es legítimo.
--   · Gana el monto más alto y paga exactamente eso.
--   · Si dos empatan, gana el que lo puso primero. Es la única regla que no
--     depende del azar, y castiga dudar en vez de premiarlo.
--   · El reloj NO se reinicia con cada sobre. Reiniciarlo delataría que
--     alguien acaba de poner uno.
--
-- Se puede volver a correr.
-- ============================================================

alter table public.rooms
  add column if not exists auction_mode text not null default 'open';

alter table public.rooms drop constraint if exists rooms_auction_mode_check;
alter table public.rooms
  add constraint rooms_auction_mode_check check (auction_mode in ('open', 'sealed'));

alter table public.bids
  add column if not exists sealed boolean not null default false;

-- Un solo sobre por persona por ronda, que es lo que permite reemplazarlo con
-- un upsert en vez de acumular intentos. En la subasta abierta las pujas sí se
-- acumulan, así que el índice sólo alcanza a las filas selladas.
create unique index if not exists bids_sealed_one_per_round_idx
  on public.bids (round_id, participant_id)
  where sealed;

-- ============================================================
-- Poner un sobre
-- ============================================================

create or replace function public.seal_bid(p_round uuid, p_client_token text, p_amount integer)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_round       public.auction_rounds%rowtype;
  v_participant public.room_participants%rowtype;
  v_room        public.rooms%rowtype;
  v_seconds     integer;
  v_power       text;
  v_due         integer;
  v_elapsed     numeric;
  v_total       integer;
  v_sealed      integer;
begin
  select * into v_round from public.auction_rounds where id = p_round for update;
  if not found then
    return jsonb_build_object('error', 'round_not_found');
  end if;

  if v_round.status <> 'active' then
    return jsonb_build_object('error', 'round_closed');
  end if;

  if v_round.ends_at <= now() then
    return jsonb_build_object('error', 'round_expired');
  end if;

  select * into v_room from public.rooms where id = v_round.room_id;

  if v_room.auction_mode <> 'sealed' then
    return jsonb_build_object('error', 'not_sealed_room');
  end if;

  select * into v_participant
  from public.room_participants
  where room_id = v_round.room_id and client_token = p_client_token;

  if not found then
    return jsonb_build_object('error', 'not_a_participant');
  end if;

  if p_amount < 1 then
    return jsonb_build_object('error', 'bid_too_low');
  end if;

  if public.slots_remaining(v_participant.id, v_round.position_type) <= 0 then
    return jsonb_build_object('error', 'position_already_full');
  end if;

  v_seconds := coalesce(v_room.round_seconds, 20);
  v_power := public.active_power(v_participant.id, p_round);

  if v_power = 'traba' then
    v_elapsed := extract(epoch from (now() - v_round.starts_at));
    if v_elapsed < v_seconds / 2.0 then
      return jsonb_build_object('error', 'locked_out');
    end if;
  end if;

  -- "impuesto" duplica lo que va a costar ganar, así que el presupuesto se
  -- controla contra eso y no contra el número escrito en el sobre.
  v_due := case when v_power = 'impuesto' then p_amount * 2 else p_amount end;

  if v_due > v_participant.remaining_budget then
    return jsonb_build_object('error', 'insufficient_budget');
  end if;

  -- created_at se refresca al cambiar el sobre a propósito: quien lo reescribe
  -- pierde la prioridad que da haber sido el primero en ese monto.
  insert into public.bids (round_id, participant_id, amount, sealed, created_at)
  values (p_round, v_participant.id, p_amount, true, now())
  on conflict (round_id, participant_id) where sealed
  do update set amount = excluded.amount, created_at = now();

  -- Cuántos ya pusieron sobre, de los que todavía necesitan el puesto. Es lo
  -- único que se puede contar en voz alta sin delatar montos.
  select count(*) into v_total
  from public.room_participants rp
  where rp.room_id = v_round.room_id
    and public.slots_remaining(rp.id, v_round.position_type) > 0;

  select count(*) into v_sealed
  from public.bids b
  where b.round_id = p_round and b.sealed;

  return jsonb_build_object(
    'sealed', true,
    'amount', p_amount,
    'sealed_count', v_sealed,
    'contenders', v_total
  );
end;
$$;

-- ============================================================
-- Abrir los sobres
--
-- finalize_round decidía mirando current_bid, que en este modo queda vacío
-- justamente para no filtrar nada durante la ronda. Acá se resuelve antes de
-- llamar al cierre de siempre, que se encarga del resto: el cobro, el
-- "impuesto", el fichaje y el sorteo si no hubo un solo sobre.
-- ============================================================

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
  -- precio mínimo: quedarse quieto no es una forma de saltear la ronda.
  if v_round.current_bid_by is null then
    select array_agg(rp.id) into v_contenders
    from public.room_participants rp
    where rp.room_id = v_round.room_id
      and public.slots_remaining(rp.id, v_round.position_type) > 0;

    if v_contenders is not null and array_length(v_contenders, 1) >= 1 then
      v_raffled := true;
      update public.auction_rounds
      set status = 'sold',
          current_bid = 1,
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

-- ============================================================
-- Que la puja de siempre no funcione en una sala a sobre cerrado
-- ============================================================

create or replace function public.place_bid(p_round uuid, p_client_token text, p_amount integer)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_round       public.auction_rounds%rowtype;
  v_participant public.room_participants%rowtype;
  v_room        public.rooms%rowtype;
  v_seconds     integer;
  v_power       text;
  v_due         integer;
  v_elapsed     numeric;
begin
  select * into v_round from public.auction_rounds where id = p_round for update;
  if not found then
    return jsonb_build_object('error', 'round_not_found');
  end if;

  if v_round.status <> 'active' then
    return jsonb_build_object('error', 'round_closed');
  end if;

  if v_round.ends_at <= now() then
    return jsonb_build_object('error', 'round_expired');
  end if;

  select * into v_room from public.rooms where id = v_round.room_id;

  -- Sin esto, una llamada a mano al endpoint de siempre publicaría el monto en
  -- current_bid y abriría todos los sobres de la ronda.
  if v_room.auction_mode = 'sealed' then
    return jsonb_build_object('error', 'sealed_room');
  end if;

  select * into v_participant
  from public.room_participants
  where room_id = v_round.room_id and client_token = p_client_token;

  if not found then
    return jsonb_build_object('error', 'not_a_participant');
  end if;

  if p_amount <= coalesce(v_round.current_bid, 0) then
    return jsonb_build_object('error', 'bid_too_low');
  end if;

  if public.slots_remaining(v_participant.id, v_round.position_type) <= 0 then
    return jsonb_build_object('error', 'position_already_full');
  end if;

  v_seconds := coalesce(v_room.round_seconds, 20);
  v_power := public.active_power(v_participant.id, p_round);

  if v_power = 'traba' then
    v_elapsed := extract(epoch from (now() - v_round.starts_at));
    if v_elapsed < v_seconds / 2.0 then
      return jsonb_build_object('error', 'locked_out');
    end if;
  end if;

  v_due := case when v_power = 'impuesto' then p_amount * 2 else p_amount end;

  if v_due > v_participant.remaining_budget then
    return jsonb_build_object('error', 'insufficient_budget');
  end if;

  insert into public.bids (round_id, participant_id, amount)
  values (p_round, v_participant.id, p_amount);

  update public.auction_rounds
  set current_bid = p_amount,
      current_bid_by = v_participant.id,
      ends_at = now() + make_interval(secs => v_seconds)
  where id = p_round
  returning * into v_round;

  return jsonb_build_object('round', to_jsonb(v_round));
end;
$$;

-- ============================================================
-- room_state, ahora consciente del modo
--
-- Se redefine entera y no por partes porque es una sola función; lo que
-- cambia es qué se puede contar en voz alta mientras la ronda está abierta.
-- ============================================================

create or replace function public.room_state(p_code text, p_client_token text default null)
returns jsonb
language plpgsql
security definer
as $$
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
$$;