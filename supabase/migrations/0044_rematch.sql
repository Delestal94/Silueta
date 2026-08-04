-- ============================================================
-- 0044: Revancha
--
-- Terminada una partida, la sala quedaba muerta: para volver a jugar había que
-- crear otra y repartir un código nuevo por el grupo, y en el camino se perdía
-- la mitad de la mesa.
--
-- rematch() deja la misma sala y el mismo código, devuelve a todos su
-- presupuesto y borra lo de la partida anterior. De paso permite cambiar la
-- configuración sin salir: es el momento natural para decir "ahora a sobre
-- cerrado" o "subile el presupuesto".
--
-- Lo que NO se borra son las partidas terminadas del ranking: team_players se
-- limpia, pero el ranking se calcula sobre salas con status 'finished', y esta
-- deja de estarlo. Así que antes de reabrir hay que dejar constancia de que la
-- partida ocurrió, o se borraría del ranking al empezar la revancha.
--
-- Se puede volver a correr.
-- ============================================================

-- Una partida terminada, congelada. El ranking se calcula sobre esto y no
-- sobre el estado vivo de la sala, que la revancha reescribe.
create table if not exists public.finished_games (
  id             uuid primary key default uuid_generate_v4(),
  room_id        uuid references public.rooms(id) on delete cascade,
  participant_id uuid,
  user_id        uuid references auth.users(id) on delete set null,
  display_name   text not null,
  points         integer not null default 0,
  spent          integer not null default 0,
  signings       integer not null default 0,
  best_signing   integer,
  place          integer not null,
  finished_at    timestamp with time zone default now()
);

alter table public.finished_games enable row level security;
grant select on public.finished_games to anon, authenticated;

create index if not exists finished_games_room_idx on public.finished_games (room_id);
create index if not exists finished_games_user_idx on public.finished_games (user_id)
  where user_id is not null;

-- Una partida se archiva una sola vez, pase lo que pase con la sala después.
create unique index if not exists finished_games_once_idx
  on public.finished_games (room_id, participant_id, finished_at);

/**
 * Guarda el resultado de la partida que acaba de terminar.
 *
 * Idempotente por sala: llamarla dos veces sobre la misma partida no duplica
 * filas, porque compara contra lo ya archivado para esa sala.
 */
create or replace function public.archive_game(p_room uuid)
returns integer
language plpgsql
security definer
as $$
declare
  v_rows integer;
  v_at   timestamp with time zone := now();
begin
  -- Ya archivada y sin partida nueva encima: no hay nada que hacer.
  if exists (
    select 1 from public.finished_games fg
    join public.team_players tp on tp.room_id = fg.room_id
    where fg.room_id = p_room
    having max(fg.finished_at) > max(tp.created_at)
  ) then
    return 0;
  end if;

  with resumen as (
    select
      rp.id                               as participant_id,
      rp.user_id,
      rp.display_name,
      coalesce(sum(tp.rating), 0)         as points,
      coalesce(sum(tp.purchase_price), 0) as spent,
      count(tp.id)                        as signings,
      max(tp.rating)                      as best_signing
    from public.room_participants rp
    left join public.team_players tp on tp.participant_id = rp.id
    where rp.room_id = p_room
    group by rp.id, rp.user_id, rp.display_name
  )
  insert into public.finished_games (
    room_id, participant_id, user_id, display_name,
    points, spent, signings, best_signing, place, finished_at
  )
  select
    p_room, participant_id, user_id, display_name,
    points, spent, signings, best_signing,
    rank() over (order by points desc, spent asc),
    v_at
  from resumen
  where signings > 0;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

/**
 * Reabre la sala para otra partida.
 *
 * Sólo el anfitrión. Archiva lo jugado, borra equipos, rondas, pases y poderes,
 * devuelve el presupuesto y deja la sala en lobby. Los parámetros que llegan
 * en null dejan la configuración como estaba.
 */
