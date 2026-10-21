/**
 * THE FONT'S OWN METRICS
 * ---------------------------------------------------------------------------
 * The maths renderer lays its boxes out with ARITHMETIC rather than by
 * measuring, which is only possible because the app's face is MONOSPACE: every
 * glyph has the same advance, so a run of text has an exact width.
 *
 * That needs three numbers, and they are read out of the FONT FILE rather
 * than guessed:
 *
 *   · the advance width, in em;
 *   · the ascent, the descent, the cap height and the x-height, in em — these
 *     are where a baseline is, where a capital sits, and where a fraction's
 *     rule goes;
 *   · WHICH CHARACTERS THE FONT ACTUALLY HAS.
 *
 * The last one is the important one. A maths renderer that reaches for a
 * glyph the font does not have renders a box, and a page of boxes is worse
 * than a page of plain text — so the repertoire is CHECKED, and the
 * characters the font is missing are listed here rather than discovered on a
 * phone.
 *
 *   node scripts/generate-font-metrics.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/* ------------------------------------------------------------------ *
 * a minimal TrueType reader
 * ------------------------------------------------------------------ */

function readFont(file) {
  const buf = readFileSync(file);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  const numTables = view.getUint16(4);
  const tables = new Map();
  for (let i = 0; i < numTables; i += 1) {
    const at = 12 + i * 16;
    const tag = String.fromCharCode(
      view.getUint8(at),
      view.getUint8(at + 1),
      view.getUint8(at + 2),
      view.getUint8(at + 3),
    );
    tables.set(tag, { offset: view.getUint32(at + 8), length: view.getUint32(at + 12) });
  }

  const head = tables.get("head");
  const hhea = tables.get("hhea");
  const os2 = tables.get("OS/2");
  if (head === undefined || hhea === undefined) throw new Error("not a TrueType font");

  const unitsPerEm = view.getUint16(head.offset + 18);
  const indexToLocFormat = view.getInt16(head.offset + 50);

  const ascender = view.getInt16(hhea.offset + 4);
  const descender = view.getInt16(hhea.offset + 6);
  const lineGap = view.getInt16(hhea.offset + 8);
  const numberOfHMetrics = view.getUint16(hhea.offset + 34);

  const hmtx = tables.get("hmtx");
  const advances = [];
  for (let i = 0; i < numberOfHMetrics; i += 1) {
    advances.push(view.getUint16(hmtx.offset + i * 4));
  }

  const typoAscender = os2 === undefined ? ascender : view.getInt16(os2.offset + 68);
  const typoDescender = os2 === undefined ? descender : view.getInt16(os2.offset + 70);
  const typoLineGap = os2 === undefined ? lineGap : view.getInt16(os2.offset + 72);
  const sxHeight = os2 === undefined ? 0 : view.getInt16(os2.offset + 86);
  const sCapHeight = os2 === undefined ? 0 : view.getInt16(os2.offset + 88);
  const usWinAscent = os2 === undefined ? ascender : view.getUint16(os2.offset + 74);
  const usWinDescent = os2 === undefined ? -descender : view.getUint16(os2.offset + 76);

  /* ---- the character map ---- */
  const cmap = tables.get("cmap");
  const covered = new Set();
  if (cmap !== undefined) {
    const numSubtables = view.getUint16(cmap.offset + 2);
    let best = null;
    for (let i = 0; i < numSubtables; i += 1) {
      const at = cmap.offset + 4 + i * 8;
      const platform = view.getUint16(at);
      const encoding = view.getUint16(at + 2);
      const offset = view.getUint32(at + 4);
      const score =
        platform === 3 && encoding === 10 ? 4 : platform === 3 && encoding === 1 ? 3 : platform === 0 ? 2 : 0;
      if (score > 0 && (best === null || score > best.score)) {
        best = { score, offset: cmap.offset + offset };
      }
    }
    if (best !== null) {
      const sub = best.offset;
      const format = view.getUint16(sub);
      if (format === 4) {
        const segCountX2 = view.getUint16(sub + 6);
        const segCount = segCountX2 / 2;
        const endCodes = sub + 14;
        const startCodes = endCodes + segCountX2 + 2;
        const idDeltas = startCodes + segCountX2;
        const idRangeOffsets = idDeltas + segCountX2;
        for (let s = 0; s < segCount; s += 1) {
          const end = view.getUint16(endCodes + s * 2);
          const start = view.getUint16(startCodes + s * 2);
          if (start === 0xffff) continue;
          for (let c = start; c <= end && c !== 0x10000; c += 1) covered.add(c);
        }
      } else if (format === 12) {
        const nGroups = view.getUint32(sub + 12);
        for (let g = 0; g < nGroups; g += 1) {
          const at = sub + 16 + g * 12;
          const start = view.getUint32(at);
          const end = view.getUint32(at + 4);
          for (let c = start; c <= end; c += 1) covered.add(c);
        }
      }
    }
  }

  return {
    unitsPerEm,
    ascender,
    descender,
    lineGap,
    typoAscender,
    typoDescender,
    typoLineGap,
    sxHeight,
    sCapHeight,
    usWinAscent,
    usWinDescent,
    advances,
    covered,
    indexToLocFormat,
  };
}

