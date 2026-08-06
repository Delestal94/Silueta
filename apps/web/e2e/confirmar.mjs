/**
 * Pasar de silueta por acuerdo de todos, y el final del juego.
 *
 * Lo que hay que ver es lo que NO pasa: con uno solo confirmando, la ronda no
 * avanza. Eso no se ve mirando un botón, hay que esperar y comprobar que la
 * ficha sigue ahí.
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
  (await browser.newContext({ viewport: { width: 1400, height: 950 } })).newPage();

const host = await mkPage();
await host.goto(BASE);
await host.getByRole('button', { name: 'Crear sala' }).click();
await host.getByPlaceholder('Ej: Davo').fill(NOMBRE_ANFITRION);
await host.locator('input[type=number]').nth(1).fill('5');
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

// Primera ronda: arranca cuando confirman los dos.
await guest.getByRole('button', { name: 'Estoy listo' }).click();
await host.getByRole('button', { name: 'Estoy listo' }).click();
await host.waitForSelector('img[alt*="Silueta"]', { timeout: 25000 });

// Dejar que cierre sola y llegar a la revelación.
// Sin distinguir mayúsculas: la etiqueta lleva `uppercase` por CSS y en
// Chromium innerText devuelve el texto ya transformado.
await host.waitForFunction(() => /vendido|nadie lo compr/i.test(document.body.innerText), null, {
  timeout: 40000,
});

check(
  'en la revelación ya no hay botón de anfitrión',
  (await host.getByRole('button', { name: 'Siguiente silueta' }).count()) === 0
);
check(
  'el invitado también puede confirmar',
  (await guest.getByRole('button', { name: 'Estoy listo' }).count()) > 0
);

// Sólo el anfitrión confirma: la ronda NO tiene que avanzar.
const rondaAntes = (await estado(host)).currentRound.round_number;
await host.getByRole('button', { name: 'Estoy listo' }).first().click();
await host.waitForTimeout(4000);
const rondaDespues = (await estado(host)).currentRound.round_number;
check(
  'con uno solo confirmando no avanza',
  rondaAntes === rondaDespues,
  `ronda ${rondaAntes} → ${rondaDespues}`
);

// Confirma el segundo: ahí sí.
await guest.getByRole('button', { name: 'Estoy listo' }).first().click();
await host.waitForFunction(
  (n) => !document.body.innerText.includes(`Ronda ${n} ·`),
  rondaAntes,
  { timeout: 25000 }
).catch(() => {});
await host.waitForTimeout(2000);
check(
  'con los dos confirmando avanza',
  (await estado(host)).currentRound.round_number > rondaAntes,
  `ronda ${(await estado(host)).currentRound.round_number}`
);

// Jugar hasta que los equipos estén completos y mirar el botón final.
for (let i = 0; i < 40; i++) {
  const s = await estado(host);
  if (s.room?.status === 'finished') break;

  const completos =
    s.room.room_participants.length > 0 &&
    s.room.room_participants.every((p) => {
      const req = s.room.requirements;
      const tengo = {};
      for (const t of p.team_players ?? []) {
        const k = t.players?.position_type;
        tengo[k] = (tengo[k] ?? 0) + 1;
      }
      return Object.entries(req).every(([k, v]) => (tengo[k] ?? 0) >= v);
    });

  if (completos) {
    const verResultado = await host.getByRole('button', { name: 'Ver resultado' }).count();
    check('con los equipos completos dice "Ver resultado"', verResultado > 0);
    break;
  }

  for (const p of [host, guest]) {
    const b = p.getByRole('button', { name: /Estoy listo|Ver resultado/ });
    if (await b.count()) await b.first().click().catch(() => {});
  }
  await host.waitForTimeout(2200);
}

console.log(fallos ? `\n${fallos} fallaron` : '\ntodo en orden');
await browser.close();
process.exit(fallos ? 1 : 0);
