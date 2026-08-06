/**
 * El pase saltea la silueta.
 *
 * Antes, si pasaban todos, el pase se anulaba y volvían a entrar todos al
 * sorteo. Eso le encajaba —cobrado— un jugador a alguien que había dicho que
 * no lo quería. Ahora el sorteo corre sólo entre los que no pasaron, y si no
 * queda nadie la ronda cierra sin dueño.
 *
 * Lo que hay que ver: que pasando todos nadie lo compre y nadie pague, que el
 * puesto siga abierto, y que el que no pasa se lo lleve igual.
 */
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

let fallos = 0;
const check = (name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) fallos++;
};

/** Nombres reconocibles como de prueba, para poder sacarlos del ranking. */
const nombre = (p) => p + Date.now().toString().slice(-5);

const [, sala] = await post('/api/rooms', {
  displayName: nombre('T'),
  startingBudget: 300,
  roundSeconds: 10,
  pool: 'all',
});
const host = { 'x-host-token': sala.hostToken };
const [, invitado] = await post(`/api/rooms/${sala.code}/join`, {
  code: sala.code,
  displayName: nombre('P'),
});

const tokens = [sala.clientToken, invitado.clientToken];

// ---------- pasan los dos: no se la lleva nadie ----------

const [, r1] = await post('/api/rounds', { roomId: sala.roomId }, host);
const puesto1 = r1.round.position_type;

for (const t of tokens) {
  const [status] = await post(`/api/rounds/${r1.round.id}/pass`, null, { 'x-client-token': t });
  check(`pasa sin error (${status})`, status < 400, String(status));
}

const [, cerrada] = await post(`/api/rounds/${r1.round.id}/finalize`, { force: true }, host);

check('pasando todos, la ronda queda sin dueño', cerrada.round?.status === 'unsold', cerrada.round?.status);
check('no se sortea', cerrada.raffled !== true, JSON.stringify(cerrada.raffled));
check('nadie figura ganando', cerrada.round?.current_bid_by == null, String(cerrada.round?.current_bid_by));

const despues = await state(sala.code, sala.clientToken);
const conJugadores = despues.room.room_participants.filter((p) => p.team_players.length > 0);
check('nadie sumó al jugador', conJugadores.length === 0, `${conJugadores.length} lo tienen`);
check(
  'a nadie le descontaron plata',
  despues.room.room_participants.every((p) => p.remaining_budget === 300),
  despues.room.room_participants.map((p) => `${p.display_name}=${p.remaining_budget}`).join(' ')
);

// Que el puesto siga abierto se comprueba pidiendo la ronda siguiente: como
// nadie llenó el arco, tiene que volver a tocar el mismo puesto. Mirar un
// campo `slots` que el estado no expone daba un PASS que no probaba nada.
const [, siguiente] = await post('/api/rounds', { roomId: sala.roomId }, host);
check(
  'el puesto sigue abierto para la próxima',
  siguiente.round?.position_type === puesto1,
  `${puesto1} → ${siguiente.round?.position_type}`
);

// ---------- el que no pasa se lo lleva igual ----------
//
// En sala nueva a propósito: la ronda anterior quedó sin dueño, así que el
// puesto se repite y ahí el pase ya está gastado.

const [, sala2] = await post('/api/rooms', {
  displayName: nombre('T'),
  startingBudget: 300,
  roundSeconds: 10,
  pool: 'all',
});
const host2 = { 'x-host-token': sala2.hostToken };
const [, invitado2] = await post(`/api/rooms/${sala2.code}/join`, {
  code: sala2.code,
  displayName: nombre('P'),
});

const [, r2] = await post('/api/rounds', { roomId: sala2.roomId }, host2);

const [statusPase] = await post(`/api/rounds/${r2.round.id}/pass`, null, {
  'x-client-token': sala2.clientToken,
});
check(`sólo pasa el anfitrión (${statusPase})`, statusPase < 400, String(statusPase));

const [, cerrada2] = await post(`/api/rounds/${r2.round.id}/finalize`, { force: true }, host2);
check('con uno que no pasó, sí se sortea', cerrada2.raffled === true, JSON.stringify(cerrada2.raffled));
check('y se lo adjudica', cerrada2.round?.status === 'sold', cerrada2.round?.status);

const final = await state(sala2.code, invitado2.clientToken);
const ganador = final.room.room_participants.find((p) => p.id === cerrada2.round?.current_bid_by);
check('lo gana el que no pasó', ganador?.id === final.me.id, ganador?.display_name);
check('y paga el piso del sorteo', ganador?.remaining_budget === 290, String(ganador?.remaining_budget));

console.log(fallos ? `\n${fallos} fallaron` : '\ntodo en orden');
process.exit(fallos ? 1 : 0);
