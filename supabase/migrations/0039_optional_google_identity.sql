-- ============================================================
-- 0039: Una identidad opcional detrás del nombre
--
-- El juego sigue pidiendo sólo un nombre: se comparte un código por WhatsApp y
-- exigir una cuenta ahí mataría la mitad de las partidas. Pero el ranking
-- global venía agrupando por nombre, con lo cual dos personas llamadas "Nacho"
-- compartían fila y nadie podía reclamar la suya.
--
-- Así que la cuenta es opcional y sólo cambia una cosa: quien entró con Google
-- se agrupa por su id en vez de por su nombre. El anónimo sigue exactamente
-- como estaba.
--
-- Se puede volver a correr.
-- ============================================================

alter table public.room_participants
  add column if not exists user_id uuid references auth.users(id) on delete set null;

-- Buscar las partidas de una persona es la consulta que hace el ranking.
create index if not exists room_participants_user_id_idx
  on public.room_participants (user_id)
  where user_id is not null;

-- La misma persona no entra dos veces a la misma sala. Sin esto, abrir el
-- juego en dos pestañas se contaba como dos jugadores con el mismo dueño.
create unique index if not exists room_participants_room_user_idx
  on public.room_participants (room_id, user_id)
  where user_id is not null;

-- El cliente nunca escribe user_id: lo pone el servidor leyendo la sesión
-- verificada. Si se pudiera mandar en el cuerpo del pedido, cualquiera se
-- anotaría los puntos de otro.
revoke insert, update on public.room_participants from anon, authenticated;

-- ============================================================
-- El ranking, agrupado por persona cuando sabemos quién es
-- ============================================================

-- Se borra antes de crearla: `create or replace view` conserva la lista de
-- columnas, y acá aparece una nueva al principio. Nadie depende de esta vista
-- salvo el endpoint del ranking, así que no hay nada que arrastre el cascade.
drop view if exists public.leaderboard cascade;

create view public.leaderboard as
with games as (
  select
    -- La clave de agrupación: el id de la cuenta si hay, y si no el nombre,
    -- con prefijo para que un nombre nunca pueda chocar con un uuid.
    coalesce('user:' || rp.user_id::text, 'name:' || lower(rp.display_name)) as identity,
    rp.user_id is not null                                                  as verified,
    rp.display_name,
    rp.room_id,
    coalesce(sum(tp.rating), 0)         as points,
    coalesce(sum(tp.purchase_price), 0) as spent,
    count(tp.id)                        as signings,
    max(tp.rating)                      as best_signing
  from public.room_participants rp
  join public.rooms r on r.id = rp.room_id and r.status = 'finished'
  left join public.team_players tp on tp.participant_id = rp.id
  group by 1, 2, rp.display_name, rp.room_id
),
ranked as (
  select
    *,
    -- Ganador de esa partida en particular.
    rank() over (partition by room_id order by points desc, spent asc) as place
  from games
)
select
  identity,
  -- El último nombre que usó, no uno cualquiera: si se lo cambió, el ranking
  -- muestra el actual.
  (array_agg(display_name order by room_id desc))[1] as display_name,
  bool_or(verified)                                  as verified,
  count(*)                                           as games,
  count(*) filter (where place = 1)                  as wins,
  max(points)                                        as best_score,
  round(avg(points))::int                            as average_score,
  max(best_signing)                                  as best_signing,
  sum(points)                                        as total_points
from ranked
where signings > 0
group by identity
order by best_score desc, wins desc, games desc;

grant select on public.leaderboard to anon, authenticated;
