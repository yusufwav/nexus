"use client";

/*
 * THE PIXEL BLAST
 * ------------------------------------------------------------
 * A field of cells that drift, glow and breathe, behind the landing
 * page.
 *
 * Two passes. The first is a SIMULATION: every cell reads the
 * previous frame and the fbm field, and writes its own new value,
 * so the pattern evolves rather than merely animating. The second
 * draws those cells as shapes.
 *
 * The cell grid is ping-ponged between two framebuffers and each
 * cell reads its neighbours, so the field has MEMORY - which is why
 * it folds and drifts instead of scrolling.
 *
 * A port of the react-bits component. The shaders and the maths are
 * in pixel-blast-core.ts, copied from it character for character.
 * What changed is that the colour comes from the theme.
 *
 * THE SETTINGS
 * ------------------------------------------------------------
 * They are the ones the react-bits preview URL names, and nothing
 * else was touched:
 *
 *   glow=1.5 preset=mono color=ffffff accentColor=ffffff
 *   patternScale=2.5 patternDensity=1.1 softness=0.52 twinkle=0
 *   driftAngle=131 rippleThickness=0.02 speed=2 hoverRadius=40
 *   rippleIntensityScale=0.2 variant=circle pixelSizeJitter=1
 *   drift=0.65 rippleSpeed=0.05 edgeFade=0.15 enableRipples=false
 *   hoverEffect=none pixelSize=5
 *
 * Everything the URL does not name is left at react-bits' own default.
 */

import { useEffect, useRef, useState } from "react";

import {
  CELL_FRAGMENT,
  MAIN_FRAGMENT,
  MAX_CLICKS,
  SHAPES,
  HOVERS,
  INTRO_SECONDS,
  clamp,
  compile,
  hexToRgb,
  invert3,
  link,
  multiply3,
  parseHex,
  planeFor,
  randomFloat,
} from "./pixel-blast-core";

/**
 * The props. The names and the meanings are react-bits'; the defaults are
 * the ones the react-bits preview URL names.
 */
export type PixelBlastProps = {
  /** square | circle | triangle | diamond | cross | ring */
  readonly variant?: "square" | "circle" | "triangle" | "diamond" | "cross" | "ring";
  readonly pixelSize?: number;
  /** The pixel colour. Left undefined, the theme's foreground is used. */
  readonly color?: string;
  /** The accent colour. Left undefined, the theme's foreground is used. */
  readonly accentColor?: string;
  readonly className?: string;
  readonly style?: React.CSSProperties;
  readonly patternScale?: number;
  readonly patternDensity?: number;
  readonly pixelSizeJitter?: number;
  readonly enableRipples?: boolean;
  readonly rippleIntensityScale?: number;
  readonly rippleThickness?: number;
  readonly rippleSpeed?: number;
  readonly autoPauseOffscreen?: boolean;
  readonly speed?: number;
  readonly transparent?: boolean;
  readonly edgeFade?: number;
  readonly noiseAmount?: number;
  readonly softness?: number;
  readonly smoothing?: number;
  readonly glow?: number;
  readonly twinkle?: number;
  readonly drift?: number;
  readonly driftAngle?: number;
  /** none | grow | reveal */
  readonly hoverEffect?: "none" | "grow" | "reveal";
  readonly hoverRadius?: number;
  readonly autoRipple?: number;
  readonly tiltX?: number;
  readonly tiltY?: number;
  readonly intro?: boolean;
  readonly variation?: number;
  /** Left undefined, it follows the theme. */
  readonly lightMode?: boolean;
  readonly dpr?: number;
};

/**
 * The settings the engine reads, after react-bits' defaults have been
 * applied to them.
 */
