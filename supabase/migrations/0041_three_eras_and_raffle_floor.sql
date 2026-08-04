-- ============================================================
-- 0041: Tres épocas parejas, y un piso para el sorteo
--
-- La época se sorteaba eligiendo un año cualquiera entre los 18 y los 36. Con
-- eso las etiquetas salían desparejas —Prime abarcaba siete años y Promesa
-- tres, así que Prime aparecía más del doble— y encima había cinco nombres
-- para algo que el jugador piensa en tres: joven, en su mejor momento, o
-- grande.
--
-- Ahora son tres épocas y se sortea primero la época, después el año adentro.
-- Las tres pesan lo mismo, que es lo que hace que comprar sea una apuesta y no
-- una estadística.
--
-- Un jugador sólo puede ser subastado en las épocas que ya vivió: a los 18
-- años no existe un Yamal veterano, y proyectarlo sería inventar un dato.
--
-- Y el que se lleva un jugador sin haber puesto nada ahora paga 10 en vez de
-- 1. Quedarse quieto ya no era gratis desde que existe el sorteo, pero salía
-- casi gratis.
--
-- Se puede volver a correr.
-- ============================================================

-- ---------- las tres épocas ----------

create or replace function public.era_label(p_age integer)
returns text language sql immutable as $$
  select case
    when p_age is null then 'Carrera'
    when p_age <= 22 then 'Promesa'
    when p_age <= 31 then 'Prime'
    else 'Veterano'
  end;
$$;

/**
 * Las épocas que este jugador realmente vivió, con su ventana de años.
 *
 * Devuelve una fila por época disponible. Un chico de 19 sólo tiene Promesa;
 * un retirado tiene las tres. Nunca devuelve vacío: si ni siquiera llegó a los
 * 18 —no debería pasar, pero el catálogo no lo garantiza— cae en su año actual
 * para que la ronda no se quede sin temporada que mostrar.
 */
create or replace function public.player_eras(p_birth integer)
returns table (era text, low integer, high integer)
language sql stable as $$
  with hoy as (select extract(year from now())::int as y),
  ventanas(era, desde, hasta) as (
    values ('Promesa'::text, 18, 21),
           ('Prime'::text,   25, 30),
           ('Veterano'::text, 33, 36)
  ),
  vividas as (
    select v.era,
           p_birth + v.desde                        as low,
           least(p_birth + v.hasta, (select y from hoy)) as high
    from ventanas v
    where p_birth + v.desde <= (select y from hoy)
  )
  select era, low, high from vividas
  union all
  -- Red de contención: sin ninguna época vivida, la temporada es este año.
  select 'Promesa', (select y from hoy), (select y from hoy)
  where not exists (select 1 from vividas);
$$;

-- ---------- el piso del sorteo ----------

create or replace function public.raffle_price()
returns integer language sql immutable as $$ select 10; $$;

-- ---------- la ronda elige época y después año ----------

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
  return jsonb_build_object('finished', true);
end;
$$;
-- ---------- el sorteo cobra el piso ----------

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
    select array_agg(rp.id) into v_contenders
    from public.room_participants rp
    where rp.room_id = v_round.room_id
      and public.slots_remaining(rp.id, v_round.position_type) > 0;

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
