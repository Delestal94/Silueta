-- ============================================================
-- 0032: Remove the one-argument finalize_round
--
-- 0031 added a p_host_token parameter with a default, which creates a *new*
-- function rather than replacing the old one — so both signatures lived in
-- the database at once. Any caller passing a single argument silently got the
-- older body, which knows nothing about the host being allowed to close early.
--
-- Overloads of a function that owns game rules are a trap: which one runs
-- depends on how the caller happens to spell the call.
-- Safe to re-run.
-- ============================================================

drop function if exists public.finalize_round(uuid);

-- Sweep whatever was left stranded. Rounds expired while the deployed frontend
-- still predated 0030: it asked to close, the database refused because the
-- clock said otherwise, and that client never asked again.
do $$
declare
  v_room uuid;
begin
  for v_room in
    select distinct room_id from public.auction_rounds
    where status = 'active' and ends_at <= now()
  loop
    perform public.settle_expired(v_room);
  end loop;
end $$;
