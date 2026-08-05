-- ============================================================
-- 0049: Limpiar el club de las leyendas
--
-- TheSportsDB guarda a los retirados bajo equipos que son etiquetas internas
-- suyas, no clubes: "_Retired Soccer", "_Deceased Soccer". Eso se muestra tal
-- cual en la carta de revelación, así que al comprar a Maradona la ficha decía
-- que juega en "_Deceased Soccer".
--
-- Se puede volver a correr.
-- ============================================================

update public.players
set team = 'Retirado',
    club = 'Retirado'
where rating_is_peak
  and (team like '\_%' or club like '\_%');
