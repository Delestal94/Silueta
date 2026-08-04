/**
 * Turns the two supplied glove drawings into cursor assets.
 *
 *   npm run cursors --workspace=packages/ingest -- <normal.png> <clicked.png>
 *
 * Two sizes each, because a cursor cannot use srcset: CSS picks between them
 * with image-set(). The originals are 64px tall, which is twice the size of a
 * system cursor, so the 1x is a downscale and the 2x is close to native — both
 * end up sharp, and neither swallows the thing it is pointing at.
 */
import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { resolve } from 'path';

const OUT = resolve(process.cwd(), '../../apps/web/public/cursor');

/** Height in CSS pixels. Bigger than a system arrow, since it is artwork. */
const SIZE = 40;

async function emit(source: string, name: string) {
  const meta = await sharp(source).metadata();
  const scale = SIZE / (meta.height ?? SIZE);

  for (const [suffix, factor] of [
    ['', 1],
    ['-2x', 2],
  ] as const) {
    const height = Math.round(SIZE * factor);
    const width = Math.round((meta.width ?? SIZE) * scale * factor);
    const file = resolve(OUT, `${name}${suffix}.png`);

    await sharp(source).resize(width, height, { fit: 'fill' }).png().toFile(file);
    console.log(`${name}${suffix}  ${width}x${height}  → ${file}`);
  }

  return Math.round((meta.width ?? SIZE) * scale);
}

const [normal, clicked] = process.argv.slice(2);
if (!normal || !clicked) throw new Error('faltan las rutas de los dos punteros');

mkdirSync(OUT, { recursive: true });

const w = await emit(normal, 'glove');
await emit(clicked, 'glove-grab');

// Both states share one hotspot on purpose. The fist is drawn at a different
// angle to the open hand, so honouring each one's own fingertip would make the
// click land a few pixels away from where the user aimed.
console.log(`\npunto activo sugerido: ${Math.round(w * 0.4)} 0 (arriba, sobre los dedos)`);
