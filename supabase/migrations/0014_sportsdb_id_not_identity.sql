-- ============================================================
-- 0014: sportsdb_id is provenance, not identity
--
-- Since 0012 the catalog is keyed by ea_id. sportsdb_id only records which
-- TheSportsDB record the silhouette render came from, and the pre-EA rows
-- still hold the same ids — so a unique constraint on it now blocks the
-- EA import instead of protecting anything.
-- Safe to re-run.
-- ============================================================

alter table public.players
  drop constraint if exists players_sportsdb_id_unique;

drop index if exists public.players_sportsdb_id_key;

create index if not exists idx_players_sportsdb_id
  on public.players (sportsdb_id) where sportsdb_id is not null;
