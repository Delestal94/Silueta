// A bid must restart the round clock, not merely extend it.
const BASE = process.argv[2] || 'http://localhost:3000';
const j = async r => { try { return await r.json(); } catch { return {}; } };
const post = (p, b, h = {}) => fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: b ? JSON.stringify(b) : undefined }).then(async r => [r.status, await j(r)]);
const sleep = ms => new Promise(r => setTimeout(r, ms));

let ok = 0; const fails = [];
const check = (n, c, d = '') => { if (c) { ok++; console.log(`  ok   ${n}`); } else { fails.push(n); console.log(`  FAIL ${n} ${d}`); } };

const SECONDS = 20;
const [, room] = await post('/api/rooms', { displayName: 'A', startingBudget: 200, roundSeconds: SECONDS });
const host = { 'x-host-token': room.hostToken };
const [, b] = await post(`/api/rooms/${room.code}/join`, { code: room.code, displayName: 'B' });

const [, r] = await post('/api/rounds', { roomId: room.roomId }, host);
const round = r.round.id;
const left = () => (new Date(r.round.ends_at).getTime() - Date.now()) / 1000;
console.log(`ronda de ${SECONDS}s\n`);

// Let a good chunk of the clock run down.
await sleep(8000);
const [, afterFirst] = await post(`/api/rounds/${round}/bid`, { amount: 5 }, { 'x-client-token': room.clientToken });
const remaining1 = (new Date(afterFirst.round.ends_at).getTime() - Date.now()) / 1000;
console.log(`  tras 8s y una puja quedan ${remaining1.toFixed(1)}s`);
check('la puja reinicia el reloj completo', remaining1 > SECONDS - 2, `quedaban ${remaining1.toFixed(1)}s`);

await sleep(6000);
const [, afterSecond] = await post(`/api/rounds/${round}/bid`, { amount: 10 }, { 'x-client-token': b.clientToken });
const remaining2 = (new Date(afterSecond.round.ends_at).getTime() - Date.now()) / 1000;
console.log(`  tras otros 6s y otra puja quedan ${remaining2.toFixed(1)}s`);
check('cada puja lo vuelve a reiniciar', remaining2 > SECONDS - 2, `quedaban ${remaining2.toFixed(1)}s`);

// With nobody bidding, it must actually expire.
console.log('  esperando a que expire sin pujas…');
await sleep(SECONDS * 1000 + 1500);
const [expired, body] = await post(`/api/rounds/${round}/bid`, { amount: 20 }, { 'x-client-token': room.clientToken });
check('sin pujas la ronda expira', expired === 409, `${expired} ${body.error}`);

console.log(`\n${ok} passed, ${fails.length} failed`);
process.exit(fails.length ? 1 : 0);
