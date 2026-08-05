/**
 * El interruptor de leyendas, comprobado jugando rondas.
 *
 * Existe porque durante mucho tiempo las leyendas estaban en la tabla y no
 * salían nunca: 0013 apagaba a todo el que no tuviera ea_id, y ninguna lo
 * tiene. Un test que sólo mirara la tabla no lo habría visto.
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

/** Juega N rondas y devuelve los nombres que salieron. */
async function jugar(conLeyendas, rondas) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Crear sala' }).click();
  await page.getByPlaceholder('Ej: Davo').fill('T' + Date.now().toString().slice(-5));
  await page.locator('input[type=number]').nth(1).fill('5');

  const casilla = page.getByRole('checkbox', { name: /Leyendas/ });
  if (!conLeyendas) await casilla.uncheck();
  check(`la casilla queda ${conLeyendas ? 'marcada' : 'desmarcada'}`, (await casilla.isChecked()) === conLeyendas);

  await page.getByRole('button', { name: 'Crear sala' }).click();
  await page.waitForURL(/\/room\//, { timeout: 20000 });
  const code = page.url().split('/room/')[1];

  const token = await page.evaluate(
    (c) => JSON.parse(localStorage.getItem(`room_${c}`)).clientToken,
    code
  );
  const estado = () =>
    page.evaluate(
      async ([c, t]) => (await fetch(`/api/rooms/${c}/state`, { headers: { 'x-client-token': t } })).json(),
      [code, token]
    );

  await page.getByRole('button', { name: 'Estoy listo' }).click();

  const vistos = [];
  for (let i = 0; i < rondas * 4 && vistos.length < rondas; i++) {
    const s = await estado();
    if (s.room?.status === 'finished') break;

    const r = s.currentRound;
    if (r?.revealed && r.player?.name && !vistos.some((v) => v.name === r.player.name)) {
      // league, no el nombre: el ingest de leyendas las marca con 'Leyendas'.
      // Comparando por apellido, "Kasper Schmeichel" —hijo de Peter, y en
      // actividad— contaba como leyenda y el test se aprobaba solo.
      vistos.push({ name: r.player.name, leyenda: r.player.league === 'Leyendas' });
    }

    if (await avanzar(page)) await page.waitForTimeout(800);
    else await page.waitForTimeout(1700);
  }

  await page.context().close();
  return vistos;
}

// Sin leyendas: ninguna de las curadas puede aparecer.
const nombres = (v) => v.map((x) => x.name + (x.leyenda ? ' [leyenda]' : '')).join(', ');

const sin = await jugar(false, 6);
console.log('  sin leyendas, salieron:', nombres(sin) || '(ninguna ronda)');
check('apagado no sale ninguna leyenda', sin.length > 0 && !sin.some((x) => x.leyenda));

// Con leyendas: en "más famosos" son más de la mitad del pool, así que en seis
// rondas tiene que salir alguna.
const con = await jugar(true, 6);
console.log('  con leyendas, salieron:', nombres(con) || '(ninguna ronda)');
check(
  'encendido sí salen leyendas',
  con.some((x) => x.leyenda),
  con.filter((x) => x.leyenda).map((x) => x.name).join(', ') || 'ninguna'
);

console.log(fallos ? `\n${fallos} fallaron` : '\ntodo en orden');
await browser.close();
process.exit(fallos ? 1 : 0);
