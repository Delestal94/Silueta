-- ============================================================
-- 0054: Escudo y Reversa
--
-- Todos los poderes que había eran ofensivos: se compraban para hacerle algo a
-- otro. Estos dos se compran para uno mismo y sólo sirven si alguien te apunta,
-- que es una decisión distinta — gastás por si acaso.
--
--   Escudo   para el próximo poder que te tiren, y se gasta al hacerlo. El que
--            tira paga igual: tiró y se lo pararon, que es lo que un escudo
--            tiene que significar. Si no cobrara, probar saldría gratis y
--            cualquiera podría quemar escudos ajenos tirando al voleo.
--
--   Reversa  se lo devuelve. Ésta sí es silenciosa, y por eso cuesta más: el
--            que tira paga, cree que acertó, y descubre recién en la ronda
--            siguiente que se lo tiró a sí mismo.
--
-- Si están los dos, gana el escudo: bloqueado no queda nada que devolver.
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
    when 'escudo'    then 14  -- bloquea lo que te tiren
    when 'espejismo' then 18  -- ve la silueta de otro jugador
    when 'reversa'   then 20  -- se lo devuelve al que lo tiró
    when 'impuesto'  then 20  -- su próxima compra le cuesta el doble
    when 'empujon'   then 20  -- oferta 25 por él, quiera o no
    else null
  end;
$$;

alter table public.power_effects drop constraint if exists power_effects_power_check;
alter table public.power_effects
  add constraint power_effects_power_check
  check (power in (
    'soplo', 'apagon', 'espejismo', 'impuesto', 'traba', 'manotazo',
    'empujon', 'escudo', 'reversa'
  ));

-- ---------- tirar un poder, con las defensas de por medio ----------

