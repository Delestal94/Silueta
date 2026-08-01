-- ============================================================
-- 0012: EA FC becomes the primary catalog source
--
-- EA's feed decides *who* is in the catalog (it ranks players by overall, so
-- "most recognisable" is objective rather than hand-curated) and supplies the
-- rating, the six headline stats and the official card art.
--
-- TheSportsDB stays on only as a silhouette provider: EA's player image is a
-- head-and-shoulders portrait, which would make every silhouette an identical
-- blob, while TheSportsDB's `strRender` is a full-body action pose.
-- Safe to re-run.
-- ============================================================

alter table public.players
  add column if not exists ea_id          integer,
  add column if not exists ea_rank        integer,
  add column if not exists ea_position    text,
  add column if not exists ea_league      text,
  add column if not exists ea_skill_moves integer,
  add column if not exists ea_weak_foot   integer;

-- sportsdb_id is no longer the identity of a catalog row.
alter table public.players
  drop constraint if exists players_ea_id_unique;
alter table public.players
  add constraint players_ea_id_unique unique (ea_id);

create index if not exists idx_players_ea_rank on public.players (ea_rank);
