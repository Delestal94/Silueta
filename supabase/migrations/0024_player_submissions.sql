-- ============================================================
-- 0024: Community submissions with moderation
--
-- Anyone can propose a new player or a correction to an existing one, but
-- nothing reaches the catalog until it is approved. The catalog is shared by
-- every game at once, so a direct public write would let one visitor rename
-- players or swap in an offensive image for everybody, mid-match, with no
-- record of who did it.
--
-- Deletion is deliberately not offered: finished games reference their
-- signings, and removing a player would rewrite history.
-- Safe to re-run.
-- ============================================================

create table if not exists public.player_submissions (
  id               uuid primary key default uuid_generate_v4(),
  kind             text not null,
  target_player_id uuid references public.players(id) on delete cascade,
  submitted_by     text,
  payload          jsonb not null,
  status           text not null default 'pending',
  review_note      text,
  reviewed_at      timestamp with time zone,
  created_at       timestamp with time zone default now()
);

alter table public.player_submissions drop constraint if exists player_submissions_kind_check;
alter table public.player_submissions
  add constraint player_submissions_kind_check check (kind in ('new', 'edit'));

alter table public.player_submissions drop constraint if exists player_submissions_status_check;
alter table public.player_submissions
  add constraint player_submissions_status_check
  check (status in ('pending', 'approved', 'rejected'));

-- An edit has to point at something; a new player must not.
alter table public.player_submissions drop constraint if exists player_submissions_target_check;
alter table public.player_submissions
  add constraint player_submissions_target_check
  check (
    (kind = 'edit' and target_player_id is not null)
    or (kind = 'new' and target_player_id is null)
  );

create index if not exists idx_player_submissions_status
  on public.player_submissions (status, created_at desc);

alter table public.player_submissions enable row level security;
-- Everything goes through the API with the service role: the queue holds
-- unreviewed text from strangers and must not be publicly readable or writable.
revoke select on public.player_submissions from anon, authenticated;

-- Players created from a submission arrive without a silhouette, so they stay
-- out of auctions until the image pipeline has processed them.
alter table public.players
  add column if not exists submitted_by text,
  add column if not exists source_image_url text;
