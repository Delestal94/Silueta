-- ============================================================
-- 0059: Jugarse el OVR del que acabás de comprar
--
-- Al ganar una silueta aparece un reto: una probabilidad y unos puntos, y
-- decidís si te la jugás. Si sale, el jugador vale más de lo que pagaste; si
-- no, se te fue parte de lo que compraste.
--
-- Las dos mitades del reto se sortean por separado y son independientes: la
-- probabilidad sale de 60-40, 50-50 o 40-60, y los puntos de +3/-2, +2/-2 o
-- +2/-3. Puede tocarte 40-60 pagando +3/-2, que es una mala apuesta, o 60-40
-- pagando +3/-2, que es un regalo. Por eso no se elige entre tres opciones:
-- si se pudiera elegir, habría una que le gana a las otras dos siempre y las
-- demás sobrarían.
--
-- El reto se sortea al comprar, no al mostrarlo, y queda guardado en la fila
-- del fichaje. Si se sorteara al pedirlo, refrescar la página hasta que salga
-- 60-40 con +3/-2 sería gratis.
--
-- La tirada también es del servidor: un azar que corre en la máquina del que
-- apuesta no es azar. Y se juega una sola vez por fichaje — la guarda es que
-- ovr_bet esté en null.
--
-- El delta se aplica directo sobre team_players.rating, que es lo que suma el
-- puntaje, así que no hay un segundo lugar donde el total pueda quedar
-- desfasado. ovr_delta queda aparte sólo para poder mostrar qué pasó.
--
-- Se puede volver a correr.
-- ============================================================

alter table public.team_players
  add column if not exists ovr_bet    text,
  add column if not exists ovr_delta  integer,
  add column if not exists ovr_prob   integer,
  add column if not exists ovr_gana   integer,
  add column if not exists ovr_pierde integer;

-- ---------- las dos mitades del reto, en un solo lugar ----------

create or replace function public.ovr_odds()
returns integer[] language sql immutable as $$ select array[60, 50, 40]; $$;

-- Cada par es {lo que sumás, lo que restás}.
create or replace function public.ovr_stakes()
returns integer[][] language sql immutable as $$
  select array[array[3, 2], array[2, 2], array[2, 3]];
$$;

-- ---------- el reto se sortea al comprar ----------

/**
 * Le pega un reto a cada fichaje en el momento en que se crea.
 *
 * Va como trigger y no dentro de finalize_round porque los fichajes se
 * insertan desde más de un lugar —la subasta y el sorteo— y un trigger cubre
 * los dos sin repetir el sorteo en cada uno.
 */
create or replace function public.sortear_reto_ovr()
returns trigger language plpgsql as $$
declare
  v_odds   integer[] := public.ovr_odds();
  v_stakes integer[][] := public.ovr_stakes();
  v_i      int;
begin
  if new.ovr_prob is null then
    new.ovr_prob := v_odds[1 + floor(random() * array_length(v_odds, 1))::int];
    v_i := 1 + floor(random() * array_length(v_stakes, 1))::int;
    new.ovr_gana   := v_stakes[v_i][1];
    new.ovr_pierde := v_stakes[v_i][2];
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sortear_reto_ovr on public.team_players;
create trigger trg_sortear_reto_ovr
  before insert on public.team_players
  for each row execute function public.sortear_reto_ovr();

-- Los fichajes de partidas en curso son de antes del trigger y no tienen reto.
update public.team_players
set ovr_prob   = (public.ovr_odds())[1 + floor(random() * 3)::int],
    ovr_gana   = (public.ovr_stakes())[1 + floor(random() * 3)::int][1],
    ovr_pierde = (public.ovr_stakes())[1 + floor(random() * 3)::int][2]
where ovr_prob is null;

-- ---------- jugársela ----------

-- `create or replace` no puede renombrar un parámetro, y el tercero pasó de
-- p_opcion a p_decision cuando el reto dejó de ser una lista para elegir. Sin
-- este drop la migración falla con "cannot change name of input parameter".
drop function if exists public.apostar_ovr(uuid, text, text);

-- Reemplazada por ovr_odds() y ovr_stakes(), que sortean por separado.
drop function if exists public.ovr_bets();

create or replace function public.apostar_ovr(
  p_round uuid,
  p_client_token text,
  p_decision text
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_round       public.auction_rounds%rowtype;
  v_participant public.room_participants%rowtype;
  v_signing     public.team_players%rowtype;
  v_gana        boolean;
  v_nuevo       int;
begin
  select * into v_round from public.auction_rounds where id = p_round;
  if not found then
    return jsonb_build_object('error', 'round_not_found');
  end if;

  select * into v_participant
  from public.room_participants
  where room_id = v_round.room_id and client_token = p_client_token;

  if not found then
    return jsonb_build_object('error', 'not_a_participant');
  end if;

  -- Sólo el que se lo llevó. Sin esto cualquiera de la sala podría tirar por
  -- un fichaje ajeno.
  if v_round.current_bid_by is distinct from v_participant.id then
    return jsonb_build_object('error', 'not_the_winner');
  end if;

  select * into v_signing
  from public.team_players
  where room_id = v_round.room_id
    and participant_id = v_participant.id
    and player_id = v_round.player_id
  for update;

  if not found then
    return jsonb_build_object('error', 'signing_not_found');
  end if;

  if v_signing.ovr_bet is not null then
    return jsonb_build_object('error', 'already_bet');
  end if;

  -- No aceptar el reto también es una decisión, y se guarda igual: es lo que
  -- distingue "todavía no eligió" de "eligió no jugársela".
  if p_decision <> 'va' then
    update public.team_players set ovr_bet = 'paso' where id = v_signing.id;
    return jsonb_build_object('ovr_bet', 'paso', 'rating', v_signing.rating);
  end if;

  v_gana := (random() * 100) < v_signing.ovr_prob;

  -- El mismo techo y piso que usa peak_rating: un rating fuera de 40..99 no
  -- existe en ningún otro lado del juego.
  v_nuevo := greatest(40, least(99,
    coalesce(v_signing.rating, 0)
      + case when v_gana then v_signing.ovr_gana else -v_signing.ovr_pierde end
  ));

  update public.team_players
  set ovr_bet   = 'va',
      ovr_delta = v_nuevo - coalesce(v_signing.rating, 0),
      rating    = v_nuevo
  where id = v_signing.id;

  return jsonb_build_object(
    'ovr_bet', 'va',
    'gano', v_gana,
    'delta', v_nuevo - coalesce(v_signing.rating, 0),
    'rating_antes', v_signing.rating,
    'rating', v_nuevo
  );
end;
$$;

-- ---------- el estado tiene que contar el reto ----------

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
              'ovr_bet', tp.ovr_bet, 'ovr_delta', tp.ovr_delta,
              'ovr_prob', tp.ovr_prob, 'ovr_gana', tp.ovr_gana, 'ovr_pierde', tp.ovr_pierde,
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