CREATE OR REPLACE FUNCTION public.cast_power(p_room uuid, p_client_token text, p_power text, p_target uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_caster public.room_participants%rowtype;
  v_target public.room_participants%rowtype;
  v_cost   integer;
  v_effect public.power_effects%rowtype;
  v_round  public.auction_rounds%rowtype;
  v_pos    text;
  v_defensa public.power_effects%rowtype;
  v_victima uuid;
  v_devuelto boolean := false;
begin
  v_cost := public.power_cost(p_power);
  if v_cost is null then
    return jsonb_build_object('error', 'unknown_power');
  end if;

  select * into v_caster
  from public.room_participants
  where room_id = p_room and client_token = p_client_token
  for update;

  if not found then
    return jsonb_build_object('error', 'not_a_participant');
  end if;

  if v_caster.remaining_budget < v_cost then
    return jsonb_build_object('error', 'insufficient_budget');
  end if;

  if p_power = 'soplo' then
    select * into v_round
    from public.auction_rounds
    where room_id = p_room and status = 'active'
    order by created_at desc
    limit 1;

    if not found then
      return jsonb_build_object('error', 'no_active_round');
    end if;

    if exists (
      select 1 from public.power_effects
      where target_id = v_caster.id and round_id = v_round.id and power = 'soplo'
    ) then
      return jsonb_build_object('error', 'already_bought_tip');
    end if;

    update public.room_participants
    set remaining_budget = remaining_budget - v_cost
    where id = v_caster.id;

    insert into public.power_effects (
      room_id, caster_id, target_id, power, cost, round_id, status
    )
    values (p_room, v_caster.id, v_caster.id, p_power, v_cost, v_round.id, 'active')
    returning * into v_effect;

    return jsonb_build_object('effect', to_jsonb(v_effect), 'immediate', true);
  end if;

  -- Defensivos: se compran para uno mismo y quedan esperando la próxima ronda,
  -- que es cuando aterrizan los poderes hostiles.
  if p_power in ('escudo', 'reversa') then
    if exists (
      select 1 from public.power_effects
      where target_id = v_caster.id and power = p_power and status = 'pending'
    ) then
      return jsonb_build_object('error', 'already_defended');
    end if;

    update public.room_participants
    set remaining_budget = remaining_budget - v_cost
    where id = v_caster.id;

    insert into public.power_effects (room_id, caster_id, target_id, power, cost)
    values (p_room, v_caster.id, v_caster.id, p_power, v_cost)
    returning * into v_effect;

    return jsonb_build_object('effect', to_jsonb(v_effect), 'defensive', true);
  end if;

  if v_caster.id = p_target then
    return jsonb_build_object('error', 'cannot_target_self');
  end if;

  select * into v_target
  from public.room_participants
  where id = p_target and room_id = p_room
  for update;

  if not found then
    return jsonb_build_object('error', 'target_not_found');
  end if;

  select current_position into v_pos from public.rooms where id = p_room;
  v_pos := coalesce(v_pos, 'goalkeeper');

  if p_power = 'manotazo' and not public.has_pass(v_victima, v_pos) then
    return jsonb_build_object('error', 'target_has_no_pass');
  end if;

  -- El escudo para un golpe y se gasta. Al que tiró se le cobra: si parar
  -- saliera gratis para el atacante, probar al voleo sería la jugada obvia y
  -- los escudos ajenos se quemarían sin costo.
  v_defensa := null;

  select * into v_defensa
  from public.power_effects
  where target_id = p_target and power = 'escudo' and status = 'pending'
  limit 1;

  if v_defensa.id is not null then
    update public.room_participants
    set remaining_budget = remaining_budget - v_cost
    where id = v_caster.id;

    update public.power_effects set status = 'consumed' where id = v_defensa.id;

    return jsonb_build_object('blocked', true, 'power', p_power);
  end if;

  -- La reversa sí es silenciosa, y por eso cuesta más: el que tira paga, cree
  -- que acertó, y descubre en la ronda siguiente que se lo tiró a sí mismo.
  v_defensa := null;

  select * into v_defensa
  from public.power_effects
  where target_id = p_target and power = 'reversa' and status = 'pending'
  limit 1;

  v_victima := p_target;

  -- Se mira el id y no FOUND: en PL/pgSQL una asignación se ejecuta como una
  -- consulta y pisa FOUND, así que el `v_victima := p_target` de arriba
  -- borraba el resultado del select y la reversa nunca se disparaba.
  if v_defensa.id is not null then
    v_victima := v_caster.id;
    v_devuelto := true;
    update public.power_effects set status = 'consumed' where id = v_defensa.id;
  end if;

  -- Sólo los hostiles cuentan como "ya tiene uno esperando". Un escudo o una
  -- reversa se guardan igual, apuntando a uno mismo, y contándolos el escudo
  -- pasaba a ser invulnerabilidad: nadie podía apuntarle a quien lo tuviera.
  if exists (
    select 1 from public.power_effects
    where target_id = v_victima
      and status = 'pending'
      and power not in ('escudo', 'reversa')
  ) then
    return jsonb_build_object('error', 'target_already_hexed');
  end if;

  update public.room_participants
  set remaining_budget = remaining_budget - v_cost
  where id = v_caster.id;

  -- De acá para abajo se usa v_victima y no p_target: si había reversa, el
  -- poder le cae al que lo tiró.
  if p_power = 'manotazo' then
    insert into public.position_passes (participant_id, position_type)
    values (v_victima, v_pos)
    on conflict do nothing;

    update public.room_participants
    set passes_used = (
      select count(*) from public.position_passes where participant_id = v_victima
    )
    where id = v_victima;

    insert into public.power_effects (room_id, caster_id, target_id, power, cost, status)
    values (p_room, v_caster.id, v_victima, p_power, v_cost, 'consumed')
    returning * into v_effect;

    return jsonb_build_object('effect', to_jsonb(v_effect), 'immediate', true);
  end if;

  insert into public.power_effects (room_id, caster_id, target_id, power, cost)
  values (p_room, v_caster.id, v_victima, p_power, v_cost)
  returning * into v_effect;

  return jsonb_build_object('effect', to_jsonb(v_effect));
end;
$function$
;
