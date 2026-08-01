-- ============================================================
-- 0019: A bid restarts the clock
--
-- The round used to keep its original deadline, only nudged to at least five
-- seconds so a last-instant bid could be answered. That meant an auction
-- ended when the timer ran out rather than when the bidding stopped. Now each
-- bid resets the full round time, so a player is sold once nobody answers.
-- Safe to re-run.
-- ============================================================

create or replace function public.place_bid(p_round uuid, p_client_token text, p_amount integer)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_round       public.auction_rounds%rowtype;
  v_participant public.room_participants%rowtype;
  v_seconds     integer;
begin
  select * into v_round from public.auction_rounds where id = p_round for update;
  if not found then
    return jsonb_build_object('error', 'round_not_found');
  end if;

  if v_round.status <> 'active' then
    return jsonb_build_object('error', 'round_closed');
  end if;

  if v_round.ends_at <= now() then
    return jsonb_build_object('error', 'round_expired');
  end if;

  select * into v_participant
  from public.room_participants
  where room_id = v_round.room_id and client_token = p_client_token;

  if not found then
    return jsonb_build_object('error', 'not_a_participant');
  end if;

  if p_amount <= coalesce(v_round.current_bid, 0) then
    return jsonb_build_object('error', 'bid_too_low');
  end if;

  if p_amount > v_participant.remaining_budget then
    return jsonb_build_object('error', 'insufficient_budget');
  end if;

  if public.slots_remaining(v_participant.id, v_round.position_type) <= 0 then
    return jsonb_build_object('error', 'position_already_full');
  end if;

  select round_seconds into v_seconds from public.rooms where id = v_round.room_id;

  insert into public.bids (round_id, participant_id, amount)
  values (p_round, v_participant.id, p_amount);

  update public.auction_rounds
  set current_bid = p_amount,
      current_bid_by = v_participant.id,
      ends_at = now() + make_interval(secs => coalesce(v_seconds, 20))
  where id = p_round
  returning * into v_round;

  return jsonb_build_object('round', to_jsonb(v_round));
end;
$$;
