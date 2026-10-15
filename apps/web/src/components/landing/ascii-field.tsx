"use client";

import { useEffect, useRef } from "react";

export interface AsciiFieldProps {
  /**
   * Landing layer is fullscreen and cursor-reactive; the ambient layer is
   * fixed, very slow, and ignores the pointer.
   */
  readonly variant: "landing" | "ambient";
}

/**
 * ASCII BACKGROUND ENGINE
 * ------------------------------------------------------------
 * Ported from IDEAS/index.html. The field is computed into an
 * ImageData buffer and blitted with a single putImageData per frame.
 * Glyphs are pre-rendered ONCE into an offscreen atlas, so per-frame
 * work is one typed-array write per cell rather than a fillText() call.
 * That is the difference between a slideshow and a smooth 30fps.
 *
 * Every tunable — ramp, cell size, fps, opacity, both colour endpoints,
 * speed, cursor influence — is read from the CSS custom properties on
 * .nt-root, so the whole look is adjustable in one place.
 */
/**
 * How tightly the grid is packed, as a fraction of the glyph's own cell.
 *
 * One number controls the character count, and it is the whole knob:
 *
 *   1.00  one character per glyph cell — the field before this existed
 *   0.89  ~26% more characters overall (1/0.89²), because density goes
 *         as the square: both axes tighten together
 *
 * This is deliberately SEPARATE from `scale`. They used to be the same
 * number doing two jobs — grid pitch AND glyph rasterisation size — so
 * the only way to get more characters was to shrink the characters, which
 * is why density and sharpness were locked together until now.
 *
 * Below about 0.8 the widest glyphs in the ramp (`#`, `%`, `@`) start
 * crowding their neighbour. Overlapping is fine and is what happens; what
 * is not fine is the last glyph in a row losing its shape, so this does
 * not go much lower without the ramp being shortened too.
 *
 * Exported for the test, which asserts the density arithmetic rather than
 * trusting it.
 */
export const ASCII_TIGHTEN = 0.89;

/**
 * The family the glyphs are rasterised in.
 *
 * Was `getComputedStyle(document.body).fontFamily`, which is
 * `@apply font-sans` from packages/ui/src/styles/globals.css — a
 * PROPORTIONAL stack. Every glyph in the ramp therefore had its own
 * advance width, so `.` and `-` sat at a visibly different spacing from
 * `#` and `@`, which is not what a character grid is supposed to look
 * like. It also meant the horizontal slack between characters was
 * whatever the widest glyph happened to leave, rather than a known
 * fraction.
 *
 * Resolved through a probe element rather than by reading the token
 * directly: `--nt-font-mono` is `var(--font-jetbrains-mono), ui-monospace,
 * ...`, and the canvas font shorthand does not resolve nested `var()`. A
 * throwaway span lets the cascade do it. Falls back to the previous
 * behaviour if anything goes wrong, so this can never be the reason the
 * field is blank.
 */
function resolveMonoFont(): string {
  if (typeof document === "undefined") {
    return "monospace";
  }
  const probe = document.createElement("span");
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.width = "0";
  probe.style.height = "0";
  probe.style.fontFamily = "var(--nt-font-mono)";
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).fontFamily;
  probe.remove();
  return resolved && resolved.length > 0 ? resolved : getComputedStyle(document.body).fontFamily;
}

