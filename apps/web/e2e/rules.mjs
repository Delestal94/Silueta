/**
 * Las reglas que no se ven en la interfaz y sólo se pueden comprobar jugando:
 * quién entra al sorteo, cuánto paga, y qué épocas salen.
 */
import { chromium } from 'playwright';
import { avanzar, esperarRevelacion, nombreDePrueba } from './helpers.mjs';

// Nombres reconocibles como de prueba, para poder sacarlos del ranking
// después sin confundirlos con los de una persona.
const NOMBRE_ANFITRION = nombreDePrueba('T');
const NOMBRE_INVITADO = nombreDePrueba('P');
const NOMBRE_INVITADO2 = nombreDePrueba('R');

const BASE = process.argv[2] || 'http://localhost:3000';
const browser = await chromium.launch();
let fallos = 0;

const check = (label, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`);
  if (!ok) fallos++;
};

const mkPage = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  return ctx.newPage();
};

const host = await mkPage();
await host.goto(BASE);
await host.getByRole('button', { name: 'Crear sala' }).click();
await host.getByPlaceholder('Ej: Davo').fill(NOMBRE_ANFITRION);
await host.getByRole('button', { name: 'Crear sala' }).click();
await host.waitForURL(/\/room\//, { timeout: 20000 });
const code = host.url().split('/room/')[1];

const guest = await mkPage();
await guest.goto(BASE);
await guest.getByRole('button', { name: 'Unirme con un código' }).click();
await guest.getByPlaceholder('ABC123').fill(code);
await guest.getByPlaceholder('Ej: La Cobra').fill(NOMBRE_INVITADO);
await guest.getByRole('button', { name: 'Entrar', exact: true }).click();
await guest.waitForURL(/\/room\//, { timeout: 20000 });
await host.waitForFunction((n) => document.body.innerText.includes(n), NOMBRE_INVITADO, { timeout: 20000 });

const stateOf = async (page) => {
  const token = await page.evaluate(
    (c) => JSON.parse(localStorage.getItem(`room_${c}`)).clientToken,
    code
  );
  return page.evaluate(
    async ([c, t]) => {
      const r = await fetch(`/api/rooms/${c}/state`, { headers: { 'x-client-token': t } });
      return r.json();
    },
    [code, token]
  );
};

await guest.getByRole('button', { name: 'Estoy listo' }).click();
await host.getByRole('button', { name: 'Estoy listo' }).click();
await host.waitForSelector('img[alt*="Silueta"]', { timeout: 25000 });

// El botón All in ofrece el presupuesto entero.
const allIn = await host.getByRole('button', { name: /All in/i }).first().textContent();
check('el botón All in ofrece todo el presupuesto', /All in · 200/.test(allIn ?? ''), allIn?.trim());

// El anfitrión pasa; el invitado no hace nada. El sorteo debería darle el
// jugador al invitado, nunca al que pasó.
const antes = await stateOf(host);
const yo = antes.me.id;

await host.getByRole('button', { name: /^Pasar/ }).click();
await esperarRevelacion(host);
await host.waitForTimeout(1500);

const despues = await stateOf(host);
const r = despues.currentRound;

check('el que pasó no se lleva al jugador', r.current_bid_by !== yo, `ganador=${r.current_bid_by === yo ? 'el que pasó' : 'el otro'}`);
check('el sorteo cobra el piso de 10', r.current_bid === 10, `pagó ${r.current_bid}`);

// Las épocas, sobre las rondas que se vayan jugando.
const epocas = new Set([r.era_label].filter(Boolean));
for (let i = 0; i < 6; i++) {
  await avanzar(host);
  await host.waitForTimeout(1200);
  const s = await stateOf(host);
  if (s.currentRound?.era_label) epocas.add(s.currentRound.era_label);
  await host.waitForTimeout(1500);
}
const validas = [...epocas].every((e) => ['Promesa', 'Prime', 'Veterano'].includes(e));
check('las épocas son sólo las tres', validas, [...epocas].join(', '));

console.log(fallos ? `\n${fallos} fallaron` : '\ntodo en orden');
await browser.close();
process.exit(fallos ? 1 : 0);
