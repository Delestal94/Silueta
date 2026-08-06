/* eslint-disable @next/next/no-img-element */
/**
 * Planilla de referencia: todo lo que sabemos de un jugador, en una página.
 *
 * Es una página temporal y de consulta, así que el jugador está escrito a mano
 * acá abajo: no toca la base ni el catálogo. Eso además la mantiene fuera de un
 * problema real —la tabla `players` no es legible con la clave pública, porque
 * si lo fuera cualquiera podría leer el nombre de la silueta que está en juego—
 * y una página que aceptara un id de jugador por la URL sería exactamente ese
 * agujero. Al no recibir parámetros, no hay nada que preguntarle.
 *
 * Los datos son reales, copiados de una respuesta de EA del 2026-08-05, y las
 * imágenes salen en vivo de donde salen en el juego.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { Footer } from '@/components/Footer';

export const metadata: Metadata = {
  title: 'Planilla de un jugador — Silumatch',
  description: 'Todos los datos e imágenes que tenemos de un futbolista.',
  // Página interna de consulta: no tiene por qué aparecer en una búsqueda.
  robots: { index: false, follow: false },
};

const EA_PORTRAIT =
  'https://ratings-images-prod.pulse.ea.com/FC25/full/player-portraits/p231747.png?padding=0.7';
const EA_CARD =
  'https://ratings-images-prod.pulse.ea.com/FC25/full/player-shields/en/231747.png?width=265';
const BUCKET = 'https://ratgiasyylxbtmqumtwe.supabase.co/storage/v1/object/public/silhouettes';

/** Las ocho imágenes que existen del jugador, y para qué sirve cada una. */
const IMAGENES = [
  {
    titulo: 'Silueta',
    url: `${BUCKET}/catalog/ea-231747.png`,
    medidas: '620×800 · PNG con alfa · 42 KB',
    origen: 'nuestra — Supabase Storage',
    uso: 'Es lo único que se ve mientras se puja. Sale de recortar el render y rellenar todo lo opaco de negro.',
    fondo: 'bg-white/[0.06]',
  },
  {
    titulo: 'Color',
    url: `${BUCKET}/colour/ea-231747.webp`,
    medidas: '620×800 · WebP con alfa · 43 KB',
    origen: 'nuestra — Supabase Storage',
    uso: 'La revelación. Es el mismo recorte pero sin pintar, así el cuerpo coincide exactamente con la silueta que estaban mirando.',
    fondo: 'bg-black/40',
  },
  {
    titulo: 'Render',
    url: 'https://r2.thesportsdb.com/images/media/player/render/4eikfb1723707377.png',
    medidas: '700×700 · PNG con alfa · 268 KB',
    origen: 'TheSportsDB — campo strRender',
    uso: 'La materia prima de las dos anteriores. Es el cuello de botella del catálogo: sin render no hay silueta, y hay jugadores muy conocidos que no tienen.',
    fondo: 'bg-black/40',
  },
  {
    titulo: 'Retrato',
    url: EA_PORTRAIT,
    medidas: '512×512 · PNG con alfa · 369 KB',
    origen: 'EA — campo avatarUrl',
    uso: 'Sólo la cara. No sirve para el juego: todas las siluetas saldrían iguales. Lo guardamos igual en photo_url.',
    fondo: 'bg-white/[0.06]',
  },
  {
    titulo: 'Carta',
    url: EA_CARD,
    medidas: '680×895 · PNG con alfa · 943 KB',
    origen: 'EA — campo shieldUrl',
    uso: 'La que aparece al revelar. Trae el 91, la posición, las seis estadísticas y los escudos ya quemados en el PNG.',
    fondo: 'bg-black/40',
  },
  {
    titulo: 'Escudo del club',
    url: 'https://drop-assets.ea.com/images/Pk8nYrWuRt895RlhJx8jI/445d98b711f413a3a1e70c41b19b0f95/l243.png',
    medidas: '256×256 · PNG con alfa · 41 KB',
    origen: 'EA — team.imageUrl',
    uso: 'No lo guardamos: sólo el nombre del club. La imagen se puede reconstruir del id del equipo.',
    fondo: 'bg-white/[0.06]',
  },
  {
    titulo: 'Bandera',
    url: 'https://drop-assets.ea.com/images/3ECAQzhfgSLWRf9IIHB6G8/7e235a7b2f93c1f73db7f89dc03b3657/f_18.png',
    medidas: '512×512 · PNG con alfa · 2 KB',
    origen: 'EA — nationality.imageUrl',
    uso: 'Tampoco la guardamos, sólo el país.',
    fondo: 'bg-white/[0.06]',
  },
] as const;

