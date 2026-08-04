/**
 * A CSP that blocks something breaks the page quietly: the browser refuses the
 * resource and only says so in the console. So play a whole round with the
 * console under watch.
 *
 * This caught the one that mattered: with 'unsafe-eval' withheld, the dev
 * server rendered the landing page perfectly and no button worked, because
 * hot-reload compiles modules with eval. Curling the page would never have
 * shown it.
 *
 * Run it against a production build too — that is the one that ships, and it
 * is stricter:
 *
 *   npm run build --workspace=apps/web
 *   PORT=3001 npx next start        # desde apps/web
 *   node apps/web/e2e/csp.mjs http://localhost:3001
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:3000';
const browser = await chromium.launch();
const bloqueos = [];
const errores = [];

const mkPage = async (label) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    const t = m.text();
    if (/Content Security Policy|Refused to/i.test(t)) bloqueos.push(`[${label}] ${t}`);
    else if (m.type() === 'error') errores.push(`[${label}] ${t}`);
  });
  page.on('pageerror', (e) => errores.push(`[${label}] ${e.message}`));
  page.on('requestfailed', (r) => {
    const f = r.failure()?.errorText ?? '';
    if (/blocked/i.test(f)) bloqueos.push(`[${label}] ${f} ${r.url().slice(0, 90)}`);
  });
  return page;
};

const host = await mkPage('host');
await host.goto(BASE, { waitUntil: 'networkidle' });
await host.waitForTimeout(3000);
await host.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await host.waitForTimeout(1500);

await host.getByRole('button', { name: 'Crear sala' }).first().click();
await host.getByPlaceholder('Ej: Davo').fill('Davo');
await host.getByRole('button', { name: 'Crear sala' }).click();
await host.waitForURL(/\/room\//, { timeout: 20000 });
const code = host.url().split('/room/')[1];

const guest = await mkPage('guest');
await guest.goto(BASE);
await guest.getByRole('button', { name: 'Unirme con un código' }).click();
await guest.getByPlaceholder('ABC123').fill(code);
await guest.getByPlaceholder('Ej: La Cobra').fill('Cobra');
await guest.getByRole('button', { name: 'Entrar', exact: true }).click();
await guest.waitForURL(/\/room\//, { timeout: 20000 });

// El tiempo real usa WebSocket a Supabase: si connect-src estuviera mal, el
// invitado no aparecería nunca en la pantalla del anfitrión.
await host.waitForFunction(() => document.body.innerText.includes('Cobra'), null, {
  timeout: 20000,
});
console.log('PASS el tiempo real llega (websocket a Supabase permitido)');

await guest.getByRole('button', { name: 'Estoy listo' }).click();
await host.getByRole('button', { name: 'Estoy listo' }).click();
await host.waitForSelector('img[alt*="Silueta"]', { timeout: 25000 });
await guest.getByTitle(/^Pujar/).first().click();
await host.waitForSelector('text=Siguiente silueta', { timeout: 45000 });
await host.waitForTimeout(2500);

// La revelación trae la foto en color y la carta de EA, de dominios distintos.
const imgs = await host.evaluate(() =>
  [...document.images].map((i) => ({
    src: i.currentSrc.slice(0, 70),
    ok: i.complete && i.naturalWidth > 0,
  }))
);
const rotas = imgs.filter((i) => !i.ok);
console.log(`PASS ${imgs.length} imágenes, ${rotas.length} rotas`, rotas.map((r) => r.src).join(' '));

console.log('\nbloqueos de CSP:', bloqueos.length ? bloqueos : 'ninguno');
console.log('errores de consola:', errores.length ? errores : 0);
await browser.close();
process.exit(bloqueos.length || rotas.length ? 1 : 0);
