/**
 * Mide si la sala entra en pantalla, con y sin el aviso del Soplo.
 *
 * El Soplo agrega una tarjeta arriba de los controles, y ese alto sale de algún
 * lado: la columna está atada a la altura de la ventana.
 *
 * Lo que hay que mirar es la columna "recorte": positivo significa que la
 * silueta se sale del panel y el navegador la corta. Y el alto de la silueta,
 * que no puede desplomarse cuando aparece un aviso — así se veía el problema
 * original, con 13px de figura en un monitor de 19 pulgadas.
 *
 *   node apps/web/e2e/fit.mjs
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const browser = await chromium.launch();

const RESOLUCIONES = [
  [1920, 1080],
  [1600, 900],
  [1536, 864],
  [1366, 768],
  [1280, 720],
  [1440, 900],
  [1280, 1024],
  [1024, 768],
];

const host = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
await host.goto(BASE);
await host.getByRole('button', { name: 'Crear sala' }).click();
await host.getByPlaceholder('Ej: Davo').fill('Davo');
await host.locator('input[type=number]').nth(1).fill('120');
await host.getByRole('button', { name: 'Crear sala' }).click();
await host.waitForURL(/\/room\//, { timeout: 20000 });
const code = host.url().split('/room/')[1];

const guest = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await guest.goto(BASE);
await guest.getByRole('button', { name: 'Unirme con un código' }).click();
await guest.getByPlaceholder('ABC123').fill(code);
await guest.getByPlaceholder('Ej: La Cobra').fill('Cobra');
await guest.getByRole('button', { name: 'Entrar', exact: true }).click();
await guest.waitForURL(/\/room\//, { timeout: 20000 });
await host.waitForFunction(() => document.body.innerText.includes('Cobra'), null, { timeout: 20000 });

await guest.getByRole('button', { name: 'Estoy listo' }).click();
await host.getByRole('button', { name: 'Estoy listo' }).click();
await host.waitForSelector('img[alt*="Silueta"]', { timeout: 25000 });

const medir = async (etiqueta) => {
  console.log(`\n${etiqueta}`);
  for (const [w, h] of RESOLUCIONES) {
    await host.setViewportSize({ width: w, height: h });
    await host.waitForTimeout(700);

    const m = await host.evaluate(() => {
      const img = document.querySelector('img[alt*="Silueta"]');
      if (!img) return null;
      const r = img.getBoundingClientRect();
      const pane = img.closest('.panel');
      const p = pane?.getBoundingClientRect();
      // ¿Se sale de la ventana por abajo? ¿Y los controles?
      const controles = [...document.querySelectorAll('button')].find((b) =>
        /^Pasar/.test(b.textContent || '')
      );
      const c = controles?.getBoundingClientRect();
      return {
        alto: Math.round(r.height),
        recortadaPorElPanel: p ? Math.round(r.bottom - p.bottom) : 0,
        fueraDeVentana: Math.round(r.bottom - window.innerHeight),
        pasarVisible: c ? c.bottom <= window.innerHeight + 1 : null,
        scrollPagina: document.documentElement.scrollHeight > window.innerHeight + 1,
      };
    });

    const alarma =
      m.recortadaPorElPanel > 1 || m.fueraDeVentana > 1 || m.pasarVisible === false ? '  ⟵ MAL' : '';
    console.log(
      `  ${String(w).padStart(4)}x${String(h).padStart(4)}  silueta ${String(m.alto).padStart(3)}px` +
        ` | recorte ${String(m.recortadaPorElPanel).padStart(4)}px` +
        ` | fuera de ventana ${String(m.fueraDeVentana).padStart(4)}px` +
        ` | "Pasar" visible: ${m.pasarVisible}` +
        alarma
    );
  }
};

await medir('SIN el aviso del Soplo');

// Soplo: es auto-dirigido, así que se aplica al instante.
await host.locator('[aria-label^="Soplo"]:visible').click();
await host.waitForTimeout(2000);
console.log('\n¿apareció el aviso?', await host.locator('text=/Soplo|nacionalidad/i').count());

await medir('CON el aviso del Soplo');

await browser.close();
