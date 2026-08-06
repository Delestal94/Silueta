/**
 * El empujón, comprobado jugando.
 *
 * Lo que hay que ver no es que el botón exista: es que la víctima entre a la
 * ronda siguiente con una oferta puesta que ella no hizo, y que el reloj no se
 * haya reiniciado por eso.
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
// Rondas largas: hace falta tiempo para tirar el poder y mirar el estado.
await host.locator('input[type=number]').nth(1).fill('30');
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

// --- Está en el panel
const icono = host.locator('[aria-label^="Empujón"]:visible');
check('el poder aparece en el panel', (await icono.count()) === 1);

const antes = await estado(host);
const presupuestoAntes = antes.me.remaining_budget;

// --- Tirárselo al invitado
await icono.click();
// Acotado al selector del poder, y con texto exacto. Sin las dos cosas,
// getByRole hace coincidencia por substring y "Cobra" también matchea el botón
// "Echar a Cobra" del roster; y el panel se dibuja dos veces —rail y pestañas
// del celular—, cada copia con su propio estado.
await host
  .locator('div:has(> p:text-is("¿A quién le tirás Empujón?")):visible')
  .getByRole('button', { name: NOMBRE_INVITADO, exact: true })
  .click();
await host.waitForTimeout(1500);

const trasTirar = await estado(host);
check(
  'le cuesta 20 a quien lo tira',
  trasTirar.me.remaining_budget === presupuestoAntes - 20,
  `${presupuestoAntes} → ${trasTirar.me.remaining_budget}`
);

// --- Arrancar la ronda
await guest.getByRole('button', { name: 'Estoy listo' }).click();
await host.getByRole('button', { name: 'Estoy listo' }).click();
await host.waitForSelector('img[alt*="Silueta"]', { timeout: 25000 });
await host.waitForTimeout(1200);

const enRonda = await estado(host);
const r = enRonda.currentRound;
const cobra = enRonda.room.room_participants.find((p) => p.display_name === NOMBRE_INVITADO);

check('la víctima ya ofertó sin haber tocado nada', r.current_bid === 25, `puja=${r.current_bid}`);
check('y la oferta figura a su nombre', r.current_bid_by === cobra.id);

// El reloj no se reinicia: la ronda recién arranca.
const restante = (new Date(r.ends_at) - new Date(r.starts_at)) / 1000;
check('el reloj no se reinició por la oferta forzada', Math.abs(restante - 30) < 2, `${restante}s`);

// La víctima se entera.
const aviso = await guest.locator('text=/Te empujaron/').count();
check('la víctima ve el aviso', aviso > 0);

console.log(fallos ? `\n${fallos} fallaron` : '\ntodo en orden');
await browser.close();
process.exit(fallos ? 1 : 0);
