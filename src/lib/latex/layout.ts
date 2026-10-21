/**
 * THE LAYOUT
 * ---------------------------------------------------------------------------
 * The tree from `parse.ts`, turned into boxes with exact positions.
 *
 * WHY THIS EXISTS AT ALL, WHEN A FONT ENGINE ALREADY DOES THIS
 * ---------------------------------------------------------------------------
 * React Native cannot lay maths out. There is no `View` inside a `Text`, and
 * in the New Architecture a nested `<Text>` is a SPAN — `TextProps` does not
 * extend `ViewProps`, so it cannot be transformed or repositioned. A
 * superscript cannot be raised inside a paragraph, and a fraction cannot be
 * built out of one.
 *
 * So the maths is laid out here, and it is laid out ARITHMETICALLY rather
 * than by measuring.
 *
 * THAT IS ONLY POSSIBLE BECAUSE THE FONT IS MONOSPACE
 * ---------------------------------------------------------------------------
 * Every glyph in JetBrains Mono has the same advance — 0.6em, read out of the
 * font file by `scripts/generate-font-metrics.mjs`. So the width of a run of
 * text is `characters × 0.6em` exactly, and a fraction's numerator can be
 * CENTRED on a rule that has never been measured. There is no
 * `onTextLayout`, no second pass, and nothing to get wrong on a device that
 * is not there.
 *
 * THE BOX MODEL
 * ---------------------------------------------------------------------------
 * TeX's model, which is the right one: a box has a WIDTH, a HEIGHT above
 * its baseline and a DEPTH below it. A row of boxes shares one baseline, and
 * a fraction's baseline is its AXIS — the line its rule sits on — which is
 * what makes a fraction in a paragraph sit on the text rather than under it.
 *
 * Every measurement is in EM of the base size, and the renderer multiplies
 * by the font size at the end.
 */
import { MATH_METRICS } from "@/lib/latex/metrics";
import type { Node } from "@/lib/latex/parse";
import { MATH, type Variant } from "@/lib/latex/symbols";

/* ------------------------------------------------------------------ *
 * the parameters
 * ------------------------------------------------------------------ */

/**
 * The sizes, as fractions of the base size.
 *
 * These are TeX's, more or less: a script is about 0.7 of the text it hangs
 * off, a fraction's rule is about a twentieth of the line, and the rule sits
 * on the maths axis a little above the baseline.
 */
export const LAYOUT = {
  /** How small a script is, relative to its base. */
  scriptScale: 0.72,
  /** How thick a fraction's rule is. */
  rule: 0.045,
  /** How far the rule sits above the baseline. */
  axis: 0.25,
  /** The gap between the rule and the numerator or denominator. */
  gap: 0.16,
  /** The gap between a fraction's parts and its neighbours. */
  pad: 0.14,
  /** How far a superscript's baseline rises. */
  supShift: 0.42,
  /** How far a subscript's baseline drops. */
  subShift: 0.18,
  /** How big a big operator is in display mode. */
  bigScale: 1.6,
  /** The gap between a big operator and its limits. */
  limitGap: 0.12,
  /** The height of an accent above its base. */
  accentHeight: 0.12,
  /** The gap between a matrix's cells. */
  cellPadX: 0.5,
  /** The gap between a matrix's rows. */
  cellPadY: 0.35,
} as const;

/* ------------------------------------------------------------------ *
 * the output
 * ------------------------------------------------------------------ */

/**
 * One thing to draw.
 *
 * `x` is from the left of the whole expression and `y` is the BASELINE of
 * the thing, measured UP from the expression's baseline. The renderer flips
 * that into a top-down coordinate.
 */
export type Primitive =
  | {
      readonly type: "text";
      readonly text: string;
      readonly variant: Variant;
      readonly x: number;
      readonly y: number;
      /** The size of this run, relative to the expression's base size. */
      readonly scale: number;
    }
  | {
      readonly type: "rule";
      readonly x: number;
      /** The BOTTOM edge of the rule, measured up from the baseline. */
      readonly y: number;
      readonly width: number;
      readonly thickness: number;
    };

/** A laid-out expression. */
export type Layout = {
  /** How wide it is. */
  readonly width: number;
  /** How far it rises above the baseline. */
  readonly height: number;
  /** How far it drops below the baseline. */
  readonly depth: number;
  /** Everything to draw, in order. */
  readonly primitives: readonly Primitive[];
};

/* ------------------------------------------------------------------ *
 * the helpers
 * ------------------------------------------------------------------ */