/** Ficha: qué manda EA y en qué columna nuestra termina. */
const FICHA = [
  ['id', '231747', 'ea_id'],
  ['rank', '1', 'ea_rank'],
  ['overallRating', '91', 'ea_overall'],
  ['firstName', 'Kylian', 'name'],
  ['lastName', 'Mbappé', 'name'],
  ['commonName', 'null', '—'],
  ['birthdate', '12/20/1998', 'birth_date'],
  ['height', '182', 'height'],
  ['weight', '75', 'weight'],
  ['preferredFoot', '1 → Right', 'foot'],
  ['skillMoves', '5', 'ea_skill_moves'],
  ['weakFootAbility', '4', 'ea_weak_foot'],
  ['leagueName', 'LALIGA EA SPORTS', 'ea_league / league'],
  ['team.label', 'Real Madrid', 'team / club'],
  ['nationality.label', 'France', 'nationality'],
  ['gender.label', "Men's Football", 'gender'],
  ['position.shortLabel', 'ST', 'ea_position'],
  ['position.positionType', 'Attack → forward', 'position_type'],
  ['alternatePositions', 'LW', '—'],
  ['avatarUrl', '(retrato)', 'photo_url'],
  ['shieldUrl', '(carta)', 'ea_card_url'],
] as const;

/** Lo que no viene de EA. */
const NUESTRO = [
  ['silhouette_url', '/catalog/ea-231747.png', 'generado del render'],
  ['colour_url', '/colour/ea-231747.webp', 'generado del render'],
  ['render_url', '4eikfb1723707377.png', 'TheSportsDB'],
  ['sportsdb_id', '34162098', 'TheSportsDB'],
  ['shirt_number', '10', 'TheSportsDB'],
  ['description', '(2.900 caracteres de biografía)', 'TheSportsDB'],
  ['silhouette_source', 'render', 'nuestro'],
  ['fame_score', '9.919.314', 'nuestro — vistas de Wikipedia'],
  ['fame_rank', '5', 'nuestro — puesto en el ranking de fama'],
  ['notable', 'true', 'nuestro — entra al pool de famosos'],
  ['rating_is_peak', 'false', 'nuestro — si el rating es el de su pico'],
] as const;

/** Las 40 estadísticas. Las seis en mayúscula son las que guardamos. */
const STATS: readonly (readonly [string, number, boolean])[] = [
  ['pac — Ritmo', 97, true],
  ['sho — Tiro', 90, true],
  ['pas — Pase', 80, true],
  ['dri — Regate', 92, true],
  ['def — Defensa', 36, true],
  ['phy — Físico', 78, true],
  ['acceleration', 97, false],
  ['sprintSpeed', 97, false],
  ['positioning', 93, false],
  ['finishing', 94, false],
  ['shotPower', 90, false],
  ['longShots', 83, false],
  ['volleys', 84, false],
  ['penalties', 84, false],
  ['vision', 83, false],
  ['crossing', 78, false],
  ['freeKickAccuracy', 69, false],
  ['shortPassing', 86, false],
  ['longPassing', 71, false],
  ['curve', 80, false],
  ['agility', 93, false],
  ['balance', 82, false],
  ['reactions', 93, false],
  ['ballControl', 92, false],
  ['dribbling', 93, false],
  ['composure', 88, false],
  ['interceptions', 38, false],
  ['headingAccuracy', 73, false],
  ['defensiveAwareness', 26, false],
  ['standingTackle', 34, false],
  ['slidingTackle', 32, false],
  ['jumping', 88, false],
  ['stamina', 88, false],
  ['strength', 77, false],
  ['aggression', 64, false],
  ['gkDiving', 13, false],
  ['gkHandling', 5, false],
  ['gkKicking', 7, false],
  ['gkPositioning', 11, false],
  ['gkReflexes', 6, false],
];

const PLAYSTYLES = [
  ['Finesse Shot', 'Faster finesse shots with more curve and accuracy', 'Finesse_Shot', false],
  ['Rapid', 'Higher sprint speed while dribbling, reduced error on knock-ons', 'Rapid', false],
  ['Flair', 'More accurate fancy passes/shots, contextual Flair animations', 'Flair', false],
  ['Trivela', 'Contextually triggers "outside of the foot" kicks', 'Trivela', false],
  ['Acrobatic', 'Perform volleys with increased accuracy', 'Acrobatic', false],
  ['Quick Step+', 'Significantly faster acceleration during Explosive Sprint', 'Quick_Step_', true],
] as const;

