/**
 * THE GRAIN TILE
 * ---------------------------------------------------------------------------
 * The reference for this app's panel treatment is
 * https://hermes-agent.nousresearch.com/, which overlays a fractal-noise
 * tile on its containers and nowhere else. Its stylesheet does it with an
 * inline SVG:
 *
 *   --hw-noise-bg: url("data:image/svg+xml,...<feTurbulence type='fractalNoise'
 *     baseFrequency='0.72' numOctaves='4' stitchTiles='stitch'/>
 *     <feColorMatrix type='matrix' values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1
 *     1 1 1 0 -1.55'/>...");
 *
 *   .hw-noise::after {
 *     background-image: var(--hw-noise-bg);
 *     background-repeat: repeat;
 *     background-size: var(--hw-noise-tile) var(--hw-noise-tile);
 *     opacity: .9;
 *     pointer-events: none;
 *     position: absolute;
 *     inset: 0;
 *   }
 *
 * React Native has no `feTurbulence` and no `background-repeat`, so the tile
 * is GENERATED HERE instead — once, at build time — and tiled by an
 * `<Image resizeMode="repeat">` at runtime.
 *
 * The maths is the same maths:
 *
 *   · `fractalNoise` with `baseFrequency 0.72` and `numOctaves 4` is four
 *     octaves of gradient noise, each at twice the frequency and half the
 *     amplitude of the one below, summed, normalised by the amplitude sum
 *     and remapped from [-1, 1] to [0, 1];
 *   · `stitchTiles="stitch"` is what makes the tile seamless, so the lattice
 *     is wrapped at the period;
 *   · the colour matrix maps the three noise channels to opaque white and
 *     sets ALPHA to `R + G + B - 1.55`, which is what turns noise into
 *     sparse bright specks rather than a grey wash.
 *
 *   node scripts/generate-grain.mjs
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

const TILE = 256;
const BASE_FREQUENCY = 0.72;
const NUM_OCTAVES = 4;
const AMPLITUDE_GAIN = 0.5;
const MATRIX_OFFSET = -1.55;

/* ------------------------------------------------------------------ *
 *  noise
 * ------------------------------------------------------------------ */

function hash2(ix, iy, seed) {
  let h = ix * 374761393 + iy * 668265263 + seed * 2147483647;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

function grad(hash, x, y) {
  switch (hash & 7) {
    case 0:
      return x + y;
    case 1:
      return -x + y;
    case 2:
      return x - y;
    case 3:
      return -x - y;
    case 4:
      return x;
    case 5:
      return -x;
    case 6:
      return y;
    default:
      return -y;
  }
}

/** Periodic 2D gradient noise, in lattice units. */
function perlin(x, y, period, seed) {
  const wrap = (i) => ((i % period) + period) % period;
  const X0 = Math.floor(x);
  const Y0 = Math.floor(y);
  const xf = x - X0;
  const yf = y - Y0;
  const u = fade(xf);
  const v = fade(yf);

  const aa = grad(hash2(wrap(X0), wrap(Y0), seed), xf, yf);
  const ba = grad(hash2(wrap(X0 + 1), wrap(Y0), seed), xf - 1, yf);
  const ab = grad(hash2(wrap(X0), wrap(Y0 + 1), seed), xf, yf - 1);
  const bb = grad(hash2(wrap(X0 + 1), wrap(Y0 + 1), seed), xf - 1, yf - 1);

  const x1 = aa + u * (ba - aa);
  const x2 = ab + u * (bb - ab);
  return x1 + v * (x2 - x1);
}

/**
 * One channel of `fractalNoise`.
 *
 * The octaves run at 0.72, 1.44, 2.88 and 5.76 periods across the tile, so
 * the first is already finer than a pixel and the result reads as fine
 * grain — which is what the reference does.
 */
function fractalNoise(x, y, seed) {
  let sum = 0;
  let norm = 0;
  let frequency = BASE_FREQUENCY;
  let amplitude = 1;
  for (let i = 0; i < NUM_OCTAVES; i++) {
    const period = Math.max(2, Math.round(TILE * frequency));
    sum += amplitude * perlin((x * period) / TILE, (y * period) / TILE, period, seed + i * 101);
    norm += amplitude;
    frequency *= 2;
    amplitude *= AMPLITUDE_GAIN;
  }
  // [-1, 1] -> [0, 1], the same remap the SVG filter applies.
  return (sum / norm) * 0.5 + 0.5;
}

/* ------------------------------------------------------------------ *
 *  PNG
 * ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

/**
 * Encode an RGBA buffer as a PNG.
 *
 * A hand-rolled encoder rather than an image library: the app must have no
 * runtime dependency on one, and a PNG is a handful of chunks.
 */
function encodePng(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter type: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(
      raw,
      y * (stride + 1) + 1,
    );
  }

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------------ *
 *  the tile
 * ------------------------------------------------------------------ */

/**
 * Build the alpha field, exactly as the reference's colour matrix does.
 *
 * The matrix is `0 0 0 0 1 | 0 0 0 0 1 | 0 0 0 0 1 | 1 1 1 0 -1.55`, so:
 *
 *   R' = G' = B' = 1                       (opaque white)
 *   A' = R + G + B - 1.55                  (sparse, and only where it adds up)
 */
function buildTile() {
  const out = new Uint8Array(TILE * TILE * 4);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const r = fractalNoise(x, y, 0);
      const g = fractalNoise(x, y, 7919);
      const b = fractalNoise(x, y, 104729);
      const alpha = Math.min(1, Math.max(0, r + g + b + MATRIX_OFFSET));
      const i = (y * TILE + x) * 4;
      out[i] = 255;
      out[i + 1] = 255;
      out[i + 2] = 255;
      out[i + 3] = Math.round(alpha * 255);
    }
  }
  return out;
}

/**
 * The black variant.
 *
 * Same field, black instead of white — for a light palette, where white
 * grain would be invisible and black grain reads as paper tooth.
 */
function buildTileInverted() {
  const out = new Uint8Array(TILE * TILE * 4);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const r = fractalNoise(x, y, 0);
      const g = fractalNoise(x, y, 7919);
      const b = fractalNoise(x, y, 104729);
      const alpha = Math.min(1, Math.max(0, r + g + b + MATRIX_OFFSET));
      const i = (y * TILE + x) * 4;
      out[i] = 0;
      out[i + 1] = 0;
      out[i + 2] = 0;
      out[i + 3] = Math.round(alpha * 255);
    }
  }
  return out;
}

const OUT_DIR = join(process.cwd(), "assets/images");
mkdirSync(OUT_DIR, { recursive: true });

const white = encodePng(TILE, TILE, buildTile());
writeFileSync(join(OUT_DIR, "grain-light.png"), white);
console.log(`wrote assets/images/grain-light.png (${white.length} bytes)`);

const black = encodePng(TILE, TILE, buildTileInverted());
writeFileSync(join(OUT_DIR, "grain-dark.png"), black);
console.log(`wrote assets/images/grain-dark.png (${black.length} bytes)`);
