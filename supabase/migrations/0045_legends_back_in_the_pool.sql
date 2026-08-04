-- ============================================================
-- 0045: Devolver las leyendas al pool
--
-- 0013 apaga a los jugadores sin ea_id, para dejar afuera las filas viejas
-- anteriores a EA. Las leyendas tampoco tienen ea_id —no existen en el feed de
-- EA, que es la razón por la que están curadas a mano— así que caían en la
-- misma red. Y como el lote de migraciones se corre entero cada vez, cada
-- corrida las volvía a apagar después de importarlas: nunca salieron en una
-- subasta.
--
-- 0013 ya las respeta. Esto repara las que quedaron apagadas.
--
-- Se puede volver a correr.
-- ============================================================

update public.players
set notable = true
where rating_is_peak and not notable;

-- El ranking de fama se calculaba sólo sobre filas con ea_id, así que a las
-- leyendas no las alcanzaba nunca — y sin fame_rank quedaban fuera del pool de
-- "más famosos" incluso estando encendidas. Su fama es un valor puesto a mano
-- justamente porque no hay de dónde medirla.
create or replace function public.refresh_fame_ranks()
returns void
language sql
as $$
  with ranked as (
    select
      id,
      row_number() over (
        partition by gender, position_type
        order by coalesce(fame_score, 0) desc, ea_rank asc nulls last
      ) as rn
    from public.players
    where notable
  )
  update public.players p
  set fame_rank = ranked.rn
  from ranked
  where ranked.id = p.id;
$$;

select public.refresh_fame_ranks();
