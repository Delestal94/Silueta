/**
 * Que la revancha no repita siluetas.
 *
 * Se juega una partida entera, se pide revancha y se juega otra, anotando qué
 * jugador salió en cada ronda. La comprobación es sobre los ids, no sobre los
 * nombres: hay homónimos en el catálogo.
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

const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await page.goto(BASE);
await page.getByRole('button', { name: 'Crear sala' }).click();
await page.getByPlaceholder('Ej: Davo').fill('R' + Date.now().toString().slice(-5));
await page.locator('input[type=number]').nth(1).fill('5');
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

/** Juega hasta que termine y devuelve los ids revelados. */
async function partida() {
  const vistos = [];
  // Esperar a que la sala termine de cargar antes de buscar el botón: recién
  // entrado, count() da 0 y el arranque se saltea en silencio.
  await page
    .waitForSelector('button:has-text("Estoy listo"), img[alt*="Silueta"]', { timeout: 25000 })
    .catch(() => {});

  const listo = page.getByRole('button', { name: 'Estoy listo' });
  if (await listo.count()) await listo.click();

  for (let i = 0; i < 40; i++) {
    const s = await estado();
    if (s.room?.status === 'finished') break;

    const r = s.currentRound;
    if (r?.revealed && r.player?.id && !vistos.includes(r.player.id)) vistos.push(r.player.id);

    if (await avanzar(page)) await page.waitForTimeout(900);
    else await page.waitForTimeout(1800);
  }
  return vistos;
}

const primera = await partida();
check('la primera partida terminó', (await estado()).room?.status === 'finished');
check('salieron siluetas', primera.length >= 4, `${primera.length} jugadores`);

await page.getByRole('button', { name: 'Jugar de nuevo' }).click();
await page.waitForTimeout(2500);

const segunda = await partida();
check('la revancha se jugó', segunda.length >= 4, `${segunda.length} jugadores`);

const repetidos = segunda.filter((id) => primera.includes(id));
check(
  'ninguna silueta se repite entre partidas',
  repetidos.length === 0,
  repetidos.length ? `${repetidos.length} repetidas` : `${primera.length} + ${segunda.length} distintas`
);

// Y dentro de cada partida tampoco, que era lo que ya funcionaba.
check('ninguna se repite dentro de la revancha', new Set(segunda).size === segunda.length);

console.log(fallos ? `\n${fallos} fallaron` : '\ntodo en orden');
await browser.close();
process.exit(fallos ? 1 : 0);