const ICONOS: Record<string, string> = {
  Finesse_Shot:
    'https://drop-assets.ea.com/images/468u1R1p2k1fA6WBHi0OEn/fb9d49ed2a8fb500cd5a184937b96b34/Finesse_Shot.png',
  Rapid:
    'https://drop-assets.ea.com/images/1aGsvwKyIFlRG1eoJSS0Ot/a4d3d661ff962795a632fe86439d2146/Rapid.png',
  Flair:
    'https://drop-assets.ea.com/images/4q0QkDX0CLgDyBXWBO8lEn/7d727e85de9ee27d3aece799571aa982/Flair.png',
  Trivela:
    'https://drop-assets.ea.com/images/4V77ZiJ0w8qDuORPMPz8nB/d7b0c4a2c3da6102e67a3db3c749aca8/Trivela.png',
  Acrobatic:
    'https://drop-assets.ea.com/images/2sRRBHcIe0zrDwYaRI2xG3/d02b8c8855de853470897009e030eb5d/Acrobatic.png',
  Quick_Step_:
    'https://drop-assets.ea.com/images/44zHnq7IqO4ItY3NPzXNEC/d7fc408baa76e8ba053cd69e0a1a51c4/Quick_Step_.png',
};

function Seccion({
  n,
  titulo,
  bajada,
  children,
}: {
  n: string;
  titulo: string;
  bajada: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="flex items-baseline gap-3 text-xl font-bold">
          <span className="text-sm font-mono text-orange-400/70">{n}</span>
          {titulo}
        </h2>
        <p className="mt-1 text-sm text-white/50">{bajada}</p>
      </div>
      {children}
    </section>
  );
}

