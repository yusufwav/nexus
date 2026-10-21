/**
 * GRAIN PREVIEW
 * ---------------------------------------------------------------------------
 * Composites the generated grain tile over a dark panel colour so the result
 * can be LOOKED at, rather than only measured.
 *
 *   node scripts/preview-grain.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync, inflateSync } from "node:zlib";

const TILE = 256;
const REPEAT = 4;
const SCALE = 2;

/** Decode our own PNG: we wrote it, so the layout is known. */
function decodePng(path) {
  const buf = readFileSync(path);
  let at = 8;
  let width = 0;
  let height = 0;
  const idat = [];
  while (at < buf.length) {
    const length = buf.readUInt32BE(at);
    const type = buf.toString("ascii", at + 4, at + 8);
    const data = buf.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    if (filter !== 0) throw new Error(`unexpected PNG filter ${filter}`);
    out.set(raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride), y * stride);
  }
  return { width, height, pixels: out };
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
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

function encodePng(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const tile = decodePng(join(process.cwd(), "assets/images/grain-light.png"));
if (tile.width !== TILE || tile.height !== TILE) {
  throw new Error(`unexpected tile size ${tile.width}x${tile.height}`);
}

const W = TILE * REPEAT * SCALE;
const H = TILE * REPEAT * SCALE;
const out = new Uint8Array(W * H * 4);
const bg = [10, 10, 14];
const alpha = 0.9; // the reference site's overlay opacity

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const tx = Math.floor(x / SCALE) % TILE;
    const ty = Math.floor(y / SCALE) % TILE;
    const a = (tile.pixels[(ty * TILE + tx) * 4 + 3] / 255) * alpha;
    const i = (y * W + x) * 4;
    out[i] = Math.round(bg[0] * (1 - a) + 255 * a);
    out[i + 1] = Math.round(bg[1] * (1 - a) + 255 * a);
    out[i + 2] = Math.round(bg[2] * (1 - a) + 255 * a);
    out[i + 3] = 255;
  }
}

writeFileSync(join(process.cwd(), "assets/images/_grain-preview.png"), encodePng(W, H, out));
console.log(`preview written ${W}x${H}`);
