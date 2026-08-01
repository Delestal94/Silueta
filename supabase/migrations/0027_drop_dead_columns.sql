-- ============================================================
-- 0027: Remove columns left over from the pre-EA catalog
--
-- Nine columns were null for every single row: leftovers from the original
-- TheSportsDB import that the EA pipeline never fills. Two of them
-- (market_value, birth_location) were still read by the reveal card, so it
-- rendered fields that could never have a value.
--
-- Dropping them is lossless — there was nothing in them — and it means no
-- column in the table is entirely null.
-- Safe to re-run.
-- ============================================================

-- peak_rating fell back to prime_rating for players with no EA data. Since
-- migration 0026 every row must have ea_overall, so the fallback is dead code
-- and the column can go.
create or replace function public.peak_rating(p_player public.players)
returns integer language sql stable as $$
  select greatest(40, least(99,
    p_player.ea_overall - public.age_curve(
      extract(year from age(p_player.birth_date))::int
    )
  ));
$$;

alter table public.players
  drop column if exists wikidata_id,
  drop column if exists source_photo_url,
  drop column if exists birth_location,
  drop column if exists market_value,
  drop column if exists wage,
  drop column if exists cutout_url,
  drop column if exists status,
  drop column if exists prime_rating;

-- Kept: submitted_by is null for catalog players and set for community ones,
-- which is a real distinction rather than missing data.
