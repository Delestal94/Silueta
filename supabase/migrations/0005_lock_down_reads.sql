-- ============================================================
-- 0005: Close read leaks reachable with the public anon key
--
-- The browser holds the anon key, so anything it can SELECT is public:
--   * rooms.host_token             -> anyone could take over as host
--   * room_participants.client_token -> anyone could act as another player
--   * players                      -> silhouette_url could be mapped to a
--                                     name, which is the whole game
--
-- The app reads game state through service-role API routes, so the browser
-- only needs enough SELECT for realtime change delivery.
-- Safe to re-run.
-- ============================================================

-- The catalog is never queried from the browser.
revoke select on public.players from anon, authenticated;

drop policy if exists "Players are viewable by everyone" on public.players;

-- Column-level revokes keep realtime working while hiding the secrets.
revoke select (host_token) on public.rooms from anon, authenticated;
revoke select (client_token) on public.room_participants from anon, authenticated;
