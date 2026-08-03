// Room settings: gender filter and catalog pool.
const BASE = process.argv[2] || 'http://localhost:3000';
const j = async r => { try { return await r.json(); } catch { return {}; } };
const post = (p, b, h = {}) => fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: b ? JSON.stringify(b) : undefined }).then(async r => [r.status, await j(r)]);
const get = (p) => fetch(BASE + p).then(j);

let ok = 0; const fails = [];
const check = (n, c, d = '') => { if (c) { ok++; console.log(`  ok   ${n}`); } else { fails.push(n); console.log(`  FAIL ${n} ${d}`); } };

async function sample(settings, rounds = 8) {
  const [, room] = await post('/api/rooms', { displayName: 'H', startingBudget: 900, roundSeconds: 60, ...settings });
  const host = { 'x-host-token': room.hostToken };
  const [, b] = await post(`/api/rooms/${room.code}/join`, { code: room.code, displayName: 'G' });
  const tokens = [room.clientToken, b.clientToken];
  const seen = [];

  for (let i = 0; i < rounds; i++) {
    const [, r] = await post('/api/rounds', { roomId: room.roomId }, host);
    if (r.finished || !r.round) break;
    for (const t of tokens) {
      const [s] = await post(`/api/rounds/${r.round.id}/bid`, { amount: 2 }, { 'x-client-token': t });
      if (s === 201) break;
    }
    await post(`/api/rounds/${r.round.id}/finalize`, { force: true }, host);
    const st = await get(`/api/rooms/${room.code}/state`);
    if (st.currentRound?.player?.name) seen.push(st.currentRound.player.name);
  }
  return { code: room.code, seen };
}

console.log(`testing ${BASE}\n\nmen only`);
const men = await sample({ genderFilter: 'men' });
console.log('   ', men.seen.join(', '));
check('men-only room drew players', men.seen.length > 0);

console.log('\nwomen only');
const women = await sample({ genderFilter: 'women' });
console.log('   ', women.seen.join(', '));
check('women-only room drew players', women.seen.length > 0);
check('the two pools are disjoint', !men.seen.some(n => women.seen.includes(n)));

console.log('\nfamous vs all');
const famous = await sample({ pool: 'famous' });
const all = await sample({ pool: 'all' });
check('famous pool drew players', famous.seen.length > 0);
check('full pool drew players', all.seen.length > 0);

// Squad legality must survive the filters.
const st = await get(`/api/rooms/${men.code}/state`);
for (const p of st.room.room_participants) {
  const counts = {};
  for (const s of p.team_players) counts[s.players.position_type] = (counts[s.players.position_type] || 0) + 1;
  const legal = (counts.goalkeeper ?? 0) <= 1 && (counts.defender ?? 0) <= 2 && (counts.midfielder ?? 0) <= 1 && (counts.forward ?? 0) <= 1;
  check(`${p.display_name} never exceeds a position quota`, legal, JSON.stringify(counts));
}

console.log(`\n${ok} passed, ${fails.length} failed`);
process.exit(fails.length ? 1 : 0);
