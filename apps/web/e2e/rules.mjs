import { chromium } from 'playwright';
const BASE = process.argv[2] || 'http://localhost:3000';
const SHOT = 'C:/Users/migue/AppData/Local/Temp/claude/d--Programas-Utilities-Proyectos-Siluetas/ed3f0880-0d1f-472e-b522-7dccb38476fc/scratchpad';

const browser = await chromium.launch();
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await ctx.newPage();
page.on('pageerror', e => errors.push(e.message));

// Landing
await page.goto(BASE);
await page.waitForSelector('text=Cómo se juega');
console.log('PASS reglas visibles en la portada');
for (const t of ['El objetivo', 'La época', 'Pujar', 'El pase', 'Poderes']) {
  const found = await page.locator(`text=${t}`).count();
  if (!found) console.log(`  FALTA sección: ${t}`);
}
await page.screenshot({ path: `${SHOT}/rules_landing.png`, fullPage: true });

// In-game
await page.getByRole('button', { name: 'Crear sala' }).first().click();
await page.getByPlaceholder('Ej: Davo').fill('Lector');
await page.getByRole('button', { name: 'Crear sala' }).click();
await page.waitForURL(/\/room\//, { timeout: 20000 });

await page.getByRole('button', { name: 'Reglas' }).click();
await page.waitForSelector('[role=dialog]');
console.log('PASS el botón abre las reglas en la partida');
await page.waitForTimeout(600);
await page.screenshot({ path: `${SHOT}/rules_modal.png` });

// Escape must close it
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
console.log('PASS se cierra con Escape:', (await page.locator('[role=dialog]').count()) === 0);

// Mobile
const mob = await browser.newContext({ viewport: { width: 390, height: 844 } });
const mp = await mob.newPage();
await mp.goto(BASE);
await mp.waitForSelector('text=Cómo se juega');
const overflow = await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
console.log('PASS sin desborde horizontal en móvil:', !overflow);

console.log('\nerrores de consola:', errors.length);
await browser.close();