create or replace function public.rematch(
  p_room uuid,
  p_host_token text,
  p_starting_budget integer default null,
  p_round_seconds integer default null,
  p_gender_filter text default null,
  p_pool text default null,
  p_auction_mode text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_room public.rooms%rowtype;
begin
  select * into v_room from public.rooms where id = p_room for update;
  if not found then
    return jsonb_build_object('error', 'room_not_found');
  end if;

  if v_room.host_token is distinct from p_host_token then
    return jsonb_build_object('error', 'not_host');
  end if;

  -- Primero el archivo: en cuanto se borren los fichajes, el resultado de la
  -- partida anterior deja de existir.
  perform public.archive_game(p_room);

  delete from public.team_players where room_id = p_room;
  delete from public.power_effects where room_id = p_room;
  delete from public.position_passes
    where participant_id in (select id from public.room_participants where room_id = p_room);
  delete from public.auction_rounds where room_id = p_room;

  update public.rooms
  set status           = 'lobby',
      round_number     = 0,
      current_position = null,
      starting_budget  = coalesce(p_starting_budget, starting_budget),
      round_seconds    = coalesce(p_round_seconds, round_seconds),
      gender_filter    = coalesce(p_gender_filter, gender_filter),
      pool             = coalesce(p_pool, pool),
      auction_mode     = coalesce(p_auction_mode, auction_mode)
  where id = p_room
  returning * into v_room;

  update public.room_participants
  set remaining_budget = v_room.starting_budget,
      passes_used      = 0,
      is_ready         = false
  where room_id = p_room;

  return jsonb_build_object('room', to_jsonb(v_room), 'rematch', true);
end;
$$;

-- ============================================================
-- El ranking pasa a leer las partidas archivadas
--
-- Antes salía del estado vivo de la sala, que la revancha reescribe: sin esto,
-- empezar otra partida borraría del ranking la que se acaba de jugar.
-- ============================================================

drop view if exists public.leaderboard cascade;

create view public.leaderboard as
with ranked as (
  select
    coalesce('user:' || fg.user_id::text, 'name:' || lower(fg.display_name)) as identity,
    fg.user_id is not null as verified,
    fg.display_name,
    fg.room_id,
    fg.finished_at,
    fg.points,
    fg.best_signing,
    fg.place
  from public.finished_games fg
  where fg.signings > 0
)
select
  identity,
  (array_agg(display_name order by finished_at desc))[1] as display_name,
  bool_or(verified)                as verified,
  count(*)                         as games,
  count(*) filter (where place = 1) as wins,
  max(points)                      as best_score,
  round(avg(points))::int          as average_score,
  max(best_signing)                as best_signing,
  sum(points)                      as total_points
from ranked
group by identity
order by best_score desc, wins desc, games desc;

grant select on public.leaderboard to anon, authenticated;

-- Traer al archivo las partidas ya terminadas, para no perder el ranking que
-- ya existe.
insert into public.finished_games (
  room_id, participant_id, user_id, display_name,
  points, spent, signings, best_signing, place, finished_at
)
select
  room_id, participant_id, user_id, display_name,
  points, spent, signings, best_signing,
  rank() over (partition by room_id order by points desc, spent asc),
  now()
from (
  select
    rp.room_id,
    rp.id                               as participant_id,
    rp.user_id,
    rp.display_name,
    coalesce(sum(tp.rating), 0)         as points,
    coalesce(sum(tp.purchase_price), 0) as spent,
    count(tp.id)                        as signings,
    max(tp.rating)                      as best_signing
  from public.room_participants rp
  join public.rooms r on r.id = rp.room_id and r.status = 'finished'
  left join public.team_players tp on tp.participant_id = rp.id
  group by rp.room_id, rp.id, rp.user_id, rp.display_name
) viejas
where signings > 0
  and not exists (select 1 from public.finished_games fg where fg.room_id = viejas.room_id);

-- ============================================================
-- Archivar al terminar, no sólo al pedir revancha
--
-- El ranking se calcula sobre finished_games, y la mayoría de las partidas
-- terminan sin que nadie vuelva a jugar. Archivando sólo en rematch(), esas
-- desaparecían del ranking — que es exactamente lo que esta migración vino a
-- evitar.
-- ============================================================

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

  -- Se archiva acá y no sólo en la revancha. El ranking se calcula sobre
  -- finished_games, y la mayoría de las partidas terminan y nadie vuelve a
  -- jugar: si esperáramos a la revancha, esas no aparecerían nunca.
  perform public.archive_game(p_room);

  return jsonb_build_object('finished', true);
end;
$$;
