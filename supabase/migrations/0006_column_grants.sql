-- ============================================================
-- 0006: Actually hide the secret columns
--
-- A table-level GRANT SELECT covers every column, so the column REVOKEs in
-- 0005 were no-ops. The privilege has to be dropped at the table level and
-- re-granted column by column.
-- Safe to re-run.
-- ============================================================

revoke select on public.rooms from anon, authenticated;
grant select (
  id, code, status, starting_budget, round_number,
  current_position, round_seconds, requirements, created_at
) on public.rooms to anon, authenticated;

revoke select on public.room_participants from anon, authenticated;
grant select (
  id, room_id, display_name, remaining_budget, is_host, passes_used, created_at
) on public.room_participants to anon, authenticated;
