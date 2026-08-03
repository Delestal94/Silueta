// Leaving, kicking, and starting a round by agreement.
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

async function room() {
  const [, r] = await post('/api/rooms', {
    displayName: 'Anfitrión',
    startingBudget: 200,
    roundSeconds: 20,
    pool: 'all',
  });
  const [, b] = await post(`/api/rooms/${r.code}/join`, { code: r.code, displayName: 'Beto' });
  const [, c] = await post(`/api/rooms/${r.code}/join`, { code: r.code, displayName: 'Carla' });
  return { r, host: { 'x-host-token': r.hostToken }, b, c };
}

console.log(`testing ${BASE}\n\nempezar por acuerdo`);

{
  const { r, b, c } = await room();
  const members = `/api/rooms/${r.code}/members`;

  const [s1, d1] = await post(members, { action: 'ready' }, { 'x-client-token': r.clientToken });
  check('el primero marca listo', s1 === 200, `got ${s1}`);
  check('todavía no arranca', d1.started === false, JSON.stringify(d1));
  check('informa cuántos faltan', d1.total === 3 && d1.ready === 1, JSON.stringify(d1));

  await post(members, { action: 'ready' }, { 'x-client-token': b.clientToken });
  const [, d3] = await post(members, { action: 'ready' }, { 'x-client-token': c.clientToken });
  check('con todos listos arranca sola', d3.started === true && !!d3.round, JSON.stringify(d3).slice(0, 90));

  const after = await state(r.code, r.clientToken);
  check('la ronda queda activa', after.currentRound?.status === 'active');
  check('y se borran los votos para la próxima',
    after.room.room_participants.every((p) => !p.is_ready),
    JSON.stringify(after.room.room_participants.map((p) => p.is_ready)));
}

console.log('\nechar de la sala');

{
  const { r, host, b } = await room();
  const members = `/api/rooms/${r.code}/members`;
  const before = await state(r.code, r.clientToken);
  const beto = before.room.room_participants.find((p) => p.display_name === 'Beto');

  const [noAuth] = await post(members, { action: 'kick', targetId: beto.id });
  check('sin ser anfitrión no se puede echar', noAuth === 403, `got ${noAuth}`);

  const [kicked, kickedBody] = await post(members, { action: 'kick', targetId: beto.id }, host);
  check('el anfitrión puede echar', kicked === 200, `got ${kicked}`);
  check('dice a quién echó', kickedBody.display_name === 'Beto', JSON.stringify(kickedBody));

  const after = await state(r.code, r.clientToken);
  check('desaparece de la sala', after.room.room_participants.length === 2,
    `${after.room.room_participants.length}`);

  const host_row = after.room.room_participants.find((p) => p.is_host);
  const [self] = await post(members, { action: 'kick', targetId: host_row.id }, host);
  check('no se puede echar al anfitrión', self === 400, `got ${self}`);
}

console.log('\nsalir de la sala');

{
  const { r, b } = await room();
  const members = `/api/rooms/${r.code}/members`;

  const [left, leftBody] = await post(members, { action: 'leave' }, { 'x-client-token': b.clientToken });
  check('un jugador puede salir', left === 200 && leftBody.left === true, `got ${left}`);

  const after = await state(r.code, r.clientToken);
  check('queda fuera de la tabla', !after.room.room_participants.some((p) => p.display_name === 'Beto'));

  // The host leaving must hand the badge on, or the room locks up.
  const [hostLeft, hostBody] = await post(members, { action: 'leave' }, { 'x-client-token': r.clientToken });
  check('el anfitrión también puede salir', hostLeft === 200, `got ${hostLeft}`);
  check('y el rol pasa a otro', !!hostBody.new_host, JSON.stringify(hostBody));

  const orphan = await state(r.code, null);
  check('la sala sigue con anfitrión', orphan.room.room_participants.some((p) => p.is_host),
    JSON.stringify(orphan.room.room_participants.map((p) => [p.display_name, p.is_host])));
}

console.log(`\n${ok} passed, ${fails.length} failed`);
if (fails.length) {
  fails.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
