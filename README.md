# Siluetas — Subasta Futbolera

Juego web multijugador en tiempo real inspirado en el formato de **412**. Aparece la silueta
de un futbolista, todos pujan a ciegas con un presupuesto virtual, y el nombre se revela
recién cuando cierra la puja. Gana quien arma el mejor equipo: 1 arquero, 2 defensas,
1 mediocampista y 1 delantero.

## Stack

- **Next.js 15** (App Router) + TypeScript + Tailwind
- **Supabase** — Postgres, Realtime y Storage
- **EA FC** — fuente principal del catálogo: quiénes entran, rating, estadísticas y carta
- **TheSportsDB** — sólo la silueta

La lógica del juego vive en funciones de Postgres (`next_round`, `place_bid`,
`finalize_round`, `pass_round`), no en el cliente. Cada acción es una transacción, así que
dos jugadores pujando a la vez no pueden desincronizar la partida ni cobrar dos veces.

## Cómo se juega

Aparece una silueta y todos pujan a ciegas. No sólo no sabés quién es: **tampoco sabés de
qué momento de su carrera se trata**. Al cerrar la puja se revela el jugador, la temporada
sorteada y los puntos que suma — no es lo mismo comprar al Mbappé de 2017 que al de 2024.

Cada puja **reinicia el reloj completo**, así que la subasta se cierra cuando nadie responde,
no cuando se agota un temporizador fijo.

### Poderes

Podés gastar presupuesto en sabotear a un rival en la ronda siguiente. Sale de la misma
plata con la que comprás jugadores, así que molestar siempre debilita tu propio equipo.

| Poder | Costo | Efecto |
|---|---|---|
| 🌫️ Niebla | 10 | Ve la silueta borrosa |
| ✋ Manotazo | 12 | Le quema el pase (inmediato) |
| 🔒 Traba | 15 | No puede pujar en la primera mitad |
| 🌑 Apagón | 18 | No ve ninguna silueta |
| 🪞 Espejismo | 28 | Ve la silueta de **otro** jugador y no se entera |
| 💸 Impuesto | 30 | Si gana, paga el doble |

Sólo un poder pendiente por víctima, para que nadie quede fuera del juego a fuerza de plata.

> **Los efectos se resuelven por espectador, en el servidor.** Dos personas mirando la misma
> ronda reciben siluetas distintas a propósito. Mandar la silueta real y ocultarla en el
> cliente sería inútil: se ve en la pestaña de red. A la víctima se le avisa *que* está
> afectada, pero nunca cuál es el señuelo.

Gana quien termina con más puntos entre sus cinco fichajes. Si hay empate, define quien
gastó menos.

## Puesta en marcha

### 1. Dependencias

```bash
npm install
```

### 2. Variables de entorno

`apps/web/.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://TU_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key
```

`packages/ingest/.env` (copiá `.env.example`):

```
SUPABASE_URL=https://TU_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key
SUPABASE_PROJECT_REF=TU_REF
SUPABASE_DB_PASSWORD=tu-password-de-base
THESPORTSDB_KEY=3
```

> La *service role key* saltea RLS por completo. Nunca la pongas en el código ni la
> expongas al navegador.

### 3. Base de datos

```bash
npm run migrate --workspace=packages/ingest
```

Aplica todo `supabase/migrations/` en orden. Las migraciones son idempotentes, así que
correrlo entero es siempre seguro.

> **Corré siempre el lote completo, nunca una migración suelta.** Varias redefinen las mismas
> funciones (`next_round`, `place_bid`, `finalize_round`) con `create or replace`, así que
> aplicar una vieja después de una nueva revierte silenciosamente lo que la nueva agregó.
> Pasó: aplicar 0018 sola después de 0021 dejó al juego sin poderes y sin poder empezar una
> ronda.

Creá también un bucket público llamado `silhouettes` en Supabase Storage.

### 4. Catálogo de jugadores

```bash
npm run ingest   --workspace=packages/ingest   # jugadores + siluetas
npm run photos   --workspace=packages/ingest   # copia las fotos a tu Storage
```

**EA FC decide el catálogo.** De ahí salen el rating, las seis estadísticas, el puesto, el
club y la carta oficial. El tamaño se controla con `CATALOG_SIZE` (400 por defecto).

> No uses `ea_rank` como medida de fama: EA rankea por **rating**, no por popularidad. Un
> arquero de 88 entra al top mientras casi nadie sabría nombrarlo — Gregor Kobel tiene 55
> veces menos visitas de Wikipedia que Mbappé. Para eso está `fame_score`.

