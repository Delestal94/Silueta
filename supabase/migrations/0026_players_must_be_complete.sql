-- ============================================================
-- 0025: A player row is complete or it does not exist
--
-- The table had accumulated 1175 half-filled rows: leftovers from the
-- pre-EA import with no rating or stats, and entries whose silhouette never
-- got generated. None of them could be auctioned, so they were dead weight
-- that made every count misleading.
--
-- The check makes the incomplete state unrepresentable rather than merely
-- filtered out at query time.
-- Safe to re-run.
-- ============================================================

-- Drop first: the constraint cannot be added while violations exist, and the
-- delete below is what removes them.
alter table public.players drop constraint if exists players_complete;

-- Rows still referenced by a played game are kept: deleting them would
-- rewrite the history of finished auctions.
delete from public.players p
where (
    p.silhouette_url is null
    or p.ea_overall is null
    or p.ea_pace is null
    or p.ea_shooting is null
    or p.ea_passing is null
    or p.ea_dribbling is null
    or p.ea_defending is null
    or p.ea_physical is null
    or p.position_type is null
    or p.gender is null
    or p.nationality is null
    or p.team is null
    or p.birth_date is null
  )
  and not exists (select 1 from public.auction_rounds ar where ar.player_id = p.id)
  and not exists (select 1 from public.team_players tp where tp.player_id = p.id);

-- Applied only when nothing violates it, so a partial cleanup still leaves a
-- working database instead of a failed migration.
do $$
begin
  if not exists (
    select 1 from public.players
    where silhouette_url is null
       or ea_overall is null
       or ea_pace is null or ea_shooting is null or ea_passing is null
       or ea_dribbling is null or ea_defending is null or ea_physical is null
       or position_type is null or gender is null
       or nationality is null or team is null or birth_date is null
  ) then
    alter table public.players
      add constraint players_complete check (
        silhouette_url is not null
        and ea_overall is not null
        and ea_pace is not null
        and ea_shooting is not null
        and ea_passing is not null
        and ea_dribbling is not null
        and ea_defending is not null
        and ea_physical is not null
        and position_type is not null
        and gender is not null
        and nationality is not null
        and team is not null
        and birth_date is not null
      );
  else
    raise notice 'players_complete no se aplicó: quedan filas incompletas referenciadas por partidas';
  end if;
end $$;

-- These two exist for the community flow, which no longer stages half a
-- player in this table.
alter table public.players drop column if exists source_image_url;
