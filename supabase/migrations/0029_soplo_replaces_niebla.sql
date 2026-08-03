-- ============================================================
-- 0029: Replace "niebla" with "soplo"
--
-- Niebla and Apagón occupied the same axis and differed only in degree — a
-- blurred silhouette is a weaker blackout, so there was never a decision
-- between them: if you could afford Apagón, you cast Apagón.
--
-- Soplo opens an axis nothing else touched: instead of hurting a rival it
-- helps you, turning "who do I bother?" into "do I spend on them or on
-- myself?". It resolves against the round in play rather than the next one,
-- because a clue is worth nothing after the bidding it applies to.
-- Safe to re-run.
-- ============================================================

-- Nothing in a finished game referenced it, and the effect is cosmetic.
delete from public.power_effects where power = 'niebla';

alter table public.power_effects drop constraint if exists power_effects_power_check;
alter table public.power_effects
  add constraint power_effects_power_check
  check (power in ('soplo', 'apagon', 'espejismo', 'impuesto', 'traba', 'manotazo'));

create or replace function public.power_cost(p_power text)
returns integer language sql immutable as $$
  select case p_power
    when 'soplo'     then 10  -- te muestra nacionalidad y club, sólo a vos
    when 'manotazo'  then 12  -- le quema el pase
    when 'traba'     then 15  -- no puede pujar en la primera mitad
    when 'apagon'    then 18  -- sin silueta
    when 'espejismo' then 28  -- ve la silueta de otro jugador
    when 'impuesto'  then 30  -- su próxima compra le cuesta el doble
    else null
  end;
$$;

create or replace function public.cast_power(
  p_room uuid,
  p_client_token text,
  p_power text,
  p_target uuid
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_caster public.room_participants%rowtype;
  v_target public.room_participants%rowtype;
  v_cost   integer;
  v_effect public.power_effects%rowtype;
  v_round  public.auction_rounds%rowtype;
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

  -- Soplo is bought for yourself and answers the round already on screen.
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

  if p_power = 'manotazo' and v_target.passes_used >= 1 then
    return jsonb_build_object('error', 'target_has_no_pass');
  end if;

  if exists (
    select 1 from public.power_effects
    where target_id = p_target and status = 'pending'
  ) then
    return jsonb_build_object('error', 'target_already_hexed');
  end if;

  update public.room_participants
  set remaining_budget = remaining_budget - v_cost
  where id = v_caster.id;

  if p_power = 'manotazo' then
    update public.room_participants set passes_used = 1 where id = p_target;

    insert into public.power_effects (room_id, caster_id, target_id, power, cost, status)
    values (p_room, v_caster.id, p_target, p_power, v_cost, 'consumed')
    returning * into v_effect;

    return jsonb_build_object('effect', to_jsonb(v_effect), 'immediate', true);
  end if;

  insert into public.power_effects (room_id, caster_id, target_id, power, cost)
  values (p_room, v_caster.id, p_target, p_power, v_cost)
  returning * into v_effect;

  return jsonb_build_object('effect', to_jsonb(v_effect));
end;
$$;

-- Soplo must not be swept up as sabotage when the next round starts: it is
-- already resolved against the round it was bought in.
create or replace function public.active_power(p_participant uuid, p_round uuid)
returns text language sql stable as $$
  select power from public.power_effects
  where target_id = p_participant
    and round_id = p_round
    and status = 'active'
    and power <> 'soplo'
  limit 1;
$$;