/** An empty layout. */
const NOTHING: Layout = { width: 0, height: 0, depth: 0, primitives: [] };

/** The advance of one character, in em. */
function advanceOf(c: string): number {
  if (c >= "0" && c <= "9") return MATH_METRICS.novaAdvance;
  return MATH_METRICS.advance;
}

/**
 * The width of a run of text.
 *
 * A run can mix figures and letters, and the two have different advances,
 * so it is counted character by character.
 */
function widthOf(text: string): number {
  let w = 0;
  for (const c of text) w += advanceOf(c);
  return w;
}

/**
 * Merge neighbouring text primitives that are the same.
 *
 * The parser emits one run per character, so `abc` arrives as three runs.
 * Drawing them as three `<Text>` elements would be silly, and — worse —
 * three separate text boxes have three separate origins, so a letter's
 * kerning would be lost. Merging them back is both faster and correct.
 */
function mergePrimitives(primitives: readonly Primitive[]): readonly Primitive[] {
  const out: Primitive[] = [];
  for (const p of primitives) {
    const last = out[out.length - 1];
    if (
      last !== undefined &&
      p.type === "text" &&
      last.type === "text" &&
      last.scale === p.scale &&
      last.variant.face === p.variant.face &&
      last.variant.italic === p.variant.italic &&
      last.x + widthOf(last.text) === p.x
    ) {
      out[out.length - 1] = { ...last, text: last.text + p.text };
      continue;
    }
    out.push(p);
  }
  return out;
}

/** Put a child's primitives into the parent's coordinates. */
function place(
  child: Layout,
  x: number,
  y: number,
  scale: number,
  into: Primitive[],
): void {
  for (const p of child.primitives) {
    if (p.type === "text") {
      into.push({
        type: "text",
        text: p.text,
        variant: p.variant,
        x: x + p.x * scale,
        y: y + p.y * scale,
        scale: p.scale * scale,
      });
    } else {
      into.push({
        type: "rule",
        x: x + p.x * scale,
        y: y + p.y * scale,
        width: p.width * scale,
        thickness: p.thickness * scale,
      });
    }
  }
}

/* ------------------------------------------------------------------ *
 * the layout
 * ------------------------------------------------------------------ */

/** What the layout needs to know about the context it is in. */
export type LayoutContext = {
  /** Whether the expression is a displayed equation or inline in a sentence. */
  readonly display: boolean;
};

/**
 * Lay out an expression.
 *
 * `scale` is the size of this expression relative to the base size, so a
 * script's contents are laid out at 0.72 and then scaled again by the
 * caller.
 */
