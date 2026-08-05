-- ============================================================
-- 0048: El pool de famosos pasa de 20 a 50 por puesto
--
-- Con 20, la ronda de delanteros masculinos elegía entre veinte y catorce eran
-- leyendas: salía una leyenda siete de cada diez veces. No porque se hubieran
-- agregado demasiadas, sino porque su fama está puesta a mano y bien alta —no
-- hay de dónde medirla— y en un pool de veinte eso las deja arriba de todo.
--
-- Con 50 el pool se abre y las leyendas vuelven a ser lo que tienen que ser:
-- una aparición, no la regla.
--
-- El costo es real y conviene tenerlo a la vista: del puesto 21 al 50 entran
-- jugadores bastante menos reconocibles, que es exactamente lo que el catálogo
-- "más famosos" existe para evitar. Quien quiera el pool angosto de antes tiene
-- el interruptor de leyendas, que ataca el problema por el otro lado.
--
-- Se puede volver a correr.
-- ============================================================

create or replace function public.famous_depth()
returns integer language sql immutable as $$ select 50; $$;
