// Community submissions must never reach the catalog without approval, and
// the queue must not be readable or reviewable without the moderation token.
const BASE = process.argv[2] || 'http://localhost:3000';
const TOKEN = process.env.ADMIN_TOKEN || process.argv[3];

if (!TOKEN) {
  console.error('Falta ADMIN_TOKEN (variable de entorno o segundo argumento)');
  process.exit(1);
}

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
const get = (p, headers = {}) =>
  fetch(BASE + p, { headers }).then(async (r) => [r.status, await j(r)]);

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

const admin = { 'x-admin-token': TOKEN };
const stamp = Date.now();

console.log(`testing ${BASE}\n\nacceso a la cola`);

const [noAuth] = await get('/api/submissions');
check('sin clave no se puede leer la cola', noAuth === 401, `got ${noAuth}`);

const [badAuth] = await get('/api/submissions', { 'x-admin-token': 'clave-incorrecta' });
check('con clave incorrecta tampoco', badAuth === 401, `got ${badAuth}`);

const [withAuth] = await get('/api/submissions', admin);
check('con la clave correcta sí', withAuth === 200, `got ${withAuth}`);

console.log('\nvalidación de la propuesta');

const valid = {
  name: `Jugador Prueba ${stamp}`,
  positionType: 'forward',
  gender: 'men',
  nationality: 'Argentina',
  team: 'Club Prueba',
  birthDate: '1990-05-10',
  rating: 85,
  pace: 80,
  shooting: 85,
  passing: 75,
  dribbling: 82,
  defending: 40,
  physical: 78,
  imageUrl: 'https://example.org/jugador.png',
  imageIsTransparent: true,
  submittedBy: `tester-${stamp}`,
};

const [noTransparent] = await post('/api/submissions', {
  kind: 'new',
  data: { ...valid, imageIsTransparent: false },
});
check('exige confirmar el fondo transparente', noTransparent === 400, `got ${noTransparent}`);

const [httpUrl] = await post('/api/submissions', {
  kind: 'new',
  data: { ...valid, imageUrl: 'http://example.org/x.png' },
});
check('rechaza URLs que no sean https', httpUrl === 400, `got ${httpUrl}`);

const [notImage] = await post('/api/submissions', {
  kind: 'new',
  data: { ...valid, imageUrl: 'https://example.org/pagina' },
});
check('rechaza URLs que no sean imagen', notImage === 400, `got ${notImage}`);

const [badRating] = await post('/api/submissions', {
  kind: 'new',
  data: { ...valid, rating: 150 },
});
check('rechaza ratings fuera de escala', badRating === 400, `got ${badRating}`);

const [created] = await post('/api/submissions', { kind: 'new', data: valid });
check('acepta una propuesta completa', created === 201, `got ${created}`);

console.log('\nla propuesta no toca el catálogo');

const [, search] = await get(`/api/players/search?q=${encodeURIComponent('Jugador Prueba')}`);
check(
  'el jugador propuesto no aparece todavía',
  !(search.players ?? []).some((p) => p.name === valid.name)
);

console.log('\nrevisión');

const [, queue] = await get('/api/submissions', admin);
const mine = (queue.submissions ?? []).find((s) => s.submitted_by === valid.submittedBy);
check('aparece en la cola de revisión', !!mine);

const [noAuthReview] = await post(`/api/submissions/${mine.id}/review`, { decision: 'approve' });
check('no se puede aprobar sin clave', noAuthReview === 401, `got ${noAuthReview}`);

const [approved, approvedBody] = await post(
  `/api/submissions/${mine.id}/review`,
  { decision: 'approve' },
  admin
);
check('se aprueba con la clave', approved === 200, `got ${approved}`);
check('avisa que falta generar la silueta', approvedBody.needsImage === true);

const [twice] = await post(`/api/submissions/${mine.id}/review`, { decision: 'approve' }, admin);
check('no se puede revisar dos veces', twice === 409, `got ${twice}`);

const [, search2] = await get(`/api/players/search?q=${encodeURIComponent('Jugador Prueba')}`);
check(
  'aprobar tampoco lo crea a medias: espera la silueta',
  !(search2.players ?? []).some((p) => p.name === valid.name)
);

const [missingStats] = await post('/api/submissions', {
  kind: 'new',
  data: { ...valid, name: `Sin Stats ${stamp}`, pace: undefined },
});
check('exige las seis estadísticas', missingStats === 400, `got ${missingStats}`);

console.log('\nbúsqueda');

const [, tooShort] = await get('/api/players/search?q=me');
check('no enumera el catálogo con consultas cortas', (tooShort.players ?? []).length === 0);

const [, someone] = await get('/api/players/search?q=Messi');
check(
  'la búsqueda nunca devuelve la silueta',
  (someone.players ?? []).every((p) => !('silhouette_url' in p))
);

console.log(`\n${ok} passed, ${fails.length} failed`);
if (fails.length) {
  fails.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
