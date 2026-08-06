/**
 * El reto por el OVR del jugador que acabás de comprar.
 *
 * Lo que hay que ver: que el reto venga sorteado desde el servidor y no
 * cambie al volver a pedirlo, que sólo pueda jugarlo el que se llevó al
 * jugador, que se pueda una sola vez, y que el rating que suma el puntaje
 * quede efectivamente movido.
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
  fetch(`${BASE}/api/rooms/${code}/state`, { headers: { 'x-client-token': token } }).then(j);

let fallos = 0;
const check = (name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) fallos++;
};

const nombre = (p) => p + Date.now().toString().slice(-5);

const [, sala] = await post('/api/rooms', {
  displayName: nombre('T'),
  startingBudget: 300,
  roundSeconds: 10,
  pool: 'all',
});
const host = { 'x-host-token': sala.hostToken };
const [, rival] = await post(`/api/rooms/${sala.code}/join`, {
  code: sala.code,
  displayName: nombre('P'),
});

const [, r1] = await post('/api/rounds', { roomId: sala.roomId }, host);
await post(`/api/rounds/${r1.round.id}/bid`, { amount: 20 }, { 'x-client-token': sala.clientToken });
await post(`/api/rounds/${r1.round.id}/finalize`, { force: true }, host);

const antes = await state(sala.code, sala.clientToken);
const yo = antes.room.room_participants.find((p) => p.id === antes.me.id);
const fichaje = yo.team_players.find((s) => s.players.id === r1.round.player_id);

check('el fichaje trae un reto sorteado', typeof fichaje?.ovr_prob === 'number', JSON.stringify(fichaje?.ovr_prob));
check('la probabilidad es una de las tres', [60, 50, 40].includes(fichaje?.ovr_prob), String(fichaje?.ovr_prob));
check(
  'los puntos son uno de los tres pares',
  ['3/2', '2/2', '2/3'].includes(`${fichaje?.ovr_gana}/${fichaje?.ovr_pierde}`),
  `${fichaje?.ovr_gana}/${fichaje?.ovr_pierde}`
);
check('todavía no se decidió', fichaje?.ovr_bet === null, JSON.stringify(fichaje?.ovr_bet));

// Volver a leer no puede darte otro reto: si cambiara, refrescar hasta que
// salga uno bueno sería gratis.
const otraVez = await state(sala.code, sala.clientToken);
const mismo = otraVez.room.room_participants
  .find((p) => p.id === otraVez.me.id)
  .team_players.find((s) => s.players.id === r1.round.player_id);
check(
  'el reto no cambia al releer el estado',
  mismo.ovr_prob === fichaje.ovr_prob && mismo.ovr_gana === fichaje.ovr_gana && mismo.ovr_pierde === fichaje.ovr_pierde,
  `${fichaje.ovr_prob}/${fichaje.ovr_gana}/${fichaje.ovr_pierde} → ${mismo.ovr_prob}/${mismo.ovr_gana}/${mismo.ovr_pierde}`
);

// El que no lo compró no puede tirar por él.
const [statusAjeno] = await post(`/api/rounds/${r1.round.id}/ovr`, { decision: 'va' }, { 'x-client-token': rival.clientToken });
check('un rival no puede apostar por mi fichaje', statusAjeno === 403, String(statusAjeno));

const ratingAntes = fichaje.rating;
const [statusOk, resultado] = await post(`/api/rounds/${r1.round.id}/ovr`, { decision: 'va' }, { 'x-client-token': sala.clientToken });

check(`se resuelve (${statusOk})`, statusOk === 200, JSON.stringify(resultado).slice(0, 120));
check('dice si ganó o perdió', typeof resultado.gano === 'boolean', String(resultado.gano));
check(
  'el delta es el que prometía el reto',
  resultado.delta === (resultado.gano ? fichaje.ovr_gana : -fichaje.ovr_pierde),
  `${resultado.delta} vs +${fichaje.ovr_gana}/-${fichaje.ovr_pierde}`
);
check('el rating nuevo es el viejo más el delta', resultado.rating === ratingAntes + resultado.delta,
  `${ratingAntes} ${resultado.delta >= 0 ? '+' : ''}${resultado.delta} = ${resultado.rating}`);

// Y tiene que haber quedado guardado donde lo lee el puntaje.
const despues = await state(sala.code, sala.clientToken);
const guardado = despues.room.room_participants
  .find((p) => p.id === despues.me.id)
  .team_players.find((s) => s.players.id === r1.round.player_id);
check('queda guardado en el fichaje', guardado.rating === resultado.rating, `${guardado.rating}`);
check('y marcado como jugado', guardado.ovr_bet === 'va', String(guardado.ovr_bet));

const [statusRepetido] = await post(`/api/rounds/${r1.round.id}/ovr`, { decision: 'va' }, { 'x-client-token': sala.clientToken });
check('no se puede apostar dos veces', statusRepetido === 409, String(statusRepetido));

// Y no aceptar el reto también se registra.
const [, r2] = await post('/api/rounds', { roomId: sala.roomId }, host);
await post(`/api/rounds/${r2.round.id}/bid`, { amount: 15 }, { 'x-client-token': rival.clientToken });
await post(`/api/rounds/${r2.round.id}/finalize`, { force: true }, host);

const [statusPaso, pasoBody] = await post(`/api/rounds/${r2.round.id}/ovr`, { decision: 'paso' }, { 'x-client-token': rival.clientToken });
check(`se puede no aceptar (${statusPaso})`, statusPaso === 200, JSON.stringify(pasoBody).slice(0, 90));
check('queda registrado como pasado', pasoBody.ovr_bet === 'paso', String(pasoBody.ovr_bet));

const finRival = await state(sala.code, rival.clientToken);
const suyo = finRival.room.room_participants
  .find((p) => p.id === finRival.me.id)
  .team_players.find((s) => s.players.id === r2.round.player_id);
check('y no le movió el rating', suyo.ovr_delta === null, String(suyo.ovr_delta));

console.log(fallos ? `\n${fallos} fallaron` : '\ntodo en orden');
process.exit(fallos ? 1 : 0);
