-- ============================================================
-- 0025: Deleting a room must clean up after itself
--
-- The foreign keys pointing at room_participants were declared without an
-- action, so deleting a room cascaded to its participants and then failed on
-- their bids and signings. A room could not be removed at all without
-- hand-deleting five tables in the right order.
-- Safe to re-run.
-- ============================================================

alter table public.bids drop constraint if exists bids_participant_id_fkey;
alter table public.bids
  add constraint bids_participant_id_fkey
  foreign key (participant_id) references public.room_participants(id) on delete cascade;

alter table public.team_players drop constraint if exists team_players_participant_id_fkey;
alter table public.team_players
  add constraint team_players_participant_id_fkey
  foreign key (participant_id) references public.room_participants(id) on delete cascade;

-- The winning bidder disappearing should blank the field, not block the delete.
alter table public.auction_rounds drop constraint if exists auction_rounds_current_bid_by_fkey;
alter table public.auction_rounds
  add constraint auction_rounds_current_bid_by_fkey
  foreign key (current_bid_by) references public.room_participants(id) on delete set null;

-- Rounds and signings also reference players; keep those restrictive so a
-- catalog cleanup can never silently erase a played auction.
