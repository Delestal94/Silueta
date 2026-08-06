/**
 * Escudo y Reversa, comprobados desde las dos puntas.
 *
 * Lo que hay que ver no es que el botón exista: es a quién le termina cayendo
 * el poder y a quién se le cobra. Las dos cosas sólo se ven mirando el estado
 * de los dos jugadores, no el de uno.
 */
import { chromium } from 'playwright';
import { nombreDePrueba } from './helpers.mjs';

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

const mkPage = async () =>
  (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();

const host = await mkPage();
await host.goto(BASE);
await host.getByRole('button', { name: 'Crear sala' }).click();
await host.getByPlaceholder('Ej: Davo').fill(NOMBRE_ANFITRION);
await host.locator('input[type=number]').nth(1).fill('120');
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

const estado = async (page) => {
  const token = await page.evaluate(
    (c) => JSON.parse(localStorage.getItem(`room_${c}`)).clientToken,
    code
  );
  return page.evaluate(
    async ([c, t]) =>
      (await fetch(`/api/rooms/${c}/state`, { headers: { 'x-client-token': t } })).json(),
    [code, token]
  );
};

/** Tira un poder desde `page` hacia `nombre`. */
const tirar = async (page, poder, nombre) => {
  await page.locator(`[aria-label^="${poder}"]:visible`).click();
  if (nombre) {
    // Botones visibles dentro del panel de poderes visible. El panel se dibuja
    // dos veces —rail y pestañas del celular— y fuera de él "Cobra" también
    // matchearía el botón "Echar a Cobra" del roster.
    const destino = page
      .locator('.panel:has-text("Poderes"):visible button:visible')
      .filter({ hasText: nombre });
    await destino.first().waitFor({ timeout: 10000 });
    await destino.first().click();
  }
  await page.waitForTimeout(1800);
};

// --- ESCUDO: el invitado se protege, el anfitrión intenta y no le sale
await tirar(guest, 'Escudo');
const g1 = await estado(guest);
check('el escudo cuesta 14', g1.me.remaining_budget === 186, String(g1.me.remaining_budget));

const antesDelIntento = (await estado(host)).me.remaining_budget;
await tirar(host, 'Apagón', NOMBRE_INVITADO);
const h1 = await estado(host);

check(
  'el escudo para el golpe y lo cobra',
  h1.me.remaining_budget === antesDelIntento - 12,
  `${antesDelIntento} → ${h1.me.remaining_budget}`
);
check('el que tira se entera', (await host.locator('text=/escudo/i').count()) > 0);

// Parado uno, el escudo se gastó: el siguiente tiene que pasar.
const g1b = await estado(guest);
check(
  'el escudo se gasta al parar',
  !(g1b.effects ?? []).some((e) => e.power === 'escudo' && e.status === 'pending')
);

// --- REVERSA: el invitado la pone, el anfitrión tira y se la come él
await tirar(guest, 'Reversa');
const g2 = await estado(guest);
check('la reversa cuesta 20', g2.me.remaining_budget === 166, String(g2.me.remaining_budget));

const antesDeReversa = (await estado(host)).me.remaining_budget;
await tirar(host, 'Impuesto', NOMBRE_INVITADO);
const h2 = await estado(host);

check(
  'la reversa sí le cobra al que tira',
  h2.me.remaining_budget === antesDeReversa - 20,
  `${antesDeReversa} → ${h2.me.remaining_budget}`
);

// El efecto tiene que quedar apuntando al que lo tiró, no al que lo recibió.
const efectos = h2.effects ?? [];
const impuesto = efectos.find((e) => e.power === 'impuesto');
check(
  'el impuesto le queda al que lo tiró',
  !!impuesto && impuesto.target_id === h2.me.id,
  impuesto ? (impuesto.target_id === h2.me.id ? 'al que lo tiró' : 'al rival') : 'no hay efecto'
);

console.log(fallos ? `\n${fallos} fallaron` : '\ntodo en orden');
await browser.close();
process.exit(fallos ? 1 : 0);
