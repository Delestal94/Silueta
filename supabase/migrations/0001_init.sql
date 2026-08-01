-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Players table
create table public.players (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  club text not null,
  position text not null,
  nationality text,
  wikidata_id text unique,
  silhouette_url text,
  source_photo_url text,
  created_at timestamp with time zone default now()
);

-- Rooms table
create table public.rooms (
  id uuid primary key default uuid_generate_v4(),
  code text unique not null,
  host_token text not null,
  status text not null default 'lobby' check (status in ('lobby', 'active', 'finished')),
  starting_budget integer not null default 100,
  created_at timestamp with time zone default now()
);

-- Room participants table
create table public.room_participants (
  id uuid primary key default uuid_generate_v4(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  display_name text not null,
  client_token text not null,
  remaining_budget integer not null,
  is_host boolean default false,
  created_at timestamp with time zone default now(),
  unique(room_id, client_token)
);

-- Auction rounds table
create table public.auction_rounds (
  id uuid primary key default uuid_generate_v4(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.players(id),
  status text not null default 'pending' check (status in ('pending', 'active', 'sold')),
  current_bid integer default 0,
  current_bid_by uuid references public.room_participants(id),
  starts_at timestamp with time zone,
  ends_at timestamp with time zone,
  created_at timestamp with time zone default now()
);

-- Bids table
create table public.bids (
  id uuid primary key default uuid_generate_v4(),
  round_id uuid not null references public.auction_rounds(id) on delete cascade,
  participant_id uuid not null references public.room_participants(id),
  amount integer not null,
  created_at timestamp with time zone default now()
);

-- Team players (final roster)
create table public.team_players (
  id uuid primary key default uuid_generate_v4(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  participant_id uuid not null references public.room_participants(id),
  player_id uuid not null references public.players(id),
  purchase_price integer not null,
  created_at timestamp with time zone default now()
);

-- Create indexes for performance
create index idx_room_participants_room_id on public.room_participants(room_id);
create index idx_auction_rounds_room_id on public.auction_rounds(room_id);
create index idx_auction_rounds_status on public.auction_rounds(status);
create index idx_bids_round_id on public.bids(round_id);
create index idx_team_players_room_id on public.team_players(room_id);
create index idx_team_players_participant_id on public.team_players(participant_id);

-- Enable RLS
alter table public.players enable row level security;
alter table public.rooms enable row level security;
alter table public.room_participants enable row level security;
alter table public.auction_rounds enable row level security;
alter table public.bids enable row level security;
alter table public.team_players enable row level security;

-- RLS Policies
-- Players: public read
create policy "Players are viewable by everyone"
  on public.players for select
  using (true);

-- Rooms: public read for code-based access, write for host token
create policy "Rooms readable by room_id"
  on public.rooms for select
  using (true);

-- Room participants: read own room's participants
create policy "Participants readable within their room"
  on public.room_participants for select
  using (exists (
    select 1 from public.rooms
    where rooms.id = room_participants.room_id
  ));

-- Auction rounds: read own room's rounds
create policy "Rounds readable within their room"
  on public.auction_rounds for select
  using (exists (
    select 1 from public.rooms
    where rooms.id = auction_rounds.room_id
  ));

-- Bids: read own room's bids
create policy "Bids readable within their room"
  on public.bids for select
  using (exists (
    select 1 from public.auction_rounds ar
    join public.rooms r on r.id = ar.room_id
    where ar.id = bids.round_id
  ));

-- Team players: read own room's team players
create policy "Team players readable within their room"
  on public.team_players for select
  using (exists (
    select 1 from public.rooms
    where rooms.id = team_players.room_id
  ));
