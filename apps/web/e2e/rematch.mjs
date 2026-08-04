/**
 * Una revancha completa.
 *
 * Lo que hay que probar de verdad no es el botón: es que la partida anterior
 * siga contando en el ranking después de que la revancha borre los equipos, y
 * que la configuración nueva realmente rija.
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:3000';
const browser = await chromium.launch();
let fallos = 0;

const check = (label, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`);
  if (!ok) fallos++;
};

const mkPage = async () => (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();

// Sala de un solo jugador y presupuesto chico: así la partida entera son cinco
// rondas cortas y el sorteo las resuelve sin que nadie tenga que ofertar.
const host = await mkPage();
await host.goto(BASE);
await host.getByRole('button', { name: 'Crear sala' }).click();
// Nombre único por corrida: buscar "Davo" en el ranking encontraba las
// partidas de pruebas anteriores y el test se aprobaba solo.
const NOMBRE = 'Rev' + Date.now().toString().slice(-6);
await host.getByPlaceholder('Ej: Davo').fill(NOMBRE);
await host.locator('input[type=number]').nth(1).fill('5');
await host.getByRole('button', { name: 'Crear sala' }).click();
await host.waitForURL(/\/room\//, { timeout: 20000 });
const code = host.url().split('/room/')[1];
console.log('sala', code);

const stateOf = async () => {
  const token = await host.evaluate(
    (c) => JSON.parse(localStorage.getItem(`room_${c}`)).clientToken,
    code
  );
  return host.evaluate(
    async ([c, t]) => (await fetch(`/api/rooms/${c}/state`, { headers: { 'x-client-token': t } })).json(),
    [code, token]
  );
};
const ranking = () =>
  host.evaluate(async () => (await fetch('/api/leaderboard')).json());

// Jugar hasta el final: cinco puestos, dejando que el reloj los sortee.
await host.getByRole('button', { name: 'Estoy listo' }).click();

// Cinco puestos, cada ronda de 5s más la revelación. Se avanza cuando aparece
// el botón, no cada N segundos a ciegas.
for (let i = 0; i < 40; i++) {
  const s = await stateOf();
  if (s.room?.status === 'finished') break;

  const next = host.getByRole('button', { name: 'Siguiente silueta' });
  if (await next.count()) {
    await next.click().catch(() => {});
    await host.waitForTimeout(900);
  } else {
    // Ronda en curso: dejar que el reloj la cierre.
    await host.waitForTimeout(1800);
  }
}

const fin = await stateOf();
check('la partida terminó', fin.room?.status === 'finished', fin.room?.status);

const antes = await ranking();
const filaAntes = antes.entries?.find((e) => e.display_name === NOMBRE);
check('quedó registrado en el ranking', !!filaAntes, `partidas=${filaAntes?.games}`);

check('aparece el botón de jugar de nuevo', await host.getByRole('button', { name: 'Jugar de nuevo' }).count() === 1);

// Cambiar la configuración y volver a jugar.
await host.getByRole('button', { name: 'Cambiar la configuración' }).click();
await host.getByRole('radio', { name: 'Sobre cerrado' }).click();
await host.locator('input[type=number]').first().fill('500');
await host.getByRole('button', { name: 'Jugar de nuevo' }).click();
await host.waitForTimeout(3000);

const nueva = await stateOf();
check('la sala volvió al lobby', nueva.room?.status === 'lobby', nueva.room?.status);
check('rige el modo nuevo', nueva.room?.auction_mode === 'sealed', nueva.room?.auction_mode);
check('rige el presupuesto nuevo', nueva.room?.starting_budget === 500, String(nueva.room?.starting_budget));
check('el presupuesto volvió entero', nueva.me?.remaining_budget === 500, String(nueva.me?.remaining_budget));
check('se borraron los equipos', (nueva.room?.room_participants?.[0]?.team_players ?? []).length === 0);
check('el código no cambió', host.url().includes(code));

// Lo que más importa: la partida anterior no se perdió del ranking.
const despues = await ranking();
const filaDespues = despues.entries?.find((e) => e.display_name === NOMBRE);
check(
  'la partida jugada sigue en el ranking',
  !!filaDespues && filaDespues.games >= (filaAntes?.games ?? 1),
  `antes=${filaAntes?.games} después=${filaDespues?.games}`
);

console.log(fallos ? `\n${fallos} fallaron` : '\ntodo en orden');
await browser.close();
process.exit(fallos ? 1 : 0);
