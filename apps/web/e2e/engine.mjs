// Game-engine tests against a running dev server.
//   node apps/web/e2e/engine.mjs [baseUrl]
const BASE = process.argv[2] || process.env.BASE_URL || 'http://localhost:3000';

const j = async (r) => {
  try {
    return await r.json();
  } catch {
    return {};
  }
};
const post = (p, body, headers = {}) =>
  fetch(BASE + p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (r) => [r.status, await j(r)]);
const get = (p, headers = {}) => fetch(BASE + p, { headers }).then(j);

let passed = 0;
const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL ${name} ${detail}`);
  }
};

async function auctionRules() {
  console.log('\nauction rules');
  const [, room] = await post('/api/rooms', {
    displayName: 'Davo',
    startingBudget: 100,
    roundSeconds: 8,
  });
  const host = { 'x-host-token': room.hostToken };
  const [, p2] = await post(`/api/rooms/${room.code}/join`, {
    code: room.code,
    displayName: 'Cobra',
  });
  const [, p3] = await post(`/api/rooms/${room.code}/join`, { code: room.code, displayName: 'Teo' });

  const [dup] = await post(`/api/rooms/${room.code}/join`, {
    code: room.code,
    displayName: 'cobra',
  });
  check('duplicate display name rejected', dup === 409, `got ${dup}`);

  const [notHost] = await post('/api/rounds', { roomId: room.roomId }, { 'x-host-token': 'bogus' });
  check('non-host cannot start a round', notHost === 403, `got ${notHost}`);

  const [, r1] = await post('/api/rounds', { roomId: room.roomId }, host);
  check('round starts', !!r1.round);
  check('first position is goalkeeper', r1.round?.position_type === 'goalkeeper');

  const state = await get(`/api/rooms/${room.code}/state`, { 'x-client-token': room.clientToken });
  check('identity hidden while bidding', state.currentRound?.player?.name === undefined);
  check('silhouette is served', !!state.currentRound?.player?.silhouette_url);

  const [double] = await post('/api/rounds', { roomId: room.roomId }, host);
  check('cannot start while a round runs', double === 409, `got ${double}`);

  const round = r1.round.id;
  const [zero] = await post(`/api/rounds/${round}/bid`, { amount: 0 }, { 'x-client-token': room.clientToken });
  check('zero bid rejected', zero === 400, `got ${zero}`);

  const [over] = await post(`/api/rounds/${round}/bid`, { amount: 999 }, { 'x-client-token': room.clientToken });
  check('over-budget bid rejected', over === 400, `got ${over}`);

  const [first] = await post(`/api/rounds/${round}/bid`, { amount: 10 }, { 'x-client-token': room.clientToken });
  check('valid bid accepted', first === 201, `got ${first}`);

  const [tie] = await post(`/api/rounds/${round}/bid`, { amount: 10 }, { 'x-client-token': p2.clientToken });
  check('equal bid rejected', tie === 400, `got ${tie}`);

  const [raise] = await post(`/api/rounds/${round}/bid`, { amount: 25 }, { 'x-client-token': p2.clientToken });
  check('higher bid accepted', raise === 201, `got ${raise}`);

  const [, fin1] = await post(`/api/rounds/${round}/finalize`, { force: true }, host);
  const [, fin2] = await post(`/api/rounds/${round}/finalize`, { force: true }, host);
  check('finalize settles the round', fin1.round?.status === 'sold');
  check('finalize is idempotent', fin2.already_final === true);

  const after = await get(`/api/rooms/${room.code}/state`);
  const cobra = after.room.room_participants.find((p) => p.display_name === 'Cobra');
  check('winner charged exactly once', cobra.remaining_budget === 75, `budget ${cobra.remaining_budget}`);
  check('winner holds exactly one player', cobra.team_players.length === 1);
  check('identity revealed after the sale', !!after.currentRound?.player?.name);

  const [, r2] = await post('/api/rounds', { roomId: room.roomId }, host);
  const [full, fullBody] = await post(`/api/rounds/${r2.round.id}/bid`, { amount: 5 }, { 'x-client-token': p2.clientToken });
  check('cannot exceed a position requirement', full === 400, `got ${full} ${fullBody.error}`);

  const [other] = await post(`/api/rounds/${r2.round.id}/bid`, { amount: 5 }, { 'x-client-token': p3.clientToken });
  check('a participant who still needs it can bid', other === 201, `got ${other}`);
}

async function passAndFlip() {
  console.log('\npass and coin flip');
  const [, room] = await post('/api/rooms', {
    displayName: 'A',
    startingBudget: 100,
    roundSeconds: 60,
  });
  const host = { 'x-host-token': room.hostToken };
  const [, b] = await post(`/api/rooms/${room.code}/join`, { code: room.code, displayName: 'B' });

  const [, r] = await post('/api/rounds', { roomId: room.roomId }, host);
  const round = r.round.id;

  const [s1, d1] = await post(`/api/rounds/${round}/pass`, null, { 'x-client-token': room.clientToken });
  check('a lone pass only opts out', s1 === 200 && d1.passed === true && !d1.coin_flip);

  const [s2] = await post(`/api/rounds/${round}/pass`, null, { 'x-client-token': room.clientToken });
  check('cannot pass twice in one round', s2 === 400, `got ${s2}`);

  const [s3, d3] = await post(`/api/rounds/${round}/pass`, null, { 'x-client-token': b.clientToken });
  check('the last pass triggers the flip', s3 === 200 && d3.coin_flip === true);
  check('the flip picks a winner', !!d3.coin_flip_winner);

  await post(`/api/rounds/${round}/finalize`, { force: true }, host);
  const state = await get(`/api/rooms/${room.code}/state`);
  const owners = state.room.room_participants.filter((p) => p.team_players.length === 1);
  check('exactly one participant gets the player', owners.length === 1, `got ${owners.length}`);
  check('assigned at the flip price', owners[0]?.remaining_budget === 99);

  // The flip winner now has the position filled, and that check fires before the
  // pass-quota one, so ask the loser to prove passes are once per game.
  const loser = state.room.room_participants.find((p) => p.team_players.length === 0);
  const loserToken = loser.display_name === 'A' ? room.clientToken : b.clientToken;

  const [, r2] = await post('/api/rounds', { roomId: room.roomId }, host);
  const [s4, d4] = await post(`/api/rounds/${r2.round.id}/pass`, null, { 'x-client-token': loserToken });
  check('a pass is limited to one per game', s4 === 400 && /único/.test(d4.error || ''), `${s4} ${d4.error}`);
}

async function fullGame() {
  console.log('\nfull game to completion');
  const [, room] = await post('/api/rooms', {
    displayName: 'Davo',
    startingBudget: 300,
    roundSeconds: 60,
  });
  const host = { 'x-host-token': room.hostToken };
  const [, b] = await post(`/api/rooms/${room.code}/join`, { code: room.code, displayName: 'Cobra' });
  const tokens = [room.clientToken, b.clientToken];

  const sequence = [];
  let rounds = 0;

  for (let i = 0; i < 40; i++) {
    const [, r] = await post('/api/rounds', { roomId: room.roomId }, host);
    if (r.finished) break;
    if (!r.round) break;

    rounds++;
    if (sequence[sequence.length - 1] !== r.round.position_type) sequence.push(r.round.position_type);

    for (const token of tokens) {
      const [s] = await post(`/api/rounds/${r.round.id}/bid`, { amount: 2 }, { 'x-client-token': token });
      if (s === 201) break;
    }
    await post(`/api/rounds/${r.round.id}/finalize`, { force: true }, host);
  }

  const state = await get(`/api/rooms/${room.code}/state`);
  check('game reaches the finished state', state.room.status === 'finished', state.room.status);
  check(
    'positions advance in order',
    sequence.join(',') === 'goalkeeper,defender,midfielder,forward',
    sequence.join(',')
  );
  check('every round sold a player', rounds === 10, `rounds ${rounds}`);

  for (const p of state.room.room_participants) {
    const counts = { goalkeeper: 0, defender: 0, midfielder: 0, forward: 0 };
    for (const s of p.team_players) counts[s.players.position_type]++;
    check(
      `${p.display_name} ends with a legal squad`,
      counts.goalkeeper === 1 && counts.defender === 2 && counts.midfielder === 1 && counts.forward === 1,
      JSON.stringify(counts)
    );
    check(
      `${p.display_name} has no duplicate players`,
      new Set(p.team_players.map((s) => s.players.id)).size === p.team_players.length
    );
  }
}

console.log(`testing ${BASE}`);
await auctionRules();
await passAndFlip();
await fullGame();

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
