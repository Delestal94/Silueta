-- ============================================================
-- 0035: Keep the colour version of the very pose we silhouette
--
-- The silhouette is the alpha mask of TheSportsDB's action render, so the
-- render *is* the same figure in colour. Revealing with it lets the shape stay
-- put and simply fill in, which reads as the answer to what you were looking
-- at — unlike swapping in an unrelated portrait.
--
-- Mirrored to our own bucket rather than hot-linked: a foreign CDN can block
-- or move an image, and the reveal is the moment the game must not fumble.
-- Safe to re-run.
-- ============================================================

alter table public.players
  add column if not exists colour_url text;

-- Not part of players_complete: a missing colour image degrades to the EA
-- card, which is a fine reveal on its own.
create index if not exists idx_players_missing_colour
  on public.players (id) where colour_url is null and render_url is not null;
