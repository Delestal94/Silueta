// Pass is one per position, and a round nobody bid on is raffled among
// everyone who still needs that slot — sitting on your hands is not a way out.
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

console.log(`testing ${BASE}\n\nsorteo cuando nadie puja`);

const [, room] = await post('/api/rooms', {
  displayName: 'A',
  startingBudget: 300,
  roundSeconds: 10,
  pool: 'all',
});
const host = { 'x-host-token': room.hostToken };
const [, b] = await post(`/api/rooms/${room.code}/join`, { code: room.code, displayName: 'B' });
const [, c] = await post(`/api/rooms/${room.code}/join`, { code: room.code, displayName: 'C' });

const [, r1] = await post('/api/rounds', { roomId: room.roomId }, host);
const [, settled] = await post(`/api/rounds/${r1.round.id}/finalize`, { force: true }, host);

check('con tres interesados igual se adjudica', settled.round?.status === 'sold', settled.round?.status);
check('se marca como sorteado', settled.raffled === true, JSON.stringify(settled).slice(0, 90));
// El piso del sorteo pasó de 1 a 10 (migración 0041): quedarse quieto seguía
// saliendo casi gratis.
check('al precio mínimo', settled.round?.current_bid === 10, `${settled.round?.current_bid}`);

const afterRaffle = await state(room.code, room.clientToken);
const owners = afterRaffle.room.room_participants.filter((p) => p.team_players.length > 0);
check('exactamente uno se lo queda', owners.length === 1, `${owners.length}`);

console.log('\nel pase es uno por posición');

const [, r2] = await post('/api/rounds', { roomId: room.roomId }, host);
const pos2 = r2.round.position_type;

// Whoever won the raffle no longer needs a keeper; use someone who does.
const stillNeeds = afterRaffle.room.room_participants.find((p) => p.team_players.length === 0);
const token = [room.clientToken, b.clientToken, c.clientToken].find((t) => t);
const needsToken = [
  { id: afterRaffle.me.id, t: room.clientToken },
  { id: null, t: b.clientToken },
  { id: null, t: c.clientToken },
].map((x) => x.t);

let passer = null;
for (const t of needsToken) {
  const s = await state(room.code, t);
  if (s.me && s.room.room_participants.find((p) => p.id === s.me.id)?.team_players.length === 0) {
    passer = t;
    break;
  }
}

const [firstPass] = await post(`/api/rounds/${r2.round.id}/pass`, null, { 'x-client-token': passer });
check(`se puede pasar en ${pos2}`, firstPass === 200 || firstPass === 201, `got ${firstPass}`);

const [secondPass, secondBody] = await post(`/api/rounds/${r2.round.id}/pass`, null, {
  'x-client-token': passer,
});
check('no se puede pasar dos veces en la misma posición', secondPass >= 400,
  `got ${secondPass} ${secondBody.error ?? ''}`);

const withPasses = await state(room.code, passer);
const mine = withPasses.room.room_participants.find((p) => p.id === withPasses.me.id);
check('el estado expone el pase gastado', (mine.position_passes ?? []).length >= 1,
  JSON.stringify(mine.position_passes));
check('y sólo para esa posición',
  (mine.position_passes ?? []).every((p) => p.position_type === pos2),
  JSON.stringify(mine.position_passes));

console.log('\nranking global');

const res = await fetch(`${BASE}/api/leaderboard`);
const board = await j(res);
check('el ranking responde', res.status === 200, `got ${res.status}`);
check('devuelve una lista', Array.isArray(board.entries), JSON.stringify(board).slice(0, 80));
check('no pasa de 20', (board.entries ?? []).length <= 20, `${board.entries?.length}`);

console.log(`\n${ok} passed, ${fails.length} failed`);
if (fails.length) {
  fails.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
