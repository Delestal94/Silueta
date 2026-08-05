/**
 * A sealed-bid room, played through.
 *
 * The assertion that matters is the leak one: while the round is open, the
 * state a rival receives must not contain anybody else's number — not in a
 * field, not anywhere in the payload. Everything else is ordinary game logic.
 */
import { chromium } from 'playwright';
import { avanzar, esperarRevelacion } from './helpers.mjs';

const BASE = process.argv[2] || 'http://localhost:3000';
const browser = await chromium.launch();
const errors = [];
let failures = 0;

const check = (label, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures++;
};

const mkPage = async (label) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(`[${label}] ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`[${label}] ${e.message}`));
  return page;
};

// --- Host opens a sealed room
const host = await mkPage('host');
await host.goto(BASE);
await host.getByRole('button', { name: 'Crear sala' }).click();
await host.getByPlaceholder('Ej: Davo').fill('Davo');
// A big budget so the two envelopes can be numbers that appear nowhere else in
// the payload — ratings stop at 99 and seasons are four digits, so 137 and 619
// cannot be confused with anything the state legitimately carries. 990 and not
// 999: the field steps in tens, and an off-step value fails native validation,
// which blocks the submit without any visible error.
await host.locator('input[type=number]').first().fill('990');
// role=radio, no button: el selector de modo es un radiogroup accesible.
await host.getByRole('radio', { name: 'Sobre cerrado' }).click();
await host.getByRole('button', { name: 'Crear sala' }).click();
await host.waitForURL(/\/room\//, { timeout: 20000 });
const code = host.url().split('/room/')[1];
console.log('sala', code, '(sobre cerrado)');

const guest = await mkPage('guest');
await guest.goto(BASE);
await guest.getByRole('button', { name: 'Unirme con un código' }).click();
await guest.getByPlaceholder('ABC123').fill(code);
await guest.getByPlaceholder('Ej: La Cobra').fill('Cobra');
await guest.getByRole('button', { name: 'Entrar', exact: true }).click();
await guest.waitForURL(/\/room\//, { timeout: 20000 });
await host.waitForFunction(() => document.body.innerText.includes('Cobra'), null, {
  timeout: 20000,
});

// --- Start the round
await guest.getByRole('button', { name: 'Estoy listo' }).click();
await host.getByRole('button', { name: 'Estoy listo' }).click();
await host.waitForSelector('img[alt*="Silueta"]', { timeout: 25000 });

// :visible — el panel existe dos veces, una por vista; sólo una está en pantalla.
const sealField = (p) => p.getByLabel(/máximo que pagarías/).locator('visible=true');
check('el modo dibuja el campo de sobre', (await sealField(host).count()) === 1);
check('no hay botones de puja escalonada', (await host.getByTitle(/^Pujar/).count()) === 0);

// --- Both seal, with different numbers
await sealField(host).fill('137');
await host.getByRole('button', { name: 'Guardar' }).locator('visible=true').click();
await host.waitForTimeout(900);

await sealField(guest).fill('619');
await guest.getByRole('button', { name: 'Guardar' }).locator('visible=true').click();
await guest.waitForTimeout(900);

// --- THE leak test: read the raw state each client is given
const stateOf = async (page) => {
  const token = await page.evaluate(
    (c) => JSON.parse(localStorage.getItem(`room_${c}`)).clientToken,
    code
  );
  return page.evaluate(
    async ([c, t]) => {
      const r = await fetch(`/api/rooms/${c}/state`, { headers: { 'x-client-token': t } });
      return r.text();
    },
    [code, token]
  );
};

const hostSees = await stateOf(host);
const guestSees = await stateOf(guest);

check('el anfitrión no ve el sobre del rival (619)', !hostSees.includes('619'), 'buscado en el payload crudo');
check('el invitado no ve el sobre del anfitrión (137)', !guestSees.includes('137'), 'buscado en el payload crudo');
check('el anfitrión sí ve el suyo', JSON.parse(hostSees).currentRound?.myEnvelope === 137);
check('el invitado sí ve el suyo', JSON.parse(guestSees).currentRound?.myEnvelope === 619);

const hs = JSON.parse(hostSees).currentRound;
check(
  'nadie va ganando todavía',
  !hs.current_bid && hs.current_bid_by === null,
  `current_bid=${JSON.stringify(hs.current_bid)} current_bid_by=${JSON.stringify(hs.current_bid_by)}`
);
check('se cuentan los sobres puestos', hs.envelopesIn === 2, `envelopesIn=${hs.envelopesIn}`);
check('no viaja la lista de sobres', hs.envelopes === null || hs.envelopes === undefined);

// --- Let the clock run out and check who won
await esperarRevelacion(host);
await host.waitForTimeout(1500);

const after = JSON.parse(await stateOf(host)).currentRound;
check('gana el sobre más alto', after.current_bid === 619, `pagó ${after.current_bid}`);
check('ahora sí se abren los dos sobres', (after.envelopes ?? []).length === 2);
check(
  'los sobres salen ordenados de mayor a menor',
  (after.envelopes ?? []).map((e) => e.amount).join(',') === '619,137'
);

const shown = await host.locator('text=Los sobres').count();
check('la revelación los muestra en pantalla', shown > 0);

console.log('\nerrores de consola:', errors.length ? errors : 0);
console.log(failures ? `\n${failures} comprobaciones fallaron` : '\ntodo en orden');
await browser.close();
process.exit(failures ? 1 : 0);
