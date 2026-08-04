-- ============================================================
-- 0047: El estado de la sala publica su configuración
--
-- room_state devolvía el presupuesto, los segundos y el modo, pero no el filtro
-- de género ni el catálogo. El panel de revancha, que ofrece cambiar la
-- configuración, no tenía de dónde leer la vigente: los fijaba a mano en
-- "Ambos" y "Más famosos".
--
-- El efecto era silencioso y feo — una sala configurada como masculina volvía a
-- traer mujeres al repetir partida, sin que nadie hubiera tocado esa opción.
--
-- Se puede volver a correr.
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
