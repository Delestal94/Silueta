-- ============================================================
-- 0042: Poderes más baratos, salvo la lupa
--
-- Salen del mismo presupuesto con el que se compran jugadores, así que un
-- poder caro no es una decisión difícil: es una que nadie toma. Espejismo a 28
-- sobre 200 costaba un séptimo de la partida por una ronda.
--
-- Soplo queda en 10. Es el único que ayuda a quien lo tira en vez de perjudicar
-- a otro, y bajarlo lo volvería la jugada obvia de cada ronda.
--
-- Los precios viven en dos lados —acá y en lib/game/powers.ts— pero el que
-- cobra es este. El otro sólo los muestra.
--
-- Se puede volver a correr.
-- ============================================================

create or replace function public.power_cost(p_power text)
returns integer language sql immutable as $$
  select case p_power
    when 'soplo'     then 10  -- te muestra nacionalidad y club, sólo a vos
    when 'manotazo'  then  8  -- le quema el pase
    when 'traba'     then 10  -- no puede pujar en la primera mitad
    when 'apagon'    then 12  -- sin silueta
    when 'espejismo' then 18  -- ve la silueta de otro jugador
    when 'impuesto'  then 20  -- su próxima compra le cuesta el doble
    else null
  end;
$$;
