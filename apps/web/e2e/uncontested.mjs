// When only one participant still needs the position and nobody bids, the
// player must be handed to them. Otherwise the slot never fills and the game
// cannot finish.
const BASE = process.argv[2] || 'http://localhost:3000';

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
const state = (code, token) =>
  fetch(`${BASE}/api/rooms/${code}/state`, {
    headers: token ? { 'x-client-token': token } : {},
  }).then(j);

let ok = 0;
const fails = [];
const check = (name, cond, detail = '') => {
  if (cond) {
    ok++;
    console.log(`  ok   ${name}`);
  } else {
    fails.push(name);
    console.log(`  FAIL ${name} ${detail}`);
  }
};

console.log(`testing ${BASE}\n`);

const [, room] = await post('/api/rooms', {
  displayName: 'Solo',
  startingBudget: 300,
  roundSeconds: 8,
  pool: 'all',
});
const host = { 'x-host-token': room.hostToken };
const [, rival] = await post(`/api/rooms/${room.code}/join`, {
  code: room.code,
  displayName: 'Rival',
});

// Round 1: the rival takes the goalkeeper, so only "Solo" still needs one.
const [, r1] = await post('/api/rounds', { roomId: room.roomId }, host);
await post(`/api/rounds/${r1.round.id}/bid`, { amount: 5 }, { 'x-client-token': rival.clientToken });
await post(`/api/rounds/${r1.round.id}/finalize`);

const mid = await state(room.code, room.clientToken);
const rivalCounts = mid.room.room_participants.find((p) => p.display_name === 'Rival');
check('el rival llenó su arquero', rivalCounts.team_players.length === 1);

// Round 2: still goalkeeper, and now only "Solo" needs it. Nobody bids.
const [, r2] = await post('/api/rounds', { roomId: room.roomId }, host);
check('sigue ofreciendo arquero', r2.round?.position_type === 'goalkeeper', r2.round?.position_type);

const [, settled] = await post(`/api/rounds/${r2.round.id}/finalize`);
check('se asigna sin puja', settled.uncontested === true, JSON.stringify(settled).slice(0, 120));
check('queda como vendido', settled.round?.status === 'sold', settled.round?.status);

const after = await state(room.code, room.clientToken);
const solo = after.room.room_participants.find((p) => p.display_name === 'Solo');
check('el último en necesitarlo se lo queda', solo.team_players.length === 1, `tiene ${solo.team_players.length}`);
check('a precio mínimo', solo.team_players[0]?.purchase_price === 1, `pagó ${solo.team_players[0]?.purchase_price}`);
check('y suma sus puntos', (solo.team_players[0]?.rating ?? 0) > 0);

// With two still needing the position, an empty round stays unsold.
const [, room2] = await post('/api/rooms', {
  displayName: 'A',
  startingBudget: 300,
  roundSeconds: 8,
  pool: 'all',
});
await post(`/api/rooms/${room2.code}/join`, { code: room2.code, displayName: 'B' });
const [, r3] = await post('/api/rounds', { roomId: room2.roomId }, { 'x-host-token': room2.hostToken });
const [, unsold] = await post(`/api/rounds/${r3.round.id}/finalize`);
check('con dos interesados sigue quedando desierta', unsold.round?.status === 'unsold', unsold.round?.status);

console.log(`\n${ok} passed, ${fails.length} failed`);
if (fails.length) {
  fails.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
