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
export default function AsciiField({ variant }: AsciiFieldProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return;
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const interactive = variant === "landing";

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
    ]);

    const P = interactive ? "ascii" : "amb";
    const ramp = (t[`${P}-ramp`] || " .:-=+*#%@").replace(/["']/g, "").split("");
    const cell = Number.parseFloat(t[`${P}-font`]) || 13;
    const fps = Number.parseFloat(t[`${P}-fps`]) || 24;
    const speed = Number.parseFloat(t[`${P}-speed`]) || 1;
    const op = Number.parseFloat(t[`${P}-op`]);
    const cursorRadius = Number.parseFloat(t["ascii-cursor-radius"]) || 10;
    const cursorPower = Number.parseFloat(t["ascii-cursor-power"]) || 1;

    // Resolution of the buffer relative to the screen. The canvas is
    // CSS-scaled back up, so a sub-1.0 value is invisible on a
    // background this faint but cuts the per-pixel work directly.
    let scale = Number.parseFloat(t[`${P}-scale`]);
    if (!(scale > 0 && scale <= 1)) {
      scale = 1;
    }

    const low = hexToRgb(t[`${P}-low`]);
    const high = hexToRgb(t[`${P}-high`]);

    canvas.style.opacity = String(Number.isNaN(op) ? 1 : op);

    // ---- Glyph atlas ----
    // Each ramp glyph is rasterised ONCE into its own small canvas at
    // the scaled cell size. Per frame we only alpha-blend these into
    // the buffer, so no text rasterisation happens during the loop.
    const fontFamily = getComputedStyle(document.body).fontFamily;
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
      cols = Math.max(1, Math.ceil(renderW / cellPx));
      rows = Math.max(1, Math.ceil(renderH / cellPx));
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

      // Clear the whole buffer in one typed-array operation.
      buf.fill(0);

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const n1 = valueNoise(x * 0.055 + time * 0.22, y * 0.055 - time * 0.14, 1);
          const n2 = valueNoise(x * 0.021 - time * 0.11, y * 0.021 + time * 0.09, 7);
          let v = n1 * 0.62 + n2 * 0.38;

          // Cursor influence: a soft radial well that lifts the field
          // toward the pointer. Landing layer only.
          if (interactive && pointer.active) {
            const cxp = pointer.x / cell;
            const cyp = pointer.y / cell;
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
          const px0 = x * cellPx;
          const py0 = y * cellPx;
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
