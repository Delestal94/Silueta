-- ON CONFLICT (sportsdb_id) cannot infer a partial index, so the catalog
-- upsert needs a plain unique constraint. NULLs never conflict, which keeps
-- the pre-catalog rows valid.
drop index if exists public.players_sportsdb_id_key;

alter table public.players
  drop constraint if exists players_sportsdb_id_unique;
alter table public.players
  add constraint players_sportsdb_id_unique unique (sportsdb_id);
