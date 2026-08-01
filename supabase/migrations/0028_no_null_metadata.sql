-- ============================================================
-- 0028: Give the remaining nullable columns a meaningful default
--
-- These held null not because the data was missing but because nobody had
-- decided what "not applicable" looked like:
--
--   submitted_by  null meant "came from EA" — now it says so.
--   fame_score    null meant "not measured yet" — 0 says the same and sorts
--                 correctly, so the famous pool no longer has to special-case it.
--   fame_rank     null meant "outside the pool" — a large number means that
--                 too, and comparisons stop needing an is-not-null guard.
--
-- description stays nullable on purpose: it is flavour text from a secondary
-- source, not something the game depends on, and inventing one would be worse
-- than leaving it empty.
-- Safe to re-run.
-- ============================================================

update public.players set submitted_by = 'EA FC' where submitted_by is null;
alter table public.players alter column submitted_by set default 'EA FC';
alter table public.players alter column submitted_by set not null;

update public.players set fame_score = 0 where fame_score is null;
alter table public.players alter column fame_score set default 0;
alter table public.players alter column fame_score set not null;

-- Beyond any realistic famous_depth(), so an unranked player is simply far
-- down the list rather than a null that every comparison has to dodge.
update public.players set fame_rank = 99999 where fame_rank is null;
alter table public.players alter column fame_rank set default 99999;
alter table public.players alter column fame_rank set not null;

-- Unranked players must land at the bottom, not keep a stale rank.
create or replace function public.refresh_fame_ranks()
returns void
language sql
as $$
  with ranked as (
    select
      id,
      row_number() over (
        partition by gender, position_type
        order by fame_score desc, ea_rank asc
      ) as rn
    from public.players
    where notable
  )
  update public.players p
  set fame_rank = coalesce(ranked.rn, 99999)
  from ranked
  where ranked.id = p.id;
$$;