/* ------------------------------------------------------------------ *
 * the repertoire the renderer needs
 * ------------------------------------------------------------------ */

/**
 * Every character the maths renderer may ask the font for.
 *
 * If the font has no glyph for one of these, the renderer has to fall back
 * to a word — `sqrt` for `√` — rather than draw a box. So the list is
 * checked here, at build time, and the answer is written into the generated
 * file.
 */
const NEEDED = {
  greek: "αβγδεζηθικλμνξοπρστυφχψωΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ",
  operators:
    "±∓×÷·⋅≤≥≠≈≡∼∝→←↔⇒⇐⇔∈∉⊂⊆⊃⊇∪∩∅∖∇∂∀∃¬∧∨…⋯⋮⋱′°∘⊕⊗⊥∥∠∗",
  bigOperators: "∑∏∐∫∬∭∮∯∰⨀⨁⨂⋃⋂",
  roots: "√∛",
  misc: "∞ℓℏℜℑ←↑↓→↦∎",
  punctuation: "()[]{}|‖",
  ascii: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+-*/=<>^_.,;:!?'\"()[]{}|",
};

/* ------------------------------------------------------------------ *
 * the files
 * ------------------------------------------------------------------ */

const FILES = [
  { key: "regular", file: "assets/fonts/JetBrainsMono-Regular.ttf", family: "JetBrainsMono-Regular" },
  { key: "medium", file: "assets/fonts/JetBrainsMono-Medium.ttf", family: "JetBrainsMono-Medium" },
  { key: "bold", file: "assets/fonts/JetBrainsMono-Bold.ttf", family: "JetBrainsMono-Bold" },
  { key: "extraBold", file: "assets/fonts/JetBrainsMono-ExtraBold.ttf", family: "JetBrainsMono-ExtraBold" },
  { key: "nova", file: "assets/fonts/NovaMono-Regular.ttf", family: "NovaMono-Regular" },
];

const report = [];

