/**
 * Lo que todos los tests necesitan hacer con una ronda.
 *
 * Vive acá porque la forma de avanzar cambió: antes el anfitrión tenía un botón
 * "Siguiente silueta" y ahora confirman todos. Con la espera repetida en siete
 * archivos, ese cambio los rompió a los siete a la vez.
 */

/**
 * Espera a que la ronda cierre y aparezca la ficha del jugador.
 *
 * Sin distinguir mayúsculas: la etiqueta lleva `uppercase` por CSS, y en
 * Chromium innerText devuelve el texto ya transformado — buscar "Vendido" no
 * encuentra "VENDIDO".
 */
export const esperarRevelacion = (page, timeout = 45000) =>
  page.waitForFunction(() => /vendido|nadie lo compr/i.test(document.body.innerText), null, {
    timeout,
  });

/**
 * Pasa a la ronda siguiente confirmando desde todas las páginas.
 *
 * Devuelve false si no había nada que confirmar, que es como se detecta que la
 * partida terminó.
 */
export async function avanzar(pages) {
  let alguno = false;

  for (const page of [pages].flat()) {
    const boton = page.getByRole('button', { name: /Estoy listo|Ver resultado/ });
    if (await boton.count()) {
      await boton
        .first()
        .click()
        .catch(() => {});
      alguno = true;
      await page.waitForTimeout(250);
    }
  }

  return alguno;
}

/**
 * Un nombre que se reconoce como de prueba.
 *
 * Los tests juegan partidas de verdad contra la base de verdad, así que sus
 * resultados terminan en el ranking público. Con este prefijo se los puede
 * separar después sin adivinar — antes usaban "Davo" y "Cobra", que son
 * nombres que una persona real también elige, y no había forma de distinguir
 * una partida de prueba de una jugada.
 *
 * Se limpian con: npm run purge-tests --workspace=packages/ingest -- --si
 */
export const nombreDePrueba = (prefijo = 'T') =>
  prefijo + Date.now().toString().slice(-5);
