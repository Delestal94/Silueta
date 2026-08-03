// The server clock is the only one that decides when a round ends. A client
// whose clock runs fast must not be able to cut the bidding short for
// everyone — by accident or on purpose.
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  displayName: 'A',
  startingBudget: 200,
  roundSeconds: 12,
  pool: 'all',
});
const host = { 'x-host-token': room.hostToken };
const [, guest] = await post(`/api/rooms/${room.code}/join`, {
  code: room.code,
  displayName: 'B',
});

console.log('el reloj del servidor manda');

const [, started] = await post('/api/rounds', { roomId: room.roomId }, host);
const roundId = started.round.id;

// A client convinced the round is over asks to settle it early.
const [early, earlyBody] = await post(`/api/rounds/${roundId}/finalize`);
check('rechaza cerrar antes de tiempo', early === 409, `got ${early}`);
check('informa cuánto falta', typeof earlyBody.ms_left === 'number' && earlyBody.ms_left > 0,
  JSON.stringify(earlyBody));

const mid = await state(room.code, room.clientToken);
check('la ronda sigue abierta', mid.currentRound?.status === 'active');

// Bidding still works while it is open.
const [bid] = await post(`/api/rounds/${roundId}/bid`, { amount: 5 }, { 'x-client-token': guest.clientToken });
check('se puede pujar mientras tanto', bid === 201, `got ${bid}`);

console.log('\nel estado publica un reloj compartido');

const snap = await state(room.code, room.clientToken);
check('el estado incluye serverTime', typeof snap.serverTime === 'string', snap.serverTime);
const skew = Math.abs(new Date(snap.serverTime).getTime() - Date.now());
check('serverTime es plausible (menos de 1 min de este reloj)', skew < 60000, `${skew}ms`);

console.log('\nvencida, se cierra');

// The bid restarted the clock, so wait out a fresh round.
await sleep(13000);

const [late, lateBody] = await post(`/api/rounds/${roundId}/finalize`);
check('ya vencida, se cierra', late === 200, `got ${late} ${JSON.stringify(lateBody).slice(0, 80)}`);

const after = await state(room.code, room.clientToken);
check('quedó vendida', after.currentRound?.status === 'sold', after.currentRound?.status);

console.log('\nuna ronda abandonada no bloquea la sala');

const [, room2] = await post('/api/rooms', {
  displayName: 'C',
  startingBudget: 200,
  roundSeconds: 8,
  pool: 'all',
});
await post(`/api/rooms/${room2.code}/join`, { code: room2.code, displayName: 'D' });
await post('/api/rounds', { roomId: room2.roomId }, { 'x-host-token': room2.hostToken });

// Nobody calls finalize: just let it expire and read the room.
await sleep(9500);
const swept = await state(room2.code, room2.clientToken);
check('la lectura del estado la barre sola', swept.currentRound?.status !== 'active',
  swept.currentRound?.status);

const [next] = await post('/api/rounds', { roomId: room2.roomId }, { 'x-host-token': room2.hostToken });
check('y la siguiente ronda arranca igual', next === 201, `got ${next}`);

console.log(`\n${ok} passed, ${fails.length} failed`);
if (fails.length) {
  fails.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
