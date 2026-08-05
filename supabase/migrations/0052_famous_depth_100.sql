-- ============================================================
-- 0052: El pool de famosos pasa de 50 a 100 por puesto
--
-- Con 50, las leyendas seguían siendo la mitad de las rondas de delanteros: son
-- 25 y su fama está puesta a mano y bien alta, así que ocupan siempre la cima
-- del ranking y ampliar el pool sólo agrega gente por debajo. Con 100 caen al
-- 25%, que ya es una aparición y no la regla.
--
-- Repartos que quedan, masculino: delanteros 25%, mediocampistas 12%,
-- defensores 11%, arqueros 6%.
--
-- El costo sigue siendo el mismo y conviene tenerlo escrito: del puesto 51 al
-- 100 entran jugadores bastante menos reconocibles, que es justo lo que el
-- catálogo "más famosos" existe para evitar. Quien quiera el pool angosto tiene
-- el catálogo equilibrado, que ataca el problema por el otro lado.
--
-- Los cuatro puestos de los dos géneros tienen al menos 100, así que ninguno
-- queda corto. El de arqueras es exactamente 100: ahí "más famosos" y "todos"
-- pasan a ser lo mismo, que es correcto — no hay más de dónde elegir.
--
-- Se puede volver a correr.
-- ============================================================

create or replace function public.famous_depth()
returns integer language sql immutable as $$ select 100; $$;
