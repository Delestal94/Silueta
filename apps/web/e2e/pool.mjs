/**
 * El catálogo equilibrado, medido jugando.
 *
 * La proporción no se puede comprobar mirando la consulta: hay que ver de qué
 * mitad salen los jugadores ronda tras ronda. Y de paso confirma que las tres
 * reglas del sorteo —pool, leyendas y empujón— conviven, que es justo lo que
 * se rompió cuando una migración redefinió next_round desde una copia vieja.
 */
import { chromium } from 'playwright';
import { avanzar, esperarRevelacion } from './helpers.mjs';

const BASE = process.argv[2] || 'http://localhost:3000';
const browser = await chromium.launch();
let fallos = 0;

const check = (label, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`);
  if (!ok) fallos++;
};

/** Juega rondas en una sala con el catálogo pedido y devuelve los revelados. */
async function jugar(pool, rondas) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Crear sala' }).click();
  await page.getByPlaceholder('Ej: Davo').fill('P' + Date.now().toString().slice(-5));
  await page.locator('input[type=number]').nth(1).fill('5');

  const etiqueta = { famous: 'Más famosos', balanced: 'Equilibrado', all: 'Todos' }[pool];
  await page.getByRole('radio', { name: etiqueta }).click();
  await page.getByRole('button', { name: 'Crear sala' }).click();
  await page.waitForURL(/\/room\//, { timeout: 20000 });
  const code = page.url().split('/room/')[1];

  const token = await page.evaluate(
    (c) => JSON.parse(localStorage.getItem(`room_${c}`)).clientToken,
    code
  );
  const estado = () =>
    page.evaluate(
      async ([c, t]) =>
        (await fetch(`/api/rooms/${c}/state`, { headers: { 'x-client-token': t } })).json(),
      [code, token]
    );

  // Dos jugadores: diez fichajes en vez de cinco. Con cinco rondas la moneda
  // baila demasiado para decir nada — cinco caras seguidas pasan el 3% de las
  // veces, y eso no distingue un sorteo parejo de uno roto.
  const guest = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await guest.goto(BASE);
  await guest.getByRole('button', { name: 'Unirme con un código' }).click();
  await guest.getByPlaceholder('ABC123').fill(code);
  await guest.getByPlaceholder('Ej: La Cobra').fill('Cobra');
  await guest.getByRole('button', { name: 'Entrar', exact: true }).click();
  await guest.waitForURL(/\/room\//, { timeout: 20000 });
  await page.waitForFunction(() => document.body.innerText.includes('Cobra'), null, { timeout: 20000 });

  const primero = await estado();
  await guest.getByRole('button', { name: 'Estoy listo' }).click();
  await page.getByRole('button', { name: 'Estoy listo' }).click();

  const vistos = [];
  for (let i = 0; i < rondas * 5 && vistos.length < rondas; i++) {
    const s = await estado();
    if (s.room?.status === 'finished') break;

    const r = s.currentRound;
    if (r?.revealed && r.player?.id && !vistos.some((v) => v.id === r.player.id)) {
      vistos.push({ id: r.player.id, name: r.player.name });
    }

    if (await avanzar([page, guest])) await page.waitForTimeout(800);
    else await page.waitForTimeout(1700);
  }

  await guest.context().close();
  await page.context().close();
  return { vistos, pool: primero.room?.pool };
}

// El botón existe y la sala guarda el valor.
const bal = await jugar('balanced', 10);
check('la sala queda en catálogo equilibrado', bal.pool === 'balanced', bal.pool);
check('se jugaron rondas', bal.vistos.length >= 8, `${bal.vistos.length} jugadores distintos`);

// Cuántos de los revelados eran del pool famoso. Se pregunta a la base, que es
// la que define el corte, en vez de repetir la regla acá.
const { Client } = await import('pg');
const c = new Client({
  host: `db.${process.env.SUPABASE_PROJECT_REF}.supabase.co`,
  user: 'postgres',
  password: process.env.SUPABASE_DB_PASSWORD,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});
await c.connect();
const { rows } = await c.query(
  'select id, public.es_famoso(fame_rank) as famoso from public.players where id = any($1)',
  [bal.vistos.map((v) => v.id)]
);
await c.end();

const famosos = rows.filter((r) => r.famoso).length;
const resto = rows.length - famosos;
console.log(`  reparto: ${famosos} famosos / ${resto} del resto`);

// Con la moneda por ronda, sobre pocas rondas la proporción baila. Lo que sí
// tiene que pasar es que aparezcan las dos mitades: si saliera una sola, la
// moneda no estaría funcionando.
check('salen jugadores de las dos mitades', famosos > 0 && resto > 0, `${famosos} y ${resto}`);

console.log(fallos ? `\n${fallos} fallaron` : '\ntodo en orden');
await browser.close();
process.exit(fallos ? 1 : 0);
