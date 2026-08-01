// Sabotage powers. The important property is that effects are resolved
// per-viewer on the server: a victim must never receive the data they are
// supposed to be denied.
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

async function room(seconds = 30) {
  const [, r] = await post('/api/rooms', {
    displayName: 'Atacante',
    startingBudget: 300,
    roundSeconds: seconds,
    pool: 'all',
  });
  const [, victim] = await post(`/api/rooms/${r.code}/join`, {
    code: r.code,
    displayName: 'Victima',
  });
  return { r, host: { 'x-host-token': r.hostToken }, victim };
}

async function espejismo() {
  console.log('\nespejismo — la víctima ve otra silueta');
  const { r, host, victim } = await room();

  const [status] = await post(
    `/api/rooms/${r.code}/powers`,
    { power: 'espejismo', targetId: (await state(r.code, victim.clientToken)).me.id },
    { 'x-client-token': r.clientToken }
  );
  check('se puede lanzar', status === 201, `got ${status}`);

  await post('/api/rounds', { roomId: r.roomId }, host);

  const attacker = await state(r.code, r.clientToken);
  const victimView = await state(r.code, victim.clientToken);

  check(
    've una silueta distinta a la real',
    attacker.currentRound.player.silhouette_url !== victimView.currentRound.player.silhouette_url,
    'las siluetas coinciden'
  );
  check(
    'la víctima no recibe el id del jugador real',
    victimView.currentRound.player.id !== attacker.currentRound.player.id
  );
  check('se le avisa que está afectada', victimView.currentRound.myHex?.power === 'espejismo');
  check(
    'pero no qué silueta le están mostrando',
    victimView.currentRound.myHex?.decoy_player_id === undefined
  );

  // Whoever wins must get the real player, not the decoy.
  await post(`/api/rounds/${attacker.currentRound.id}/bid`, { amount: 5 }, { 'x-client-token': victim.clientToken });
  await post(`/api/rounds/${attacker.currentRound.id}/finalize`);
  const after = await state(r.code, victim.clientToken);
  const bought = after.room.room_participants.find((p) => p.display_name === 'Victima')
    .team_players[0];
  check(
    'compra al jugador real, no al señuelo',
    bought.players.id === attacker.currentRound.player.id,
    `compró ${bought.players.name}`
  );
}

async function apagon() {
  console.log('\napagón — sin silueta');
  const { r, host, victim } = await room();
  const victimId = (await state(r.code, victim.clientToken)).me.id;

  await post(
    `/api/rooms/${r.code}/powers`,
    { power: 'apagon', targetId: victimId },
    { 'x-client-token': r.clientToken }
  );
  await post('/api/rounds', { roomId: r.roomId }, host);

  const attacker = await state(r.code, r.clientToken);
  const victimView = await state(r.code, victim.clientToken);

  check('el atacante sigue viéndola', !!attacker.currentRound.player.silhouette_url);
  check(
    'la víctima no recibe la imagen',
    victimView.currentRound.player.silhouette_url === null
  );
}

async function impuesto() {
  console.log('\nimpuesto — paga el doble');
  const { r, host, victim } = await room();
  const victimId = (await state(r.code, victim.clientToken)).me.id;
  const before = (await state(r.code, victim.clientToken)).me.remaining_budget;

  await post(
    `/api/rooms/${r.code}/powers`,
    { power: 'impuesto', targetId: victimId },
    { 'x-client-token': r.clientToken }
  );
  const [, round] = await post('/api/rounds', { roomId: r.roomId }, host);

  await post(`/api/rounds/${round.round.id}/bid`, { amount: 10 }, { 'x-client-token': victim.clientToken });
  await post(`/api/rounds/${round.round.id}/finalize`);

  const after = await state(r.code, victim.clientToken);
  check(
    'una puja de 10 le cuesta 20',
    after.me.remaining_budget === before - 20,
    `${before} -> ${after.me.remaining_budget}`
  );
}

async function traba() {
  console.log('\ntraba — no puede pujar en la primera mitad');
  const { r, host, victim } = await room(10);
  const victimId = (await state(r.code, victim.clientToken)).me.id;

  await post(
    `/api/rooms/${r.code}/powers`,
    { power: 'traba', targetId: victimId },
    { 'x-client-token': r.clientToken }
  );
  const [, round] = await post('/api/rounds', { roomId: r.roomId }, host);

  const [early] = await post(`/api/rounds/${round.round.id}/bid`, { amount: 3 }, { 'x-client-token': victim.clientToken });
  check('rechaza la puja temprana', early === 400 || early === 409, `got ${early}`);

  const [attackerOk] = await post(`/api/rounds/${round.round.id}/bid`, { amount: 2 }, { 'x-client-token': r.clientToken });
  check('el atacante puede pujar normal', attackerOk === 201, `got ${attackerOk}`);

  await sleep(6000);
  const [late] = await post(`/api/rounds/${round.round.id}/bid`, { amount: 8 }, { 'x-client-token': victim.clientToken });
  check('pasada la mitad ya puede', late === 201, `got ${late}`);
}

async function rules() {
  console.log('\nreglas de uso');
  const { r, victim } = await room();
  const me = (await state(r.code, r.clientToken)).me;
  const victimId = (await state(r.code, victim.clientToken)).me.id;

  const [self] = await post(
    `/api/rooms/${r.code}/powers`,
    { power: 'niebla', targetId: me.id },
    { 'x-client-token': r.clientToken }
  );
  check('no podés tirártelo a vos mismo', self === 400, `got ${self}`);

  const budgetBefore = (await state(r.code, r.clientToken)).me.remaining_budget;
  await post(
    `/api/rooms/${r.code}/powers`,
    { power: 'niebla', targetId: victimId },
    { 'x-client-token': r.clientToken }
  );
  const budgetAfter = (await state(r.code, r.clientToken)).me.remaining_budget;
  check('descuenta el costo del presupuesto', budgetBefore - budgetAfter === 10, `${budgetBefore} -> ${budgetAfter}`);

  const [stacked] = await post(
    `/api/rooms/${r.code}/powers`,
    { power: 'apagon', targetId: victimId },
    { 'x-client-token': r.clientToken }
  );
  check('no se pueden apilar sobre la misma víctima', stacked === 409, `got ${stacked}`);

  const [broke] = await post(
    `/api/rooms/${r.code}/powers`,
    { power: 'impuesto', targetId: victimId },
    { 'x-client-token': 'token-inventado' }
  );
  check('un token inválido no puede lanzar', broke === 403, `got ${broke}`);
}

console.log(`testing ${BASE}`);
await espejismo();
await apagon();
await impuesto();
await traba();
await rules();

console.log(`\n${ok} passed, ${fails.length} failed`);
if (fails.length) {
  fails.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
