/**
 * Cuts the four landing-page icons out of a single supplied sheet, and lifts
 * the white studio background off the Silumatch badge.
 *
 * Both source files arrive as flat artwork on white. Dropped straight into the
 * page that reads as a white rectangle on a navy panel, so each asset needs an
 * alpha channel before it is worth shipping.
 *
 *   npm run icons --workspace=packages/ingest -- <sheet.png> <logo.png>
 */
import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { resolve } from 'path';

const PUBLIC = resolve(process.cwd(), '../../apps/web/public');
const ICONS = resolve(PUBLIC, 'icons');

/** Sheet order, left to right. These are the file names the page asks for. */
const NAMES = ['silueta', 'poderes', 'epoca', 'trofeo'];

const SIZE = 256;

interface Raw {
  data: Buffer;
  width: number;
  height: number;
  channels: number;
}

async function raw(input: string | Buffer): Promise<Raw> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

const isWhite = (r: number, g: number, b: number) => r > 244 && g > 244 && b > 244;

/**
 * Where each icon actually sits.
 *
 * Splitting the sheet into four equal cells assumes the art is centred in each
 * one, and it is not — the first icon's silhouette reaches left of its disc, so
 * an even split cut the head off. The discs and the band between them are both
 * near-black, while the art itself is bright, so scanning for the bright runs
 * finds the real centres.
 */
function iconBands({ data, width, height, channels }: Raw): [number, number][] {
  const lit: boolean[] = [];

  for (let x = 0; x < width; x++) {
    let peak = 0;
    for (let y = 0; y < height; y += 2) {
      const i = (y * width + x) * channels;
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      if (isWhite(r, g, b)) continue; // page margin, not artwork
      peak = Math.max(peak, (r + g + b) / 3);
    }
    lit.push(peak > 70);
  }

  const runs: [number, number][] = [];
  let start = -1;

  for (let x = 0; x <= width; x++) {
    if (x < width && lit[x]) {
      if (start < 0) start = x;
    } else if (start >= 0) {
      runs.push([start, x - 1]);
      start = -1;
    }
  }

  // Specks of anti-aliasing also register; the four icons are the wide ones.
  return runs
    .filter(([a, b]) => b - a > width / 40)
    .sort((p, q) => q[1] - q[0] - (p[1] - p[0]))
    .slice(0, NAMES.length)
    .sort((p, q) => p[0] - q[0]);
}

/**
 * A circular alpha mask.
 *
 * The icons are already drawn on dark discs, so keeping the disc and cutting
 * the square corners turns each one into a badge rather than a black tile with
 * a picture on it. The edge fades over two pixels — a hard cut aliases badly
 * once the browser scales it down to 40px.
 */
function discMask(size: number): Buffer {
  const mask = Buffer.alloc(size * size);
  const c = (size - 1) / 2;
  const r = size / 2 - 1;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c);
      const a = d <= r - 2 ? 255 : d >= r ? 0 : Math.round(((r - d) / 2) * 255);
      mask[y * size + x] = a;
    }
  }

  return mask;
}

async function cutIcons(sheet: string) {
  const source = await raw(sheet);
  const bands = iconBands(source);

  if (bands.length !== NAMES.length) {
    throw new Error(`la lámina tiene ${bands.length} iconos, se esperaban ${NAMES.length}`);
  }

  // The discs fill the sheet's height, so that is the side of each tile.
  const side = source.height;
  const mask = discMask(SIZE);

  mkdirSync(ICONS, { recursive: true });

  for (const [i, name] of NAMES.entries()) {
    const [from, to] = bands[i];
    const centre = Math.round((from + to) / 2);
    const left = Math.max(0, Math.min(source.width - side, centre - Math.floor(side / 2)));

    const tile = await sharp(sheet)
      .extract({ left, top: 0, width: side, height: side })
      .resize(SIZE, SIZE, { fit: 'fill' })
      .ensureAlpha()
      .raw()
      .toBuffer();

    for (let p = 0; p < SIZE * SIZE; p++) tile[p * 4 + 3] = mask[p];

    const out = resolve(ICONS, `${name}.png`);
    await sharp(tile, { raw: { width: SIZE, height: SIZE, channels: 4 } }).png().toFile(out);
    console.log(`icono ${name} → ${out}`);
  }
}

/**
 * Clears the badge's white surround.
 *
 * A plain "white becomes transparent" pass would also punch holes in the
 * wordmark and the player's kit, which are white too. Flooding inward from the
 * border only reaches white that is connected to the outside, so anything the
 * badge outline encloses survives.
 */
async function cutLogo(logo: string) {
  const { data, width, height, channels } = await raw(logo);
  const out = Buffer.alloc(width * height * 4);

  for (let p = 0; p < width * height; p++) {
    const s = p * channels;
    out[p * 4] = data[s];
    out[p * 4 + 1] = data[s + 1];
    out[p * 4 + 2] = data[s + 2];
    out[p * 4 + 3] = 255;
  }

  const stack: number[] = [];
  const seen = new Uint8Array(width * height);

  const push = (x: number, y: number) => {
    const p = y * width + x;
    if (seen[p]) return;
    const s = p * channels;
    if (!isWhite(data[s], data[s + 1], data[s + 2])) return;
    seen[p] = 1;
    stack.push(p);
  };

  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }

  while (stack.length) {
    const p = stack.pop()!;
    out[p * 4 + 3] = 0;

    const x = p % width;
    const y = (p / width) | 0;
    if (x > 0) push(x - 1, y);
    if (x < width - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < height - 1) push(x, y + 1);
  }

  const target = resolve(PUBLIC, 'logo.png');
  await sharp(out, { raw: { width, height, channels: 4 } })
    .trim()
    .resize(512, 512, { fit: 'inside' })
    .png()
    .toFile(target);
  console.log(`logo → ${target}`);
}

const [sheet, logo] = process.argv.slice(2);
if (!sheet) throw new Error('falta la ruta de la lámina de iconos');

await cutIcons(sheet);
if (logo) await cutLogo(logo);