export default function DemoPage() {
  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-5xl space-y-14 px-5 py-12">
        <header className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="chip border-orange-400/30 bg-orange-400/10 text-orange-300">
              Página de consulta
            </span>
            <Link href="/" className="text-sm text-white/50 underline hover:text-white">
              ← volver al juego
            </Link>
          </div>
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
            Todo lo que sabemos de un jugador
          </h1>
          <p className="max-w-2xl text-white/60">
            Un jugador escrito a mano, con los datos reales tal como llegan. Sirve para ver de un
            vistazo qué nos da cada fuente, qué guardamos y qué descartamos.
          </p>
        </header>

        {/* Ficha rápida, con la carta al lado. */}
        <div className="panel flex flex-col gap-6 p-6 sm:flex-row sm:items-center">
          <img src={EA_CARD} alt="Carta de Kylian Mbappé" className="mx-auto w-40 shrink-0" />
          <div className="space-y-3">
            <h2 className="text-3xl font-black">Kylian Mbappé</h2>
            <div className="flex flex-wrap gap-2">
              {[
                'Real Madrid',
                'Francia',
                'ST · delantero',
                '91 de media',
                'Puesto 1 del mundo',
                'Zurdo: no, derecho',
              ].map((t) => (
                <span key={t} className="chip text-white/70">
                  {t}
                </span>
              ))}
            </div>
            <p className="text-sm text-white/50">
              Nacido el 20/12/1998 · 182 cm · 75 kg · dorsal 10 · 5 estrellas de filigranas · 4 de
              pierna mala
            </p>
          </div>
        </div>

        <Seccion
          n="01"
          titulo="Las imágenes"
          bajada="Ocho, de tres fuentes distintas. Sólo dos las generamos nosotros, y son las únicas que el jugador ve durante la puja."
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {IMAGENES.map((img) => (
              <figure key={img.titulo} className="panel overflow-hidden">
                <div className={`flex h-52 items-center justify-center p-4 ${img.fondo}`}>
                  <img
                    src={img.url}
                    alt={img.titulo}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
                <figcaption className="space-y-1.5 border-t border-white/10 p-4">
                  <div className="font-semibold">{img.titulo}</div>
                  <div className="font-mono text-[11px] text-white/40">{img.medidas}</div>
                  <div className="text-[11px] uppercase tracking-wide text-orange-400/60">
                    {img.origen}
                  </div>
                  <p className="text-sm leading-snug text-white/55">{img.uso}</p>
                </figcaption>
              </figure>
            ))}
          </div>
        </Seccion>

        <Seccion
          n="02"
          titulo="La ficha de EA"
          bajada="Lo que viene en la misma respuesta, y en qué columna nuestra termina cada cosa."
        >
          <div className="panel overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="border-b border-white/10 text-left text-white/40">
                <tr>
                  <th className="p-3 font-medium">Campo de EA</th>
                  <th className="p-3 font-medium">Valor</th>
                  <th className="p-3 font-medium">Columna nuestra</th>
                </tr>
              </thead>
              <tbody>
                {FICHA.map(([campo, valor, columna]) => (
                  <tr key={campo} className="border-b border-white/5 last:border-0">
                    <td className="p-3 font-mono text-xs text-white/70">{campo}</td>
                    <td className="p-3">{valor}</td>
                    <td
                      className={`p-3 font-mono text-xs ${
                        columna === '—' ? 'text-white/25' : 'text-emerald-300/70'
                      }`}
                    >
                      {columna}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Seccion>

        <Seccion
          n="03"
          titulo="Las 40 estadísticas"
          bajada="EA manda todas en la misma respuesta. Guardamos seis; las otras 34 se descartan al importar."
        >
          <div className="panel overflow-hidden">
            <div className="grid gap-x-8 gap-y-px p-2 sm:grid-cols-2">
              {STATS.map(([nombre, valor, guardada]) => (
                <div
                  key={nombre}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 ${
                    guardada ? 'bg-emerald-400/[0.07]' : ''
                  }`}
                >
                  <span
                    className={`flex-1 truncate font-mono text-xs ${
                      guardada ? 'font-bold text-emerald-300' : 'text-white/50'
                    }`}
                  >
                    {nombre}
                  </span>
                  <div className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-white/10">
                    <div
                      className={`h-full rounded-full ${
                        guardada ? 'bg-emerald-400' : 'bg-white/30'
                      }`}
                      style={{ width: `${valor}%` }}
                    />
                  </div>
                  <span
                    className={`w-7 text-right text-sm tabular-nums ${
                      guardada ? 'font-bold text-emerald-300' : 'text-white/60'
                    }`}
                  >
                    {valor}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <p className="text-sm text-white/40">
            En verde, las seis que guardamos. Traer el resto es barato —ya vienen en la misma
            respuesta— y sería sólo agregar columnas y reimportar.
          </p>
        </Seccion>

        <Seccion
          n="04"
          titulo="PlayStyles"
          bajada="Los rasgos especiales. Hoy no los guardamos."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {PLAYSTYLES.map(([nombre, desc, icono, plus]) => (
              <div key={nombre} className="panel flex items-center gap-4 p-4">
                <img src={ICONOS[icono]} alt="" className="h-10 w-10 shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-semibold">
                    {nombre}
                    {plus && (
                      <span className="chip border-amber-400/30 bg-amber-400/10 py-0 text-[10px] text-amber-300">
                        Plus
                      </span>
                    )}
                  </div>
                  <p className="text-sm leading-snug text-white/50">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </Seccion>

        <Seccion
          n="05"
          titulo="Lo que no viene de EA"
          bajada="Once campos más, de TheSportsDB o calculados por nosotros."
        >
          <div className="panel overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="border-b border-white/10 text-left text-white/40">
                <tr>
                  <th className="p-3 font-medium">Columna</th>
                  <th className="p-3 font-medium">Valor</th>
                  <th className="p-3 font-medium">De dónde sale</th>
                </tr>
              </thead>
              <tbody>
                {NUESTRO.map(([columna, valor, origen]) => (
                  <tr key={columna} className="border-b border-white/5 last:border-0">
                    <td className="p-3 font-mono text-xs text-emerald-300/70">{columna}</td>
                    <td className="p-3 text-white/80">{valor}</td>
                    <td className="p-3 text-white/45">{origen}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Seccion>

        <Seccion
          n="06"
          titulo="Lo que EA no tiene"
          bajada="Verificado pidiéndoselo: devuelve siempre lo mismo."
        >
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                t: 'Años anteriores',
                d: 'Pedirle year=2023, version=fc24 o season=2024 devuelve exactamente los mismos 17.470 jugadores. Es una foto de FC 25 y nada más.',
              },
              {
                t: 'Leyendas retiradas',
                d: 'Los Iconos existen en Ultimate Team pero no en este endpoint. Por eso las 54 leyendas del juego están cargadas a mano.',
              },
              {
                t: 'Rating por temporada',
                d: 'No hay histórico, así que las épocas (Promesa, Prime, Veterano) se calculan con una curva de edad nuestra en vez de leer el número real de cada año.',
              },
            ].map((x) => (
              <div key={x.t} className="panel space-y-2 p-5">
                <div className="font-semibold text-white/90">{x.t}</div>
                <p className="text-sm leading-snug text-white/50">{x.d}</p>
              </div>
            ))}
          </div>
        </Seccion>
      </main>
      <Footer />
    </div>
  );
}
