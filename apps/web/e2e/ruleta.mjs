/**
 * La ruleta de empate, jugada de punta a punta.
 *
 * Dos empujados ofertan 25 cada uno y nadie más puja. Lo que hay que ver: que
 * ofertar no les cueste nada, que sólo pague el que se lo lleva, que la ruleta
 * aparezca, y —lo más importante— que los nombres no estén en el DOM mientras
 * gira. Un nombre tapado con CSS se lee igual desde el inspector.
 */
import { chromium } from 'playwright';

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
await host.getByPlaceholder('Ej: Davo').fill('Davo');
await host.locator('input[type=number]').nth(1).fill('8');
await host.getByRole('button', { name: 'Crear sala' }).click();
await host.waitForURL(/\/room\//, { timeout: 20000 });
const code = host.url().split('/room/')[1];

const invitados = [];
for (const nombre of ['Cobra', 'Teo']) {
  const p = await mkPage();
  await p.goto(BASE);
  await p.getByRole('button', { name: 'Unirme con un código' }).click();
  await p.getByPlaceholder('ABC123').fill(code);
  await p.getByPlaceholder('Ej: La Cobra').fill(nombre);
  await p.getByRole('button', { name: 'Entrar', exact: true }).click();
  await p.waitForURL(/\/room\//, { timeout: 20000 });
  invitados.push({ nombre, page: p });
}
await host.waitForFunction(() => document.body.innerText.includes('Teo'), null, { timeout: 20000 });

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

// El anfitrión empuja a los dos invitados.
for (const { nombre } of invitados) {
  await host.locator('[aria-label^="Empujón"]:visible').click();
  const destino = host
    .locator('.panel:has-text("Poderes"):visible button:visible')
    .filter({ hasText: nombre });
  await destino.first().waitFor({ timeout: 10000 });
  await destino.first().click();
  await host.waitForTimeout(1500);
}

const antes = await estado(host);
check('el que empuja pagó 40', antes.me.remaining_budget === 160, String(antes.me.remaining_budget));

// Arrancar la ronda y dejar que el reloj la cierre sin que nadie más puje.
for (const { page } of invitados) await page.getByRole('button', { name: 'Estoy listo' }).click();
await host.getByRole('button', { name: 'Estoy listo' }).click();
await host.waitForSelector('img[alt*="Silueta"]', { timeout: 25000 });
await host.waitForTimeout(1200);

const enRonda = await estado(host);
check(
  'a los empujados no se les cobra al ofertar',
  enRonda.room.room_participants
    .filter((p) => p.display_name !== 'Davo')
    .every((p) => p.remaining_budget === 200),
  enRonda.room.room_participants.map((p) => `${p.display_name}=${p.remaining_budget}`).join(' ')
);
check('nadie figura ganando', enRonda.currentRound.current_bid_by === null);

// Mientras gira, ningún nombre puede estar en el DOM de la ruleta.
await host.waitForSelector('text=Empataron la oferta', { timeout: 40000 });
const textoGirando = await host.locator('div:has-text("Empataron la oferta")').last().innerText();
check(
  'los nombres no se pueden leer mientras gira',
  !textoGirando.includes('Cobra') && !textoGirando.includes('Teo'),
  JSON.stringify(textoGirando.replace(/\n/g, ' ').slice(0, 60))
);

// Al frenar, destapa al ganador.
await host.waitForTimeout(4000);
const textoFinal = await host.locator('div:has-text("Empataron la oferta")').last().innerText();
const destapado = ['Cobra', 'Teo'].filter((n) => textoFinal.includes(n));
check('al frenar destapa a uno solo', destapado.length === 1, destapado.join(', ') || 'ninguno');

const fin = await estado(host);
const ganador = fin.room.room_participants.find((p) => p.id === fin.currentRound.current_bid_by);
check('el destapado es el que ganó', ganador && destapado[0] === ganador.display_name, ganador?.display_name);
check(
  'sólo paga el que se lo lleva',
  ganador && ganador.remaining_budget === 175,
  String(ganador?.remaining_budget)
);

const perdedor = fin.room.room_participants.find(
  (p) => p.display_name !== 'Davo' && p.id !== fin.currentRound.current_bid_by
);
check(
  'al que perdió el sorteo no le costó nada',
  perdedor && perdedor.remaining_budget === 200,
  String(perdedor?.remaining_budget)
);

console.log(fallos ? `\n${fallos} fallaron` : '\ntodo en orden');
await browser.close();
process.exit(fallos ? 1 : 0);
