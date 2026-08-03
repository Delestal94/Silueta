-- ============================================================
-- 0037: Do not re-inflate a rating that is already a peak
--
-- peak_rating exists for active players: EA reports what someone is worth
-- today, so a 34-year-old's peak is higher than his current rating and gets
-- scaled back up.
--
-- Legends are curated at their peak, but the same maths still ran on them, and
-- because they are all "old" by birth date it pushed them up: Maradona was
-- entered at 95 and came out at 99 in his prime, with every legend past 31
-- gaining between 2 and 9 points they were never given.
-- Safe to re-run.
-- ============================================================

alter table public.players
  add column if not exists rating_is_peak boolean not null default false;

update public.players set rating_is_peak = true where league = 'Leyendas';

create or replace function public.peak_rating(p_player public.players)
returns integer language sql stable as $$
  select greatest(40, least(99,
    case
      -- Curated at their best already; ageing it backwards would invent points.
      when p_player.rating_is_peak then p_player.ea_overall
      else p_player.ea_overall - public.age_curve(
        extract(year from age(p_player.birth_date))::int
      )
    end
  ));
$$;
