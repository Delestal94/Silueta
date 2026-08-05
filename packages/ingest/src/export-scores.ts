/**
 * Vuelca el catálogo a un CSV con los puntos que puede rendir cada jugador.
 *
 *   npm run scores --workspace=packages/ingest            # sólo masculino
 *   npm run scores --workspace=packages/ingest -- women   # sólo femenino
 *   npm run scores --workspace=packages/ingest -- all     # todo el catálogo
 *
 * Una fila por jugador y una columna por época. Los puntos no son un número
 * fijo: dentro de una época la ronda sortea un año, y la curva de edad no es
 * plana ahí adentro, así que se informa el rango que puede salir. Cuando el
 * rango es un solo valor, se escribe una vez.
 *
 * Las épocas que el jugador todavía no vivió salen vacías, no en cero: a los 18
 * años no existe un Yamal veterano, y un 0 se leería como "vale nada".
 */
import { Client } from 'pg';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

const client = new Client({
  host: `db.${process.env.SUPABASE_PROJECT_REF}.supabase.co`,
  user: 'postgres',
  password: process.env.SUPABASE_DB_PASSWORD,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});

await client.connect();

// Masculino por defecto: es el catálogo con el que se juega casi siempre, y
// mezclado con el femenino el archivo pasa de 4.400 filas a 6.800 sin que
// ninguna de las dos listas quede cómoda de leer.
const arg = (process.argv[2] ?? 'men').toLowerCase();
const genero = ['men', 'women', 'all'].includes(arg) ? arg : 'men';
const filtroGenero = genero === 'all' ? '' : `and p.gender = '${genero}'`;

/**
 * Para cada jugador y cada época vivida, el mínimo y el máximo que puede
 * rendir. Se calcula con las mismas funciones que usa la ronda, no con una
 * copia de la fórmula: si la curva cambia, este archivo cambia con ella.
 */
const { rows } = await client.query(`
  with base as (
    select
      p.id, p.name, p.position_type, p.team, p.league, p.nationality, p.gender,
      extract(year from p.birth_date)::int as nacio,
      coalesce(p.rating_is_peak, false)    as leyenda,
      p.fame_rank,
      p.ea_overall,
      public.peak_rating(p.*)              as pico
    from public.players p
    where p.notable ${filtroGenero}
  ),
  porEpoca as (
    select
      b.id, e.era,
      min(greatest(40, least(99, b.pico + public.age_curve(y - b.nacio)))) as bajo,
      max(greatest(40, least(99, b.pico + public.age_curve(y - b.nacio)))) as alto
    from base b
    cross join lateral public.player_eras(b.nacio) e
    cross join lateral generate_series(e.low, e.high) as y
    group by b.id, e.era
  )
  select
    b.*,
    (select bajo from porEpoca x where x.id = b.id and x.era = 'Promesa')  as prom_bajo,
    (select alto from porEpoca x where x.id = b.id and x.era = 'Promesa')  as prom_alto,
    (select bajo from porEpoca x where x.id = b.id and x.era = 'Prime')    as prime_bajo,
    (select alto from porEpoca x where x.id = b.id and x.era = 'Prime')    as prime_alto,
    (select bajo from porEpoca x where x.id = b.id and x.era = 'Veterano') as vet_bajo,
    (select alto from porEpoca x where x.id = b.id and x.era = 'Veterano') as vet_alto
  from base b
  order by b.pico desc, b.name
`);

const depth = (await client.query('select public.famous_depth() d')).rows[0].d;
await client.end();

const PUESTO: Record<string, string> = {
  goalkeeper: 'Arquero',
  defender: 'Defensor',
  midfielder: 'Mediocampista',
  forward: 'Delantero',
};

/** "83-87", o "95" cuando no varía, o vacío si esa época no existe todavía. */
const rango = (bajo: number | null, alto: number | null) =>
  bajo == null ? '' : bajo === alto ? String(bajo) : `${bajo}-${alto}`;

/** Excel rompe una celda en cuanto aparece una coma o una comilla. */
const celda = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const cabecera = [
  'Nombre', 'Puesto', 'Equipo', 'Liga', 'Nacionalidad', 'Género', 'Nació',
  'Leyenda', 'En el pool famoso', 'Rating EA hoy', 'Pico',
  'Promesa', 'Prime', 'Veterano', 'Mínimo posible', 'Máximo posible',
];

const lineas = [cabecera.join(';')];

for (const r of rows) {
  const posibles = [
    [r.prom_bajo, r.prom_alto],
    [r.prime_bajo, r.prime_alto],
    [r.vet_bajo, r.vet_alto],
  ].filter(([b]) => b != null) as [number, number][];

  lineas.push(
    [
      r.name,
      PUESTO[r.position_type] ?? r.position_type,
      r.team,
      r.league,
      r.nationality,
      r.gender === 'men' ? 'Masculino' : 'Femenino',
      r.nacio,
      r.leyenda ? 'sí' : '',
      r.fame_rank != null && r.fame_rank <= depth ? 'sí' : '',
      r.ea_overall,
      r.pico,
      rango(r.prom_bajo, r.prom_alto),
      rango(r.prime_bajo, r.prime_alto),
      rango(r.vet_bajo, r.vet_alto),
      posibles.length ? Math.min(...posibles.map(([b]) => b)) : '',
      posibles.length ? Math.max(...posibles.map(([, a]) => a)) : '',
    ]
      .map(celda)
      .join(';')
  );
}

const sufijo = { men: '-masculino', women: '-femenino', all: '' }[genero];
const salida = resolve(process.cwd(), `../../jugadores-y-puntajes${sufijo}.csv`);

// BOM: sin él Excel abre el archivo en la codificación del sistema y rompe
// todos los acentos del catálogo.
writeFileSync(salida, '﻿' + lineas.join('\r\n'), 'utf8');

console.log(`${rows.length} jugadores (${genero}) → ${salida}`);