export default function AsciiField({ variant }: AsciiFieldProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return;
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /*
     * TWO FLAGS, WHERE THERE WAS ONE, AND THE SECOND IS THE POINT
     * ------------------------------------------------------------
     * `isLanding` picks the token set and decides how big the field is.
     * `interactive` decides only whether the pointer drives it.
     *
     * They used to be the same flag, which is why the cursor could not be
     * switched off on its own: flipping `interactive` off also rerouted
     * the hero onto the ambient ramp, opacity and colours, so "turn the
     * pointer off" would have silently changed how the page looks. Those
     * are two unrelated decisions and they now have two names.
     *
     * OFF ON LOCALHOST, AS A DIAGNOSTIC
     * The cursor well is the one cost nothing else in this file pays: a
     * Math.sqrt PER CELL PER FRAME inside the double loop, over a
     * fullscreen grid, at 26fps. It is also the only candidate left
     * standing after scale, font and dpr were each ruled out one at a
     * time and the lag persisted. So it is off in development - which
     * costs the developer nothing (nobody is chasing a cursor well while
     * building) and, if the lag goes away on localhost, identifies the
     * cause outright rather than by elimination.
     */
    const isLanding = variant === "landing";
    const onLocalhost = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(
      globalThis.location?.hostname ?? "",
    );
    const interactive = isLanding && !onLocalhost;

    // The ambient layer honours reduced-motion: it is not started at all
    // rather than animating forever.
    if (variant === "ambient" && reduced) {
      return;
    }

    const ctx = canvas.getContext("2d", { alpha: true });
    if (ctx === null) {
      return;
    }
    // Capture into consts the closures below can narrow against. TS does
    // not carry the null check on `canvas`/`ctx` into nested functions,
    // and reassigning either would be a bug anyway.
    const el = canvas;
    const context = ctx;

    /** Read the design's tokens off .nt-root rather than :root. */
    function readTokens(names: ReadonlyArray<string>): Record<string, string> {
      const host = document.querySelector<HTMLElement>(".nt-root");
      const cs = getComputedStyle(host ?? document.documentElement);
      const out: Record<string, string> = {};
      names.forEach((n) => {
        out[n.replace(/^--/, "")] = cs.getPropertyValue(n).trim();
      });
      return out;
    }

    const t = readTokens([
      "--ascii-ramp", "--ascii-font", "--ascii-fps", "--ascii-op",
      "--ascii-low", "--ascii-high", "--ascii-speed", "--ascii-scale",
      "--ascii-cursor-radius", "--ascii-cursor-power",
      "--amb-ramp", "--amb-font", "--amb-fps", "--amb-op", "--amb-scale",
      "--amb-low", "--amb-high", "--amb-speed",
      // Read for the landing boost below: the ramp endpoints are pulled toward
      // the page's own background and foreground, which is what widens the
      // contrast, and neither is derivable from the ramp alone.
      "--bg-0", "--fg",
    ]);

    const P = isLanding ? "ascii" : "amb";
    const ramp = (t[`${P}-ramp`] || " .:-=+*#%@").replace(/["']/g, "").split("");
    const cell = Number.parseFloat(t[`${P}-font`]) || 13;
    const fps = Number.parseFloat(t[`${P}-fps`]) || 24;
    const speed = Number.parseFloat(t[`${P}-speed`]) || 1;
    let op = Number.parseFloat(t[`${P}-op`]);
    const cursorRadius = Number.parseFloat(t["ascii-cursor-radius"]) || 10;
    const cursorPower = Number.parseFloat(t["ascii-cursor-power"]) || 1;

    /*
     * Resolution of the buffer relative to the screen, and the ONLY
     * control over how sharp a character is.
     *
     * Two regimes, and the clamp used to forbid the useful one:
     *
     *   scale < 1   the buffer is smaller than its CSS box and the
     *               browser scales it UP. Anything under 1 is blur by
     *               construction - the browser is inventing the pixels
     *               in between. This is why --amb-scale: 0.6 made the
     *               dashboard field mush.
     *
     *   scale = 1   buffer is exactly the CSS box. Sharp as the screen
     *               allows, but the glyph itself was rasterised at only
     *               `cell` px — a 10px glyph drawn into a 10px cell has
     *               very few antialiased edges to work with, so it reads
     *               soft when you look at one character closely.
     *
     *   scale > 1   SUPERSAMPLING. The glyph is rasterised at
     *               `cell * scale` and the browser scales the buffer
     *               back down. Measurably crisper edges, and it was
     *               tried at 2 and reverted: 4x the pixels per frame
     *               on a continuously animating layer was unbearably
     *               laggy. Kept because the cap is what stops someone
     *               retrying it, not because it is a good idea here.
     *
     * The lesson from that revert, and the reason --amb-font went from
     * 10px to 11px instead: clarity at 1:1 comes from a LARGER glyph,
     * not a larger buffer. One extra pixel of type has a longer stroke
     * and more edge to read; four times the pixel work buys a softness
     * the eye stops noticing long before the frame rate recovers.
     *
     * Capped at 2 rather than left open: the cost is quadratic in scale.
     */
    let scale = Number.parseFloat(t[`${P}-scale`]);
    if (!(scale > 0 && scale <= 2)) {
      scale = 1;
    }

    /*
     * THEN MULTIPLY BY THE DEVICE PIXEL RATIO, which is the part that was
     * missing and the reason "clear resolution" kept failing.
     *
     * Every previous attempt asked "how many times bigger than a CSS
     * pixel should the buffer be" and answered with a constant. But a CSS
     * pixel is not a device pixel. On a 1x display they are the same and
     * scale: 1 is already perfectly crisp. On a 2x display the compositor
     * upscales the canvas 2x on its way to the screen REGARDLESS of what
     * the backing store is, so a buffer chosen to look right in testing
     * is resampled in the hand - which is exactly "crisp on my machine,
     * blurry on yours", and why bumping the constant by hand was chasing
     * the wrong axis.
     *
     * dpr WAS multiplied in here, and it is reverted, because it made the
     * landing page lag badly and the reasoning behind it was wrong in a way
     * worth recording.
     *
     * The claim was that the buffer should be one DEVICE pixel per device
     * pixel, so nothing is resampled. That is true as a statement about
     * crispness. What was missed is that the cost is not a property of the
     * component - it is a property of the AREA the component covers, and
     * the same component covers wildly different areas:
     *
     *   dashboard / tutor   a 20vh strip           (nt-dash__strip)
     *   landing body        position: fixed, inset: 0  - FULL VIEWPORT
     *
     * So multiplying by dpr charged the dashboard strip 4x on a small strip
     * (invisible) and charged the landing page's ambient layer 4x on the
     * entire viewport, at 20fps, on a page that also mounts the fullscreen
     * hero. That is why the lag was always, and only ever, the landing.
     *
     * The 1.5 cap on the hero did not help, and that is consistent: the
     * expensive layer is the ambient one it left at full dpr.
     *
     * So the token alone decides resolution again. The consequence is that
     * the field is resampled by the compositor on a high-dpi screen and is
     * soft there - which was true before this whole line of work, and is
     * cheaper than a page that stutters. If crispness is ever worth that
     * price again it should be bought per SURFACE by area, not by a
     * multiplier on the shared token, and measured on a high-dpi display -
     * which is not the display this was developed on, and that is precisely
     * why it went unnoticed for four commits.
     */
    scale = Math.min(2, scale);

    let low = hexToRgb(t[`${P}-low`]);
    let high = hexToRgb(t[`${P}-high`]);

    /*
     * THE HOMEPAGE FIELD, MADE STRIKING
     * ------------------------------------------------------------
     * The field was tuned to be atmosphere: --ascii-op is 0.55 in every
     * palette and the ramp runs from a barely-there low to a muted high.
     * Behind the landing copy that reads as texture. On its own, filling the
     * hero, it reads as a nearly blank rectangle - hard to see on the dark
     * base and almost invisible on light, where a dark-on-dark ramp at 0.55
     * loses most of what little contrast it had.
     *
     * Three changes, all relative to the palette's own tokens so this stays
     * correct across all thirty-three of them and does not hard-code a colour
     * that only works on the base:
     *
     *   opacity  raised
     *     The cheapest win, and the one the eye notices first.
     *
     *   low  pulled toward the page background
     *     Darkens the dim end of the ramp, so the glyphs separate from the
     *     page instead of sitting inside it. On light this is what stops the
     *     field reading as grey mud.
     *
     *   high  pulled toward the page foreground
     *     Brightens the lit end, which widens the ramp rather than just
     *     making the whole thing uniformly stronger. A field with more range
     *     has shape; the same field turned up looks like a filter.
     *
     * SCOPED TO variant="landing"
     * ------------------------------------------------------------
     * Only the homepage. The ambient layer behind the tutor and the dashboard
     * is meant to be unobtrusive - it sits behind a whole working interface -
     * and boosting it would compete with the content rather than frame it.
     *
     * Not done in CSS, deliberately: this engine reads its tokens off
     * .nt-root through getComputedStyle, so a class on the homepage wrapper
     * would never reach it. The component already knows which variant it is,
     * so that is where the decision belongs.
     */
    if (variant === "landing") {
      const bg = hexToRgb(t["bg-0"]);
      const fg = hexToRgb(t["fg"]);
      low = mixRgb(low, bg, 0.4);
      high = mixRgb(high, fg, 0.32);
      op = Math.min(1, (Number.isNaN(op) ? 0.55 : op) * 1.5);
    }

    canvas.style.opacity = String(Number.isNaN(op) ? 1 : op);

    // ---- Glyph atlas ----
    // Each ramp glyph is rasterised ONCE into its own small canvas at
    // the scaled cell size. Per frame we only alpha-blend these into
    // the buffer, so no text rasterisation happens during the loop.
    const fontFamily = resolveMonoFont();
    const atlasCell = Math.max(2, Math.round(cell * scale));
    const atlas = ramp.map((ch) => {
      const c = document.createElement("canvas");
      c.width = atlasCell;
      c.height = atlasCell;
      const g = c.getContext("2d");
      if (g === null) {
        return null;
      }
      g.font = `${atlasCell}px ${fontFamily}`;
      g.textBaseline = "top";
      g.fillStyle = "#fff";
      g.fillText(ch, 0, 0);
      // Keep only the glyph's coverage, so it can be tinted per cell
      // without re-reading pixels.
      const d = g.getImageData(0, 0, atlasCell, atlasCell).data;
      const a = new Uint8Array(atlasCell * atlasCell);
      for (let p = 0, k = 3; p < a.length; p++, k += 4) {
        a[p] = d[k] ?? 0;
      }
      return { ch, a };
    });

    // Precompute the colour ramp so the per-cell path does no
    // interpolation maths — just an index and a copy.
    const STEPS = 32;
    const lutR = new Uint8Array(STEPS);
    const lutG = new Uint8Array(STEPS);
    const lutB = new Uint8Array(STEPS);

    /*
     * The ramp is built from the tokens once at mount, so a theme
     * switch would otherwise leave dark-mode pixels sitting on a
     * light page. retint() re-reads the colour tokens off .nt-root
     * and rebuilds the lookup table; morph-title.tsx reads its own
     * tokens the same way.
     */
    function retint(): void {
      const next = readTokens([`--${P}-low`, `--${P}-high`, `--${P}-op`]);
      const lo = hexToRgb(next[`${P}-low`]);
      const hi = hexToRgb(next[`${P}-high`]);
      const o = Number.parseFloat(next[`${P}-op`]);
      el.style.opacity = String(Number.isNaN(o) ? 1 : o);
      for (let i = 0; i < STEPS; i++) {
        const f = i / (STEPS - 1);
        lutR[i] = lo[0] + (hi[0] - lo[0]) * f;
        lutG[i] = lo[1] + (hi[1] - lo[1]) * f;
        lutB[i] = lo[2] + (hi[2] - lo[2]) * f;
      }
      // The frame loop reads the LUT every tick, so the next painted
      // frame already carries the new colours. When the layer is
      // paused there is no next frame, so clear the stale one.
      if (!running) {
        context.clearRect(0, 0, el.width, el.height);
      }
    }

    for (let i = 0; i < STEPS; i++) {
      const f = i / (STEPS - 1);
      lutR[i] = low[0] + (high[0] - low[0]) * f;
      lutG[i] = low[1] + (high[1] - low[1]) * f;
      lutB[i] = low[2] + (high[2] - low[2]) * f;
    }

    // Contrast expansion for the noise field. 1 = untouched.
    const CONTRAST = 1.35;

    const pointer = { x: -9999, y: -9999, active: false };
    const frameMs = 1000 / fps;
    let raf = 0;
    let last = 0;
    let running = true;
    let destroyed = false;
    let img: ImageData | null = null;
    let buf: Uint8ClampedArray | null = null;
    let bufW = 0;
    let bufH = 0;
    let cols = 0;
    let rows = 0;
    let cellPx = atlasCell;
    /*
     * Grid pitch, in buffer pixels. Separate from `cellPx` (the glyph's
     * own rasterisation size) so that density can be changed without
     * touching sharpness. `cellPx` still answers "how big is a character";
     * these answer "how far apart are they".
     */
    let stepX = atlasCell;
    let stepY = atlasCell;

    // The buffer is rendered at `scale` of the element's CSS size, then
    // the canvas is stretched back up by CSS. Keeping the backing store
    // below device pixels is the single biggest lever on cost.
    function resize(): void {
      // A fixed layer can measure 0 before layout settles (or on a
      // cold load where hydration is late), and a canvas left at the
      // element's default 300x150 never repaints itself. Fall back to
      // the viewport so the field always has a real buffer to draw
      // into; ResizeObserver corrects it once the element is sized.
      const w = el.clientWidth || el.offsetWidth || window.innerWidth;
      const h = el.clientHeight || el.offsetHeight || window.innerHeight;

      const renderW = Math.max(1, Math.round(w * scale));
      const renderH = Math.max(1, Math.round(h * scale));

      el.width = renderW;
      el.height = renderH;

      // The noise grid still divides the screen evenly; only the pixels
      // each glyph is rasterised into are scaled down.
      cellPx = Math.max(2, Math.round(cell * scale));
      stepX = Math.max(1, Math.round(cellPx * ASCII_TIGHTEN));
      stepY = Math.max(1, Math.round(cellPx * ASCII_TIGHTEN));
      cols = Math.max(1, Math.ceil(renderW / stepX));
      rows = Math.max(1, Math.ceil(renderH / stepY));
      bufW = renderW;
      bufH = renderH;
      img = context.createImageData(bufW, bufH);
      buf = img.data;
    }

    function draw(now: number): void {
      if (destroyed) {
        return;
      }
      raf = window.requestAnimationFrame(draw);
      if (now - last < frameMs || buf === null) {
        return;
      }
      last = now;

      const time = now * 0.001 * speed;

      /*
       * Noise frequency is per CELL INDEX, not per pixel. Tightening the
       * grid raises the indices, so an unchanged frequency would shrink
       * every feature by the same factor the characters did - the field
       * would read as much finer-grained, which is a different visual
       * change from the one asked for. Dividing by ASCII_TIGHTEN keeps a
       * given number of cells spanning the same physical distance, so the
       * only thing that changes is how many characters sit in it.
       */
      const nf = 1 / ASCII_TIGHTEN;

      // Clear the whole buffer in one typed-array operation.
      buf.fill(0);

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const n1 = valueNoise(x * 0.055 * nf + time * 0.22, y * 0.055 * nf - time * 0.14, 1);
          const n2 = valueNoise(x * 0.021 * nf - time * 0.11, y * 0.021 * nf + time * 0.09, 7);
          let v = n1 * 0.62 + n2 * 0.38;

          // Cursor influence: a soft radial well that lifts the field
          // toward the pointer. Landing layer only.
          if (interactive && pointer.active) {
            /*
             * The pointer arrives in CSS pixels and `cell` is CSS pixels,
             * so this converts to cell units. It has to divide by the
             * new pitch rather than by `cell`: at a tighter pitch the same
             * pixel distance covers more cells, and using `cell` would
             * leave the well too small by exactly the factor the grid was
             * tightened by. `stepX` is buffer pixels, hence the / scale.
             */
            const pitchCss = stepX / scale;
            const cxp = pointer.x / pitchCss;
            const cyp = pointer.y / pitchCss;
            const dx = x - cxp;
            const dy = y - cyp;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < cursorRadius) {
              const infl = 1 - dist / cursorRadius;
              v += infl * infl * 0.55 * cursorPower;
            }
          }

          // Expand around the midpoint; raw value noise clusters near
          // 0.5 and would render as a flat smear.
          v = (v - 0.5) * CONTRAST + 0.5;
          if (v <= 0) {
            continue;
          }

          let gi = (v * (ramp.length - 1)) | 0;
          if (gi > ramp.length - 1) {
            gi = ramp.length - 1;
          }
          const gl = atlas[gi];
          if (gl === null || gl === undefined || gl.ch === " ") {
            continue;
          }

          let ci = (v * (STEPS - 1)) | 0;
          if (ci > STEPS - 1) {
            ci = STEPS - 1;
          }
          const cr = lutR[ci] ?? 0;
          const cg = lutG[ci] ?? 0;
          const cb = lutB[ci] ?? 0;
          const mask = gl.a;

          // Blend this cell's glyph into the buffer.
          // The glyph is written at its FULL width even though the pitch is
          // tighter than that, so neighbours genuinely overlap rather than
          // being clipped to a cell. A wider glyph drawn later simply
          // paints over the tail of the one to its left, which is what
          // "some characters overlap" looks like. Clamping to stepX instead
          // would shave the right-hand side off every wide glyph.
          const px0 = x * stepX;
          const py0 = y * stepY;
          const bw = bufW - px0;
          const bh = bufH - py0;
          if (bw <= 0 || bh <= 0) {
            continue;
          }
          const wCell = bw < cellPx ? bw : cellPx;
          const hCell = bh < cellPx ? bh : cellPx;

          for (let gy = 0; gy < hCell; gy++) {
            const mRow = gy * cellPx;
            const dRow = ((py0 + gy) * bufW + px0) << 2;
            for (let gx = 0; gx < wCell; gx++) {
              const a = mask[mRow + gx];
              if (a === 0) {
                continue;
              }
              const o = dRow + (gx << 2);
              buf[o] = cr;
              buf[o + 1] = cg;
              buf[o + 2] = cb;
              buf[o + 3] = a;
            }
          }
        }
      }

      // One blit per frame instead of thousands of text draws.
      if (img !== null) {
        context.putImageData(img, 0, 0);
      }
    }

    // ---- Lifecycle ----
    function start(): void {
      if (!running || destroyed) {
        return;
      }
      last = 0;
      raf = window.requestAnimationFrame(draw);
    }
    function stop(): void {
      running = false;
      window.cancelAnimationFrame(raf);
    }
    function play(): void {
      running = true;
      start();
    }

    function onPointerMove(e: PointerEvent): void {
      const r = el.getBoundingClientRect();
      pointer.x = e.clientX - r.left;
      pointer.y = e.clientY - r.top;
      pointer.active = true;
    }
    function onPointerLeave(): void {
      pointer.active = false;
    }

    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    if (interactive) {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      window.addEventListener("pointerleave", onPointerLeave, { passive: true });
    }
    if (ro !== null) {
      ro.observe(el);
    }
    window.addEventListener("resize", resize);

    // Only burn frames while the layer is actually on screen.
    const io = typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver((es) => {
          es.forEach((e) => {
            if (e.isIntersecting) {
              play();
            } else {
              stop();
            }
          });
        }, { threshold: 0 })
      : null;
    if (io !== null) {
      io.observe(el);
    }

    function onVisibilityChange(): void {
      if (document.hidden) {
        stop();
      } else {
        play();
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    // next-themes swaps class="dark"/"light" on <html>. Watching that
    // attribute is what lets the field repaint in the new palette
    // instead of holding the colours it booted with.
    const themeObserver = typeof MutationObserver !== "undefined"
      ? new MutationObserver(() => {
          retint();
        })
      : null;
    if (themeObserver !== null) {
      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }

    resize();
    start();

    return () => {
      destroyed = true;
      stop();
      if (ro !== null) {
        ro.disconnect();
      }
      if (io !== null) {
        io.disconnect();
      }
      if (themeObserver !== null) {
        themeObserver.disconnect();
      }
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (interactive) {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerleave", onPointerLeave);
      }
      if (buf !== null) {
        buf.fill(0);
      }
      context.clearRect(0, 0, el.width, el.height);
    };
  }, [variant]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={variant === "landing" ? "nt-landing__ascii" : "nt-ambient-bg"}
    />
  );
}

/** Linear blend between two RGB triples: t=0 returns a, t=1 returns b. */
function mixRgb(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function hexToRgb(hex: string | undefined): [number, number, number] {
  const h = (hex ?? "").replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = Number.parseInt(full, 16);
  if (Number.isNaN(n)) {
    return [255, 255, 255];
  }
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** A 32-bit avalanche mix. Math.imul keeps every step in integer space. */
function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967295;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Bilinear value noise with a soft, organic falloff. */
function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return (a * (1 - xf) + b * xf) * (1 - yf) + (c * (1 - xf) + d * xf) * yf;
}
