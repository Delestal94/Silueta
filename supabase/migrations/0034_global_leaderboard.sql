-- ============================================================
-- 0034: Global leaderboard across every finished game
--
-- Players are identified by display name, which is all the game ever asks
-- for. That means two people picking the same name share a row — the honest
-- trade for a game with no accounts, and worth stating rather than pretending
-- the board is authoritative.
--
-- Only finished rooms count: a game abandoned mid-way would otherwise show up
-- as a very cheap squad.
-- Safe to re-run.
-- ============================================================

-- Se borra antes de crearla. 0039 la reemplaza por una con columnas nuevas, y
-- `create or replace view` no puede quitar columnas: en una base que ya se pasó
-- de acá, volver a esta versión fallaba en cada corrida del lote entero.
drop view if exists public.leaderboard cascade;

create view public.leaderboard as
with games as (
  select
    rp.display_name,
    rp.room_id,
    coalesce(sum(tp.rating), 0)         as points,
    coalesce(sum(tp.purchase_price), 0) as spent,
    count(tp.id)                        as signings,
    max(tp.rating)                      as best_signing
  from public.room_participants rp
  join public.rooms r on r.id = rp.room_id and r.status = 'finished'
  left join public.team_players tp on tp.participant_id = rp.id
  group by rp.display_name, rp.room_id
),
ranked as (
  select
    display_name,
    room_id,
    points,
    spent,
    signings,
    best_signing,
    -- Winner of that particular game.
    rank() over (partition by room_id order by points desc, spent asc) as place
  from games
)
select
  display_name,
  count(*)                                  as games,
  count(*) filter (where place = 1)          as wins,
  max(points)                                as best_score,
  round(avg(points))::int                    as average_score,
  max(best_signing)                          as best_signing,
  sum(points)                                as total_points
from ranked
where signings > 0
group by display_name
order by best_score desc, wins desc, games desc;

grant select on public.leaderboard to anon, authenticated;
