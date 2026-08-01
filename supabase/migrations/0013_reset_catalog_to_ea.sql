-- ============================================================
-- 0013: Hand the auctionable catalog over to EA-sourced rows
--
-- Rows imported before 0012 are keyed by sportsdb_id and carry no EA rating,
-- so they cannot be scored. They stay in the table because finished games
-- reference them, but they are no longer drawn into new auctions.
-- Safe to re-run.
-- ============================================================

update public.players
set notable = false
where ea_id is null;