export function layoutNode(node: Node, scale: number, ctx: LayoutContext): Layout {
  switch (node.kind) {
    case "row": {
      const primitives: Primitive[] = [];
      let x = 0;
      let height = 0;
      let depth = 0;
      for (const child of node.children) {
        const laid = layoutNode(child, scale, ctx);
        place(laid, x, 0, scale, primitives);
        x += laid.width * scale;
        if (laid.height * scale > height) height = laid.height * scale;
        if (laid.depth * scale > depth) depth = laid.depth * scale;
      }
      return { width: x, height, depth, primitives: mergePrimitives(primitives) };
    }

    case "run": {
      const width = widthOf(node.text);
      return {
        width,
        height: MATH_METRICS.ascender,
        depth: MATH_METRICS.descenderDepth,
        primitives: [
          {
            type: "text",
            text: node.text,
            variant: node.variant,
            x: 0,
            y: 0,
            scale: 1,
          },
        ],
      };
    }

    case "space": {
      return { width: node.em, height: 0, depth: 0, primitives: [] };
    }

    case "break": {
      return NOTHING;
    }

    case "frac": {
      const num = layoutNode(node.num, scale, ctx);
      const den = layoutNode(node.den, scale, ctx);
      const ruleT = LAYOUT.rule * scale;
      const gap = LAYOUT.gap * scale;
      const pad = LAYOUT.pad * scale;

      const inner = Math.max(num.width * scale, den.width * scale);
      const width = inner + pad * 2;

      // The baseline of a fraction IS its axis, which is what makes it sit on
      // the text rather than under it.
      const numBaseline = ruleT / 2 + gap + num.depth * scale;
      const denBaseline = -(ruleT / 2 + gap + den.height * scale);

      const primitives: Primitive[] = [];
      place(num, (width - num.width * scale) / 2, numBaseline, scale, primitives);
      place(den, (width - den.width * scale) / 2, denBaseline, scale, primitives);
      primitives.push({
        type: "rule",
        x: pad,
        y: -ruleT / 2,
        width: inner,
        thickness: ruleT,
      });

      return {
        width,
        height: ruleT / 2 + gap + num.depth * scale + num.height * scale,
        depth: ruleT / 2 + gap + den.height * scale + den.depth * scale,
        primitives,
      };
    }

    case "root": {
      const radicand = layoutNode(node.radicand, scale, ctx);
      const barT = LAYOUT.rule * scale;
      const gap = 0.08 * scale;
      const signWidth = MATH_METRICS.advance * scale;

      const primitives: Primitive[] = [];
      const bodyHeight = radicand.height * scale;
      const bodyDepth = radicand.depth * scale;

      // The radical sign is a glyph, and a glyph cannot be stretched, so a
      // tall radicand gets a BIGGER sign rather than a longer one.
      const signScale = Math.min(2.2, Math.max(1, (bodyHeight + bodyDepth) / 0.9));

      primitives.push({
        type: "text",
        text: "√",
        variant: MATH,
        x: 0,
        y: -bodyDepth * 0.15,
        scale: signScale,
      });

      const bodyX = signWidth * signScale;
      place(radicand, bodyX, 0, scale, primitives);

      const barY = bodyHeight + gap;
      primitives.push({
        type: "rule",
        x: bodyX - signWidth * 0.2,
        y: barY,
        width: radicand.width * scale + signWidth * 0.2,
        thickness: barT,
      });

      let indexWidth = 0;
      if (node.index !== undefined) {
        const index = layoutNode(node.index, scale * LAYOUT.scriptScale, ctx);
        place(index, 0, bodyHeight * 0.9, scale * LAYOUT.scriptScale, primitives);
        indexWidth = index.width * scale * LAYOUT.scriptScale;
      }

      return {
        width: bodyX + radicand.width * scale + indexWidth,
        height: barY + barT,
        depth: bodyDepth,
        primitives,
      };
    }

    case "script": {
      const base = layoutNode(node.base, scale, ctx);
      const scriptScale = scale * LAYOUT.scriptScale;
      const primitives: Primitive[] = [];

      let width = base.width * scale;
      let height = base.height * scale;
      let depth = base.depth * scale;

      place(base, 0, 0, scale, primitives);

      const sup = node.sup === undefined ? undefined : layoutNode(node.sup, scriptScale, ctx);
      const sub = node.sub === undefined ? undefined : layoutNode(node.sub, scriptScale, ctx);

      if (sup !== undefined) {
        const y = LAYOUT.supShift * scale;
        place(sup, width, y, scriptScale, primitives);
        width += sup.width * scriptScale;
        if (y + sup.height * scriptScale > height) height = y + sup.height * scriptScale;
        if (sup.depth * scriptScale > depth) depth = sup.depth * scriptScale;
      }

      if (sub !== undefined) {
        const y = -LAYOUT.subShift * scale;
        place(sub, width, y, scriptScale, primitives);
        width += sub.width * scriptScale;
        if (-y + sub.height * scriptScale > depth) depth = -y + sub.height * scriptScale;
        if (sub.depth * scriptScale > height) height = sub.depth * scriptScale;
      }

      return { width, height, depth, primitives: mergePrimitives(primitives) };
    }

    case "accent": {
      const base = layoutNode(node.base, scale, ctx);
      const primitives: Primitive[] = [];
      place(base, 0, 0, scale, primitives);

      const baseHeight = base.height * scale;
      const baseWidth = base.width * scale;
      const thickness = LAYOUT.rule * scale;
      const lift = LAYOUT.accentHeight * scale;

      let height = baseHeight;
      let depth = base.depth * scale;

      /*
       * THE MARKS THAT ARE GLYPHS.
       *
       * A hat, a tilde and a vector are not rules — they are shapes, and the
       * font has all three: `^`, `~` and `→`. A rule over a letter is a bar,
       * which is a different mark, and a vector with a bar over it is not a
       * vector at all.
       */
      const markGlyph =
        node.accent === "hat" ? "^" : node.accent === "tilde" ? "~" : node.accent === "vec" ? "→" : null;

      if (markGlyph !== null) {
        const markScale = scale * 0.75;
        const markWidth = MATH_METRICS.advance * markScale;
        const y = baseHeight + 0.04 * scale;
        primitives.push({
          type: "text",
          text: markGlyph,
          variant: MATH,
          x: (baseWidth - markWidth) / 2,
          y,
          scale: markScale,
        });
        const top = y + MATH_METRICS.ascender * markScale;
        if (top > height) height = top;
      } else {
        switch (node.accent) {
          case "overline": {
            primitives.push({
              type: "rule",
              x: 0,
              y: baseHeight + thickness,
              width: baseWidth,
              thickness,
            });
            height = baseHeight + thickness * 2;
            break;
          }
          case "underline": {
            primitives.push({
              type: "rule",
              x: 0,
              y: -depth - thickness,
              width: baseWidth,
              thickness,
            });
            depth += thickness * 2;
            break;
          }
          case "dot":
          case "ddot": {
            // A dot is a very short rule.
            const dotWidth = 0.09 * scale;
            primitives.push({
              type: "rule",
              x: (baseWidth - dotWidth) / 2,
              y: baseHeight + lift * 0.5,
              width: dotWidth,
              thickness: dotWidth,
            });
            height = baseHeight + lift * 0.5 + dotWidth;
            break;
          }
          default: {
            // A bar: a rule over the top, the full width of the base.
            primitives.push({
              type: "rule",
              x: 0,
              y: baseHeight + lift,
              width: baseWidth,
              thickness,
            });
            height = baseHeight + lift + thickness * 2;
            break;
          }
        }
      }

      return { width: baseWidth, height, depth, primitives };
    }

    case "delim": {
      const body = layoutNode(node.body, scale, ctx);
      const primitives: Primitive[] = [];

      const bodyHeight = body.height * scale;
      const bodyDepth = body.depth * scale;
      const bodyWidth = body.width * scale;

      // A delimiter cannot be stretched, so a tall body gets a BIGGER one.
      const delimScale = Math.min(2.2, Math.max(1, (bodyHeight + bodyDepth) / 0.9));
      const delimWidth = MATH_METRICS.advance * delimScale;

      let x = 0;
      if (node.left !== "") {
        primitives.push({
          type: "text",
          text: node.left,
          variant: MATH,
          x: 0,
          y: 0,
          scale: delimScale,
        });
        x += delimWidth;
      }

      place(body, x, 0, scale, primitives);
      x += bodyWidth;

      if (node.right !== "") {
        primitives.push({
          type: "text",
          text: node.right,
          variant: MATH,
          x,
          y: 0,
          scale: delimScale,
        });
        x += delimWidth;
      }

      return {
        width: x,
        height: Math.max(bodyHeight, MATH_METRICS.ascender * delimScale),
        depth: Math.max(bodyDepth, MATH_METRICS.descenderDepth * delimScale),
        primitives,
      };
    }

    case "bigop": {
      const glyphScale = ctx.display ? LAYOUT.bigScale : 1;
      const primitives: Primitive[] = [];

      const glyphHeight = MATH_METRICS.ascender * glyphScale;
      const glyphDepth = MATH_METRICS.descenderDepth * glyphScale;
      const glyphWidth = MATH_METRICS.advance * glyphScale;

      const upper = node.upper === undefined ? undefined : layoutNode(node.upper, scale * LAYOUT.scriptScale, ctx);
      const lower = node.lower === undefined ? undefined : layoutNode(node.lower, scale * LAYOUT.scriptScale, ctx);

      /*
       * THE OPERATOR'S SLOT.
       *
       * A sum is a narrow glyph with wide limits, so the slot has to be
       * as wide as the limits or they run into the expression beside it.
       * The glyph is centred in the slot, and so are the limits.
       */
      const limitScale = scale * LAYOUT.scriptScale;
      const limitWidth = Math.max(
        upper === undefined ? 0 : upper.width * limitScale,
        lower === undefined ? 0 : lower.width * limitScale,
      );
      const slotWidth = ctx.display
        ? Math.max(glyphWidth, limitWidth + LAYOUT.limitGap * scale)
        : glyphWidth;

      primitives.push({
        type: "text",
        text: node.glyph,
        variant: MATH,
        x: (slotWidth - glyphWidth) / 2,
        y: 0,
        scale: glyphScale,
      });

      let width = slotWidth;
      let height = glyphHeight;
      let depth = glyphDepth;

      if (ctx.display) {
        // In a displayed equation the limits go above and below, which is
        // what makes a summation read as a summation.
        if (upper !== undefined) {
          const s = limitScale;
          const y = glyphHeight + LAYOUT.limitGap * scale;
          place(upper, (slotWidth - upper.width * s) / 2, y, s, primitives);
          if (y + upper.height * s > height) height = y + upper.height * s;
        }
        if (lower !== undefined) {
          const s = limitScale;
          const y = -(glyphDepth + LAYOUT.limitGap * scale);
          place(lower, (slotWidth - lower.width * s) / 2, y, s, primitives);
          if (-y + lower.height * s > depth) depth = -y + lower.height * s;
        }
      } else {
        // Inline, the limits sit to the right as a script would.
        const s = scale * LAYOUT.scriptScale;
        if (upper !== undefined) {
          const y = LAYOUT.supShift * scale;
          place(upper, width, y, s, primitives);
          width += upper.width * s;
          if (y + upper.height * s > height) height = y + upper.height * s;
        }
        if (lower !== undefined) {
          const y = -LAYOUT.subShift * scale;
          place(lower, width, y, s, primitives);
          width += lower.width * s;
          if (-y + lower.height * s > depth) depth = -y + lower.height * s;
        }
      }

      return { width, height, depth, primitives };
    }

    case "matrix": {
      const primitives: Primitive[] = [];

      // The columns are as wide as their widest cell, and the rows as tall as
      // their tallest.
      const columnWidths: number[] = [];
      const laidRows: { laid: Layout; width: number }[][] = [];
      const rowHeights: number[] = [];
      const rowDepths: number[] = [];

      for (const row of node.rows) {
        const laidRow: { laid: Layout; width: number }[] = [];
        let h = 0;
        let d = 0;
        row.forEach((cell, column) => {
          const laid = layoutNode(cell, scale, ctx);
          const w = laid.width * scale;
          laidRow.push({ laid, width: w });
          if (columnWidths[column] === undefined || w > columnWidths[column]!) {
            columnWidths[column] = w;
          }
          if (laid.height * scale > h) h = laid.height * scale;
          if (laid.depth * scale > d) d = laid.depth * scale;
        });
        laidRows.push(laidRow);
        rowHeights.push(h);
        rowDepths.push(d);
      }

      const padX = LAYOUT.cellPadX * scale;
      const padY = LAYOUT.cellPadY * scale;

      /*
       * THE DELIMITERS FIRST, because they take room at the left.
       *
       * The grid is measured, and only then is the size of the delimiters
       * known — but the delimiters go at the left, so their width is added
       * to the cells' positions rather than the other way round.
       */
      const cellsWidth =
        columnWidths.reduce((sum, w) => sum + w, 0) + padX * (columnWidths.length + 1);

      // The grid's own extent, with the first row's baseline at zero.
      let y = 0;
      const baselines: number[] = [];
      for (let r = 0; r < laidRows.length; r += 1) {
        baselines.push(y);
        y -= rowDepths[r]! + padY + (rowHeights[r + 1] ?? 0);
      }

      const gridTop = rowHeights[0] ?? 0;
      const gridBottom = (baselines[baselines.length - 1] ?? 0) - (rowDepths[rowDepths.length - 1] ?? 0);

      // A matrix sits on the maths axis, so the grid is CENTRED on it.
      const shift = -(gridTop + gridBottom) / 2;

      const delimScale = Math.min(2.2, Math.max(1, (gridTop - gridBottom) / 0.9));
      const delimWidth = MATH_METRICS.advance * delimScale;
      const leftWidth = node.left === "" ? 0 : delimWidth;

      for (let r = 0; r < laidRows.length; r += 1) {
        const row = laidRows[r]!;
        const cellBaseline = baselines[r]! + shift;
        let cx = leftWidth + padX;
        for (let c = 0; c < row.length; c += 1) {
          const { laid, width } = row[c]!;
          const columnWidth = columnWidths[c]!;
          place(laid, cx + (columnWidth - width) / 2, cellBaseline, scale, primitives);
          cx += columnWidth + padX;
        }
      }

      let totalWidth = leftWidth + cellsWidth;

      if (node.left !== "") {
        primitives.push({
          type: "text",
          text: node.left,
          variant: MATH,
          x: 0,
          y: shift,
          scale: delimScale,
        });
      }

      if (node.right !== "") {
        primitives.push({
          type: "text",
          text: node.right,
          variant: MATH,
          x: totalWidth,
          y: shift,
          scale: delimScale,
        });
        totalWidth += delimWidth;
      }

      const half = (gridTop - gridBottom) / 2;
      return {
        width: totalWidth,
        height: half,
        depth: half,
        primitives,
      };
    }

    default:
      return NOTHING;
  }
}
