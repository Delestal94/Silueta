-- ============================================================
-- 0013: Hand the auctionable catalog over to EA-sourced rows
--
-- Rows imported before 0012 are keyed by sportsdb_id and carry no EA rating,
-- so they cannot be scored. They stay in the table because finished games
-- reference them, but they are no longer drawn into new auctions.
-- Safe to re-run.
-- ============================================================

-- Las leyendas retiradas tampoco tienen ea_id —no existen en el feed de EA, que
-- es el motivo por el que están curadas a mano— así que esta regla las apagaba
-- a todas. Y como el lote se corre entero cada vez, volvía a apagarlas después
-- de cada importación: nunca llegaron a salir en una subasta.
--
-- La columna que las distingue llega recién en 0037, así que sobre una base
-- que todavía no pasó por ahí hay que hacerlo como antes.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'players' and column_name = 'rating_is_peak'
  ) then
    update public.players
    set notable = false
    where ea_id is null and not coalesce(rating_is_peak, false);
  else
    update public.players
    set notable = false
    where ea_id is null;
  end if;
end $$;
