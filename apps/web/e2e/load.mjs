// Measures what one room actually costs the server, so the optimisation work
// targets the real bottleneck instead of a guess.
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

const [, room] = await post('/api/rooms', {
  displayName: 'A',
  startingBudget: 200,
  roundSeconds: 30,
  pool: 'all',
});
const host = { 'x-host-token': room.hostToken };
const tokens = [room.clientToken];
for (const n of ['B', 'C', 'D']) {
  const [, g] = await post(`/api/rooms/${room.code}/join`, { code: room.code, displayName: n });
  tokens.push(g.clientToken);
}
await post('/api/rounds', { roomId: room.roomId }, host);

console.log(`sala de ${tokens.length} jugadores\n`);

// The state endpoint is what every client hits every five seconds.
const SAMPLES = 25;
const timings = [];
let bytes = 0;

for (let i = 0; i < SAMPLES; i++) {
  const t0 = performance.now();
  const res = await fetch(`${BASE}/api/rooms/${room.code}/state`, {
    headers: { 'x-client-token': tokens[i % tokens.length] },
    cache: 'no-store',
  });
  const body = await res.text();
  timings.push(performance.now() - t0);
  bytes += body.length;
}

timings.sort((a, b) => a - b);
const p50 = timings[Math.floor(SAMPLES * 0.5)];
const p95 = timings[Math.floor(SAMPLES * 0.95)];
const avgKb = bytes / SAMPLES / 1024;

console.log('GET /state');
console.log(`  mediana        : ${p50.toFixed(0)} ms`);
console.log(`  p95            : ${p95.toFixed(0)} ms`);
console.log(`  tamaño          : ${avgKb.toFixed(1)} KB por respuesta`);

// Every client polls every 5s on top of realtime.
const perRoomPerSecond = tokens.length / 5;
console.log(`\ncon ${tokens.length} jugadores y sondeo cada 5s:`);
console.log(`  ${perRoomPerSecond.toFixed(1)} consultas/segundo por sala`);
console.log(`  ${(avgKb * perRoomPerSecond).toFixed(0)} KB/s de tráfico por sala`);

for (const rooms of [10, 50, 100, 500]) {
  const qps = perRoomPerSecond * rooms;
  const mbps = (avgKb * qps) / 1024;
  console.log(
    `  ${String(rooms).padStart(4)} salas -> ${String(Math.round(qps)).padStart(4)} req/s, ${mbps.toFixed(1)} MB/s`
  );
}

// How much of the response is the part that rarely changes.
const sample = await fetch(`${BASE}/api/rooms/${room.code}/state`, {
  headers: { 'x-client-token': tokens[0] },
}).then(j);
const full = JSON.stringify(sample).length;
const roundOnly = JSON.stringify(sample.currentRound ?? {}).length;
const participants = JSON.stringify(sample.room?.room_participants ?? []).length;
console.log(`\ncomposición de la respuesta:`);
console.log(`  ronda actual   : ${((roundOnly / full) * 100).toFixed(0)}%`);
console.log(`  participantes  : ${((participants / full) * 100).toFixed(0)}%`);
