-- ============================================================
-- 0002: Full player catalog, data integrity, and realtime
-- Safe to re-run.
-- ============================================================

-- ---------- Player catalog metadata ----------
alter table public.players
  add column if not exists sportsdb_id   text,
  add column if not exists position_type text,
  add column if not exists team          text,
  add column if not exists league        text,
  add column if not exists shirt_number  text,
  add column if not exists birth_date    date,
  add column if not exists birth_location text,
  add column if not exists height        text,
  add column if not exists weight        text,
  add column if not exists foot          text,
  add column if not exists market_value  text,
  add column if not exists wage          text,
  add column if not exists description   text,
  add column if not exists photo_url     text,
  add column if not exists cutout_url    text,
  add column if not exists status        text;

-- club was NOT NULL in 0001 but the catalog uses `team`; relax it.
alter table public.players alter column club drop not null;

create unique index if not exists players_sportsdb_id_key
  on public.players (sportsdb_id) where sportsdb_id is not null;

create index if not exists idx_players_position_type on public.players (position_type);

alter table public.players
  drop constraint if exists players_position_type_check;
alter table public.players
  add constraint players_position_type_check
  check (position_type is null or position_type in ('goalkeeper','defender','midfielder','forward'));

-- ---------- Game integrity ----------
alter table public.room_participants
  add column if not exists passes_used integer not null default 0;

alter table public.auction_rounds
  add column if not exists position_type text,
  add column if not exists round_number  integer default 1;

-- A participant can never hold the same player twice.
create unique index if not exists team_players_unique_signing
  on public.team_players (room_id, participant_id, player_id);

-- A player can only be auctioned once per room.
create unique index if not exists auction_rounds_unique_player_per_room
  on public.auction_rounds (room_id, player_id);

-- ---------- Realtime ----------
-- Realtime only delivers changes for tables in this publication.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

do $$
declare t text;
begin
  foreach t in array array['auction_rounds','room_participants','bids','team_players','rooms']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Realtime payloads need the full row to diff participant/round state.
alter table public.auction_rounds    replica identity full;
alter table public.room_participants replica identity full;
alter table public.team_players      replica identity full;
alter table public.bids              replica identity full;
