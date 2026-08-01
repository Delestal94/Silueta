import { chromium } from 'playwright';
const BASE = 'http://localhost:3000';
const SHOT = 'C:/Users/migue/AppData/Local/Temp/claude/d--Programas-Utilities-Proyectos-Siluetas/ed3f0880-0d1f-472e-b522-7dccb38476fc/scratchpad';

const browser = await chromium.launch();
const errors = [];

const mkPage = async (label) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push(`[${label}] ${m.text()}`); });
  page.on('pageerror', e => errors.push(`[${label}] pageerror: ${e.message}`));
  return page;
};

// --- Host creates room
const host = await mkPage('host');
await host.goto(BASE);
await host.getByRole('button', { name: 'Crear sala' }).click();
await host.getByPlaceholder('Ej: Davo').fill('Davo');
await host.locator('input[type=number]').first().fill('150');
await host.locator('input[type=number]').nth(1).fill('15');
await host.getByRole('button', { name: 'Crear sala' }).click();
await host.waitForURL(/\/room\//, { timeout: 15000 });
const code = host.url().split('/room/')[1];
console.log('room', code);
await host.screenshot({ path: `${SHOT}/ui_1_lobby.png` });

// --- Guest joins
const guest = await mkPage('guest');
await guest.goto(BASE);
await guest.getByRole('button', { name: 'Unirme con un código' }).click();
await guest.getByPlaceholder('ABC123').fill(code);
await guest.getByPlaceholder('Ej: La Cobra').fill('Cobra');
await guest.getByRole('button', { name: 'Entrar' }).click();
await guest.waitForURL(/\/room\//, { timeout: 15000 });

// --- Host sees guest appear (realtime)
await host.waitForSelector('text=Cobra', { timeout: 15000 });
console.log('PASS guest appeared on host screen via realtime');

// --- Start round
await host.getByRole('button', { name: 'Lanzar silueta' }).click();
await host.waitForSelector('img[alt*="Silueta"]', { timeout: 15000 });
await guest.waitForSelector('img[alt*="Silueta"]', { timeout: 15000 });
console.log('PASS both clients show the silhouette');
await host.screenshot({ path: `${SHOT}/ui_2_auction.png` });

// --- Name must not be in the DOM while bidding
const hostHtml = await host.content();
console.log('PASS name hidden during bidding:', !/Vendido|Se lo lleva/.test(hostHtml));

// --- Guest bids, host sees it live
await guest.getByTitle(/^Pujar/).first().click();
await host.waitForSelector('text=va ganando', { timeout: 15000 });
const bidText = await host.locator('text=va ganando').first().textContent();
console.log('PASS host sees live bid:', bidText?.trim());

// --- Wait for the round to settle and reveal
await host.waitForSelector('text=Siguiente silueta', { timeout: 40000 });
console.log('PASS round auto-finalized and revealed');

// Every visible image must actually decode, not just have a src.
await host.waitForTimeout(2500);
const imgs = await host.evaluate(() =>
  [...document.images].map((i) => ({ src: i.currentSrc.slice(-40), ok: i.complete && i.naturalWidth > 0 }))
);
const broken = imgs.filter((i) => !i.ok);
console.log(`PASS all ${imgs.length} images loaded:`, broken.length === 0, broken.map(b => b.src).join(','));
await host.screenshot({ path: `${SHOT}/ui_3_reveal.png` });

const revealed = await host.locator('h2').last().textContent();
console.log('       revealed player:', revealed?.trim());

// --- Guest roster updated
await guest.waitForSelector('text=Tu equipo', { timeout: 10000 });
await guest.screenshot({ path: `${SHOT}/ui_4_guest.png` });

// --- Mobile viewport check
const mob = await browser.newContext({ viewport: { width: 390, height: 844 } });
const mp = await mob.newPage();
await mp.goto(`${BASE}/room/${code}`);
await mp.waitForTimeout(2500);
const overflow = await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
console.log('PASS no horizontal overflow on mobile:', !overflow);
await mp.screenshot({ path: `${SHOT}/ui_5_mobile.png`, fullPage: true });

console.log('\nconsole errors:', errors.length);
errors.slice(0, 10).forEach(e => console.log('  ' + e));
await browser.close();