type BlastSettings = {
  variant: number;
  pixelSize: number;
  color: string;
  accentColor: string;
  patternScale: number;
  patternDensity: number;
  pixelSizeJitter: number;
  enableRipples: boolean;
  rippleIntensityScale: number;
  rippleThickness: number;
  rippleSpeed: number;
  autoPauseOffscreen: boolean;
  speed: number;
  transparent: boolean;
  edgeFade: number;
  noiseAmount: number;
  softness: number;
  smoothing: number;
  glow: number;
  twinkle: number;
  drift: number;
  driftAngle: number;
  hoverEffect: number;
  hoverRadius: number;
  autoRipple: number;
  tiltX: number;
  tiltY: number;
  intro: boolean;
  variation?: number;
  lightMode: boolean;
  dpr?: number;
};

const PixelBlast = ({
  variant = 'circle',
  pixelSize = 5,
  color = '#ffffff',
  accentColor,
  className,
  style,
  patternScale = 2.5,
  patternDensity = 1.1,
  pixelSizeJitter = 1,
  enableRipples = false,
  rippleIntensityScale = 0.2,
  rippleThickness = 0.02,
  rippleSpeed = 0.05,
  autoPauseOffscreen = true,
  speed = 2,
  transparent = true,
  edgeFade = 0.15,
  noiseAmount = 0,
  softness = 0.52,
  smoothing = 1,
  glow = 1.5,
  twinkle = 0,
  drift = 0.65,
  driftAngle = 131,
  hoverEffect = 'none',
  hoverRadius = 40,
  autoRipple = 0,
  tiltX = 0,
  tiltY = 0,
  intro = true,
  variation,
  lightMode = false,
  dpr
}: PixelBlastProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wakeRef = useRef<(() => void) | null>(null);

  /*
    THE COLOUR, READ OFF THE THEME.

    The preset is MONO - one colour, not a gradient - and the URL says that
    colour is white. On a dark page that is right: the pixels are the page's
    own foreground. On a LIGHT page a white field is invisible, so the pixels
    become the page's own INK instead.

    In other words the pixels are always the page's foreground colour, and
    the theme decides what that is. Nothing here names a colour, so all fifty
    palettes stay correct without a line being edited per theme.

    And whether the page is light is decided by how bright its own
    background is, not by looking for a class named "light". There are fifty
    generated palettes plus a hand-written pair, and they are not all
    reached by a class called light. This is the same test the ASCII field
    uses.
  */
  const [theme, setTheme] = useState({ color: "#ffffff", lightMode: false });
  useEffect(() => {
    const read = (): void => {
      const host = document.querySelector<HTMLElement>(".nt-root");
      const cs = getComputedStyle(host ?? document.documentElement);
      const bg = cs.getPropertyValue("--bg-0").trim();
      const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(bg);
      let light = false;
      if (m) {
        const hex =
          m[1].length === 3
            ? m[1].split("").map((c) => c + c).join("")
            : m[1];
        const n = Number.parseInt(hex, 16);
        const lum =
          (0.2126 * ((n >> 16) & 255) +
            0.7152 * ((n >> 8) & 255) +
            0.0722 * (n & 255)) /
          255;
        light = lum > 0.5;
      }
      setTheme({ color: light ? "#12100e" : "#ffffff", lightMode: light });
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  const settings = {
    variant: SHAPES[variant] ?? 0,
    pixelSize: Math.max(0.5, pixelSize),
    color,
    accentColor: accentColor || color,
    patternScale,
    patternDensity,
    pixelSizeJitter,
    enableRipples,
    rippleIntensityScale,
    rippleThickness: Math.max(0.001, rippleThickness),
    rippleSpeed,
    autoPauseOffscreen,
    speed,
    transparent,
    edgeFade: clamp(edgeFade, 0, 1),
    noiseAmount,
    softness: clamp(softness, 0, 1),
    smoothing: clamp(smoothing, 0, 1),
    glow: clamp(glow, 0, 2),
    twinkle: clamp(twinkle, 0, 1),
    drift,
    driftAngle,
    hoverEffect: HOVERS[hoverEffect] ?? 0,
    hoverRadius: Math.max(10, hoverRadius),
    autoRipple: Math.max(0, autoRipple),
    tiltX: clamp(tiltX, -70, 70),
    tiltY: clamp(tiltY, -70, 70),
    intro,
    variation,
    lightMode,
    dpr
  };
  /*
    The theme's colour wins over the prop, because the field IS the page's
    foreground. A caller can still pass an explicit colour to override that,
    which is what the two props are for.
  */
  if (color === undefined) settings.color = theme.color;
  if (accentColor === undefined) settings.accentColor = theme.color;
  if (lightMode === undefined) settings.lightMode = theme.lightMode;

  const settingsRef = useRef<BlastSettings>(settings);
  settingsRef.current = settings;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const canvas = document.createElement("canvas");
    canvas.className = "nt-pixel__canvas";
    canvas.setAttribute("aria-hidden", "true");
    container.appendChild(canvas);
    canvasRef.current = canvas;
    const gl = canvas?.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false
    });
    if (!container || !canvas || !gl) return undefined;
    const cellShader = link(gl, CELL_FRAGMENT);
    const mainShader = link(gl, MAIN_FRAGMENT);
    if (!cellShader || !mainShader) return undefined;
    const cu = cellShader.uniforms;
    const mu = mainShader.uniforms;
    const vao = gl.createVertexArray();

    const makeTexture = (filter: number) => {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      return texture;
    };
    const targets = [0, 1].map(() => {
      const texture = makeTexture(gl.LINEAR);
      const framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      return { texture, framebuffer };
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const view = {
      width: 1,
      height: 1,
      ratio: 1,
      plane: null as number[] | null,
      tiltKey: '',
    };
    const cells = { x: 0, y: 0, w: 1, h: 1, key: '' };
    const pointer = { x: 0, y: 0, inside: false };
    const mouse = { x: 0, y: 0, ready: false };
    const clickPos = new Float32Array(MAX_CLICKS * 2).fill(-1);
    const clickAt = new Float32Array(MAX_CLICKS);
    const clickAge = new Float32Array(MAX_CLICKS);
    let clickIndex = 0;
    let current = 0;
    let fresh = true;
    const seedOffset = settingsRef.current.variation;
    const timeOffset = typeof seedOffset === 'number' ? seedOffset * 37 : randomFloat() * 1000;
    let elapsed = 0;
    let clock = 0;
    let presence = 0;
    let driftX = 0;
    let driftY = 0;
    let introClock = settingsRef.current.intro && !reduce ? 0 : 1;
    let nextAuto = 1.2;
    let raf = 0;
    let last = 0;
    let visible = true;
    let quiet = 0;
    /**
     * Whether the ASCII hero is still on screen. While it is, the field is
     * behind something opaque and does not need to be drawn.
     */
    let heroOnScreen = false;

    const patternTime = (s: BlastSettings) => timeOffset + elapsed * s.speed;

    const layoutCells = (s: BlastSettings) => {
      const ps = s.pixelSize * view.ratio;
      const cps = 8 * ps;
      const w = canvas.width;
      const h = canvas.height;
      let minX = -w / 2;
      let maxX = w / 2;
      let minY = -h / 2;
      let maxY = h / 2;
      if (view.plane) {
        const corners = [
          [0, 0],
          [w, 0],
          [0, h],
          [w, h],
          [w / 2, 0],
          [w / 2, h],
          [0, h / 2],
          [w, h / 2]
        ];
        minX = Infinity;
        maxX = -Infinity;
        minY = Infinity;
        maxY = -Infinity;
        for (const [x, y] of corners) {
          const [qx, qy] = toPlane(x, y);
          if (qx < -1e5) continue;
          minX = Math.min(minX, qx - w / 2);
          maxX = Math.max(maxX, qx - w / 2);
          minY = Math.min(minY, qy - h / 2);
          maxY = Math.max(maxY, qy - h / 2);
        }
        if (!Number.isFinite(minX)) {
          minX = -w / 2;
          maxX = w / 2;
          minY = -h / 2;
          maxY = h / 2;
        }
      }
      const pad = cps;
      const x0 = Math.floor((minX - pad) / cps);
      const x1 = Math.floor((maxX + pad) / cps);
      const y0 = Math.floor((minY - pad) / cps);
      const y1 = Math.floor((maxY + pad) / cps);
      const width = Math.max(1, Math.min(2048, x1 - x0 + 1));
      const height = Math.max(1, Math.min(2048, y1 - y0 + 1));
      const key = `${x0}:${y0}:${width}:${height}`;
      if (key === cells.key) return;
      cells.key = key;
      cells.x = x0;
      cells.y = y0;
      cells.w = width;
      cells.h = height;
      for (const target of targets) {
        gl.bindTexture(gl.TEXTURE_2D, target.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      }
      fresh = true;
    };

    const planeClicks = new Float32Array(MAX_CLICKS * 2);

    const stepCells = (s: BlastSettings, decay: number) => {
      for (let k = 0; k < MAX_CLICKS; k++) {
        if (clickPos[k * 2] < 0) {
          planeClicks[k * 2] = -1;
          planeClicks[k * 2 + 1] = -1;
          continue;
        }
        const [px, py] = toPlane(clickPos[k * 2], clickPos[k * 2 + 1]);
        planeClicks[k * 2] = Math.max(px, 0);
        planeClicks[k * 2 + 1] = py;
      }
      const [mx, my] = toPlane(mouse.x, mouse.y);
      const source = targets[current];
      const target = targets[1 - current];
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, cells.w, cells.h);
      gl.disable(gl.BLEND);
      gl.useProgram(cellShader.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, source.texture);
      gl.uniform1i(cu.uPrev, 0);
      gl.uniform2f(cu.uResolution, canvas.width, canvas.height);
      gl.uniform1f(cu.uTime, patternTime(s));
      gl.uniform1f(cu.uPixelSize, s.pixelSize * view.ratio);
      gl.uniform1f(cu.uScale, s.patternScale);
      gl.uniform1f(cu.uDensity, s.patternDensity);
      gl.uniform1i(cu.uEnableRipples, s.enableRipples ? 1 : 0);
      gl.uniform1f(cu.uRippleSpeed, s.rippleSpeed);
      gl.uniform1f(cu.uRippleThickness, s.rippleThickness);
      gl.uniform1f(cu.uRippleIntensity, s.rippleIntensityScale);
      gl.uniform2fv(cu.uClickPos, planeClicks);
      gl.uniform1fv(cu.uClickAge, clickAge);
      gl.uniform2i(cu.uOrigin, cells.x, cells.y);
      gl.uniform2f(cu.uDrift, driftX, driftY);
      gl.uniform1i(cu.uHover, s.hoverEffect);
      gl.uniform2f(cu.uMouse, mx, my);
      gl.uniform1f(cu.uMouseRadius, s.hoverRadius * view.ratio);
      gl.uniform1f(cu.uMousePresence, presence);
      gl.uniform1f(cu.uIntro, introClock);
      gl.uniform1f(cu.uDecay, decay);
      gl.uniform1f(cu.uFresh, fresh ? 1 : 0);
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      current = 1 - current;
      fresh = false;
    };

    const draw = (): void => {
      const s = settingsRef.current;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(mainShader.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, targets[current].texture);
      gl.uniform1i(mu.uCells, 0);
      gl.uniform3fv(mu.uColor, hexToRgb(s.color));
      gl.uniform3fv(mu.uAccent, hexToRgb(s.accentColor));
      gl.uniform2f(mu.uResolution, canvas.width, canvas.height);
      gl.uniform1f(mu.uTime, patternTime(s));
      gl.uniform1f(mu.uClock, clock);
      gl.uniform1f(mu.uPixelSize, s.pixelSize * view.ratio);
      gl.uniform1f(mu.uPixelJitter, s.pixelSizeJitter);
      gl.uniform1f(mu.uEdgeFade, s.edgeFade);
      gl.uniform1i(mu.uShapeType, s.variant);
      gl.uniform2i(mu.uOrigin, cells.x, cells.y);
      gl.uniform2i(mu.uCellCount, cells.w, cells.h);
      gl.uniform1f(mu.uSoftness, s.softness);
      gl.uniform1f(mu.uSmoothing, s.smoothing);
      gl.uniform1f(mu.uGlow, s.glow);
      gl.uniform1f(mu.uTwinkle, reduce ? 0 : s.twinkle);
      gl.uniform1f(mu.uLightMode, s.lightMode ? 1 : 0);
      gl.uniform1f(mu.uTransparent, s.transparent ? 1 : 0);
      gl.uniform1f(mu.uNoise, s.noiseAmount);
      gl.uniform1i(mu.uHover, s.hoverEffect);
      gl.uniform1f(mu.uTilted, view.plane ? 1 : 0);
      if (view.plane) {
        const m = view.plane;
        gl.uniformMatrix3fv(mu.uPlane, false, [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]);
      }
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
    };

    const toPlane = (x: number, y: number): number[] => {
      const m = view.plane;
      if (!m) return [x, y];
      const h = canvas.height;
      const cy = h - y;
      const z = m[6] * x + m[7] * cy + m[8];
      if (z <= 1e-4) return [-1e6, -1e6];
      return [(m[0] * x + m[1] * cy + m[2]) / z, h - (m[3] * x + m[4] * cy + m[5]) / z];
    };

    const updatePlane = (s: BlastSettings) => {
      view.plane = s.tiltX || s.tiltY ? planeFor(s.tiltX, s.tiltY, canvas.width, canvas.height) : null;
      view.tiltKey = `${s.tiltX}:${s.tiltY}:${canvas.width}:${canvas.height}`;
    };

    const resize = (): void => {
      const s = settingsRef.current;
      view.width = Math.max(1, container.clientWidth);
      view.height = Math.max(1, container.clientHeight);
      view.ratio = Math.min(s.dpr || window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(view.width * view.ratio));
      canvas.height = Math.max(1, Math.round(view.height * view.ratio));
      if (!mouse.ready) {
        mouse.ready = true;
        mouse.x = canvas.width / 2;
        mouse.y = canvas.height / 2;
      }
      updatePlane(s);
      layoutCells(s);
      stepCells(s, 0);
      draw();
      wake();
    };

    const frame = (now: number): void => {
      raf = 0;
      const s = settingsRef.current;
      if (!visible && s.autoPauseOffscreen) return;
      if (document.hidden) return;
      const dt = last ? clamp((now - last) / 1000, 0, 1 / 20) : 0;
      last = now;
      if (!reduce) elapsed += dt;
      clock += dt;
      if (!reduce && s.drift) {
        const angle = (s.driftAngle * Math.PI) / 180;
        driftX += Math.cos(angle) * s.drift * dt * 0.05;
        driftY += Math.sin(angle) * s.drift * dt * 0.05;
      }
      if (!reduce && s.enableRipples && s.autoRipple > 0 && introClock >= 1) {
        nextAuto -= dt;
        if (nextAuto <= 0) {
          nextAuto = s.autoRipple * (0.7 + Math.random() * 0.6);
          addRipple((0.15 + Math.random() * 0.7) * view.width, (0.15 + Math.random() * 0.7) * view.height);
        }
      }
      for (let k = 0; k < MAX_CLICKS; k++) clickAge[k] = (clock - clickAt[k]) * 0.5;
      const targetX = pointer.x * view.ratio;
      const targetY = (view.height - pointer.y) * view.ratio;
      const follow = 1 - Math.exp(-dt / 0.08);
      if (pointer.inside) {
        mouse.x += (targetX - mouse.x) * follow;
        mouse.y += (targetY - mouse.y) * follow;
      }
      presence += ((pointer.inside ? 1 : 0) - presence) * (1 - Math.exp(-dt / 0.25));
      const key = `${s.tiltX}:${s.tiltY}:${canvas.width}:${canvas.height}`;
      if (key !== view.tiltKey) updatePlane(s);
      layoutCells(s);
      const decay = s.hoverEffect ? Math.exp(-dt / 0.45) : 0;
      stepCells(s, decay);
      draw();
      if (introClock < 1) introClock = Math.min(1, introClock + dt / INTRO_SECONDS);
      let busy = !reduce && (s.speed !== 0 || s.drift !== 0 || s.twinkle > 0 || (s.autoRipple > 0 && s.enableRipples));
      busy = busy || introClock < 1 || presence > 0.001;
      for (let k = 0; k < MAX_CLICKS; k++) busy = busy || (clickPos[k * 2] >= 0 && clickAge[k] < 8);
      quiet = busy ? 0 : quiet + dt;
      if (quiet < 1.5) raf = requestAnimationFrame(frame);
    };

    function wake(): void {
      if (heroOnScreen) return;
      quiet = 0;
      if (!raf && (visible || !settingsRef.current.autoPauseOffscreen) && !document.hidden) {
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    }

    const locate = (event: PointerEvent): { x: number; y: number; inside: boolean } => {
      const rect = container.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      return { x, y, inside: x >= 0 && y >= 0 && x <= rect.width && y <= rect.height };
    };

    const onPointerMove = (event: PointerEvent): void => {
      const { x, y, inside } = locate(event);
      const was = pointer.inside;
      pointer.inside = inside;
      if (inside) {
        pointer.x = x;
        pointer.y = y;
        if (!was) {
          mouse.x = x * view.ratio;
          mouse.y = (view.height - y) * view.ratio;
        }
      }
      if (inside || was) wake();
    };

    function addRipple(x: number, y: number): void {
      clickPos[clickIndex * 2] = x * view.ratio;
      clickPos[clickIndex * 2 + 1] = (view.height - y) * view.ratio;
      clickAt[clickIndex] = clock;
      clickIndex = (clickIndex + 1) % MAX_CLICKS;
      wake();
    }

    const onPointerDown = (event: PointerEvent): void => {
      const s = settingsRef.current;
      const { x, y, inside } = locate(event);
      if (!inside || reduce || !s.enableRipples) return;
      addRipple(x, y);
    };

    const onPointerLeave = (): void => {
      pointer.inside = false;
      wake();
    };

    const onVisibility = (): void => wake();

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    const intersection = new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting);
      if (visible) wake();
    });
    intersection.observe(container);

    /*
      The hero. It is the one thing on the page that hides the field
      completely, so it is the one thing worth pausing the loop for.
    */
    const hero = document.querySelector('.nt-landing');
    const heroObserver = hero
      ? new IntersectionObserver(entries => {
          heroOnScreen = entries.some(entry => entry.isIntersecting);
          if (heroOnScreen) {
            if (raf) cancelAnimationFrame(raf);
            raf = 0;
            last = 0;
          } else {
            wake();
          }
        })
      : null;
    if (hero) heroObserver?.observe(hero);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    document.documentElement.addEventListener('pointerleave', onPointerLeave);
    document.addEventListener('visibilitychange', onVisibility);
    resize();
    wakeRef.current = wake;

    return () => {
      cancelAnimationFrame(raf);
      wakeRef.current = null;
      resizeObserver.disconnect();
      intersection.disconnect();
      heroObserver?.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      document.documentElement.removeEventListener('pointerleave', onPointerLeave);
      document.removeEventListener('visibilitychange', onVisibility);
      for (const target of targets) {
        gl.deleteTexture(target.texture);
        gl.deleteFramebuffer(target.framebuffer);
      }
      gl.deleteVertexArray(vao);
      gl.deleteProgram(cellShader.program);
      gl.deleteProgram(mainShader.program);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      canvas.remove();
    };

  }, []);
  useEffect(() => {
    wakeRef.current?.();
  });

  return (
    <div
      ref={containerRef}
      className={`nt-pixel${className ? ` ${className}` : ''}`}
      style={style}
      aria-label="PixelBlast interactive background"
    >
    </div>
  );
};


export default PixelBlast;
