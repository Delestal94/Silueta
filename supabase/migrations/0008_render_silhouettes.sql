-- ============================================================
-- 0008: Track where each silhouette came from
--
-- Cutouts are standardised studio portraits, so their silhouettes are all
-- the same head-and-shoulders blob and the guessing game falls apart.
-- Renders are full-body action poses and are actually distinguishable, so
-- they are preferred when available.
-- Safe to re-run.
-- ============================================================

alter table public.players
  add column if not exists render_url        text,
  add column if not exists silhouette_source text;

alter table public.players
  drop constraint if exists players_silhouette_source_check;
alter table public.players
  add constraint players_silhouette_source_check
  check (silhouette_source is null or silhouette_source in ('render', 'cutout'));

-- Everything imported before this migration came from a cutout.
update public.players
set silhouette_source = 'cutout'
where sportsdb_id is not null
  and silhouette_url is not null
  and silhouette_source is null;