**TheSportsDB aporta una sola cosa: la silueta.** Es necesario porque la imagen de EA es un
primer plano de cara, y una silueta recortada de ahí es una mancha igual para todos.
TheSportsDB tiene `strRender`, una pose de acción de cuerpo entero que sí se distingue.

Un jugador sin render se importa igual (queda su ficha completa) pero con `notable = false`,
así que **no sale a subasta**: sin una silueta jugable no tiene sentido. `npm run
ingest:resume` reintenta justamente a esos.

Dos trampas que ya están contempladas en el código:

- `searchplayers.php` **no** devuelve `strRender`; hay que releer la ficha con
  `lookupplayer.php?id=`.
- Con la clave gratuita (`3`), TheSportsDB al pasarse de cuota responde una página HTML con
  status 200 en vez de un 429. El cliente trata un cuerpo que empieza con `<` como
  throttling; si no, se degradaría en silencio. Una clave de Patreon levanta el tope.

### Qué tan famoso es cada jugador

```bash
npm run fame --workspace=packages/ingest              # puntúa a los que faltan
npm run fame --workspace=packages/ingest -- --repair  # reintenta los sospechosos
```

`fame_score` es un año de visitas al artículo de Wikipedia en inglés — la única señal
disponible que mide lo que el juego necesita: si alguien en la mesa reconocería a esa
persona.

Dos cosas que hay que respetar al tocar esto:

- **Resolvé el título buscando, nunca asumiendo.** EA escribe "Heung Min Son" y Wikipedia
  "Son Heung-min". Peor: la API de visitas devuelve tráfico para títulos que no existen
  (unas centenas de visitas de gente que llegó por error), así que consultar el nombre crudo
  no falla — devuelve un número plausible y **bajo**. Son Heung-min llegó a puntuar 589. Por
  eso el resolutor exige que el título comparta el apellido, o "Jane Campbell" cae en una
  novelista.
- **El ranking se calcula dentro de cada género y puesto** (`refresh_fame_ranks`), no
  globalmente. Las jugadoras tienen mucho menos tráfico que los jugadores y los arqueros
  menos que los delanteros, así que un umbral único vaciaría el pool femenino y dejaría a las
  salas sin arqueros. El pool "Más famosos" toma los primeros `famous_depth()` de cada
  combinación.

### Puntaje por época

`next_round` sortea una temporada de la carrera del jugador y calcula el rating de ese
momento aplicando una curva por edad sobre su pico (sube hasta los 24, meseta entre 26 y 30,
cae después). La época queda oculta durante la puja y se revela al cerrar; el rating se
congela en el fichaje, así que retocar ratings más adelante no altera partidas ya jugadas.

> El overall y las seis estadísticas son datos reales de EA. **El ajuste por época es un
> cálculo propio**, no un histórico oficial de EA. Las leyendas retiradas no están en el
> feed de EA (existen sólo como Icons de Ultimate Team).

### 5. Desarrollo

```bash
npm run dev
```

### 6. Tests

Con el server corriendo:

```bash
node apps/web/e2e/engine.mjs http://localhost:3000   # reglas de subasta, pases y partida completa
node apps/web/e2e/filters.mjs http://localhost:3000  # filtros de género y catálogo
node apps/web/e2e/timer.mjs http://localhost:3000    # la puja reinicia el reloj
node apps/web/e2e/powers.mjs http://localhost:3000   # poderes y su resolución por espectador
node apps/web/e2e/uncontested.mjs http://localhost:3000  # asignación sin rival
node apps/web/e2e/ui.mjs                             # navegador, dos jugadores simultáneos
```

Todos aceptan una URL, así que sirven también contra el despliegue.

El de interfaz necesita `npx playwright install chromium`. Ajustá `BASE` en `ui.mjs` si
usás otro puerto.

## Despliegue

Vercel + Supabase Cloud. Cargá las tres variables de `apps/web/.env.local` en el proyecto
de Vercel. El paquete `ingest` no se despliega: se corre a mano cuando querés ampliar el
catálogo.

## Notas de seguridad

- La clave anónima es pública, así que la tabla `players` **no** es legible con ella: si lo
  fuera, cualquiera podría cruzar `silhouette_url` con el nombre y arruinar el juego.
- `rooms.host_token` y `room_participants.client_token` están fuera del `GRANT` por columna
  (migración `0006`), porque con la clave anónima se podían leer y suplantar al anfitrión o
  a otro jugador.
- Todo el estado se sirve por `/api/rooms/[code]/state`, que oculta el nombre del jugador
  mientras la puja está abierta.