for (const entry of FILES) {
  const font = readFont(join(root, entry.file));
  const em = font.unitsPerEm;
  const advance = font.advances.length > 0 ? font.advances[0] : em / 2;

  const missing = {};
  for (const [group, chars] of Object.entries(NEEDED)) {
    const gone = [...chars].filter((c) => !font.covered.has(c.codePointAt(0)));
    if (gone.length > 0) missing[group] = gone.join("");
  }

  report.push({
    key: entry.key,
    family: entry.family,
    unitsPerEm: em,
    advanceEm: advance / em,
    ascenderEm: font.typoAscender / em,
    descenderEm: font.typoDescender / em,
    lineGapEm: font.typoLineGap / em,
    capHeightEm: font.sCapHeight / em,
    xHeightEm: font.sxHeight / em,
    winAscentEm: font.usWinAscent / em,
    winDescentEm: font.usWinDescent / em,
    hheaAscenderEm: font.ascender / em,
    hheaDescenderEm: font.descender / em,
    hheaLineGapEm: font.lineGap / em,
    missing,
  });

  console.log(`--- ${entry.family} ---`);
  console.log(
    `  advance ${(advance / em).toFixed(4)}em   hhea asc ${(font.ascender / em).toFixed(4)} desc ${(font.descender / em).toFixed(4)} gap ${(font.lineGap / em).toFixed(4)}`,
  );
  console.log(
    `  typo  asc ${(font.typoAscender / em).toFixed(4)} desc ${(font.typoDescender / em).toFixed(4)}   win asc ${(font.usWinAscent / em).toFixed(4)} desc ${(font.usWinDescent / em).toFixed(4)}   cap ${(font.sCapHeight / em).toFixed(4)} x ${(font.sxHeight / em).toFixed(4)}`,
  );
  if (Object.keys(missing).length === 0) {
    console.log("  repertoire: COMPLETE");
  } else {
    for (const [group, chars] of Object.entries(missing)) {
      console.log(`  MISSING ${group}: ${chars}`);
    }
  }
}

/* ------------------------------------------------------------------ *
 * the generated file
 * ------------------------------------------------------------------ */

const body = `/**
 * THE FONT'S METRICS
 * ---------------------------------------------------------------------------
 * GENERATED by scripts/generate-font-metrics.mjs — do not hand-edit.
 *
 * The maths renderer lays its boxes out with ARITHMETIC instead of measuring,
 * which is only possible because the app's face is MONOSPACE: every glyph
 * has the same advance, so a run of text has an exact width and a fraction's
 * numerator can be centred on a rule that has not been measured yet.
 *
 * These numbers are read out of the FONT FILES. The advance and the vertical
 * metrics are what a box is, and the REPERTOIRE is what the font can actually
 * draw: a character the font does not have comes out as a box, and a page of
 * boxes is worse than a page of plain text, so the renderer falls back to a
 * word for the ones that are missing.
 *
 * Every number is in EM, so multiplying by the font size gives points.
 */

/** One face's metrics. */
export type FontMetrics = {
  /** The registered family name. */
  readonly family: string;
  /** The advance width of every glyph, in em. */
  readonly advance: number;
  /** The typographic ascender, in em — where a capital's top is. */
  readonly ascender: number;
  /** The typographic descender, in em — negative, below the baseline. */
  readonly descender: number;
  /** The typographic line gap, in em. */
  readonly lineGap: number;
  /** The cap height, in em. */
  readonly capHeight: number;
  /** The x-height, in em. */
  readonly xHeight: number;
  /** The characters this face cannot draw. */
  readonly missing: ReadonlyArray<string>;
};

export const FONT_METRICS: Readonly<Record<string, FontMetrics>> = {
${report
  .map(
    (r) => `  ${r.key}: {
    family: ${JSON.stringify(r.family)},
    advance: ${r.advanceEm},
    ascender: ${r.hheaAscenderEm},
    descender: ${r.hheaDescenderEm},
    lineGap: ${r.hheaLineGapEm},
    capHeight: ${r.capHeightEm},
    xHeight: ${r.xHeightEm},
    missing: ${JSON.stringify(Object.values(r.missing))},
  },`,
  )
  .join("\n")}
};

/** The metrics of the face the maths is set in. */
export const MATH_FONT = FONT_METRICS.regular!;
`;

const outPath = join(root, "src/theme/font-metrics.ts");
writeFileSync(outPath, body, "utf8");
console.log(`\nwrote ${outPath}`);
