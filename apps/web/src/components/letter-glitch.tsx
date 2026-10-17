"use client";

/**
 * LETTER GLITCH — the dashboard header
 * ------------------------------------------------------------------------
 * A field of letters that flicker, scramble and glitch, behind the identity
 * block in the dashboard's uncovered strip. It replaces the ASCII field that
 * used to run there, and it mounts into the slot that field occupied, so
 * .nt-dash__strip's height, its two edge scrims and the identity block's
 * z-index are all untouched.
 *
 * HOW IT WORKS, IN ONE PARAGRAPH
 * Every character is rasterised ONCE into a texture atlas — a grid of glyphs,
 * each in its own cell. A second texture, the state texture, is one texel per
 * grid cell and holds four numbers per cell: which glyph, how brightly it sits
 * at rest, how hot it is glitching, and which colour it glitches into. The
 * fragment shader works out which cell each pixel is in, looks up the cell's
 * glyph, samples that glyph's coverage out of the atlas, and paints it. So
 * the per-frame cost is one texture fetch and a handful of multiplies per
 * pixel, and moving a letter is a byte written into the state texture rather
 * than a draw call.
 *
 * "Heat" is what separates the two appearances. A cell at rest is drawn in the
 * base colour at low opacity; a cell glitching is drawn in its glitch colour at
 * full strength, with the base fading out underneath as the heat rises. That
 * is the whole visual difference between "a letter sitting there" and "a
 * letter flashing", and it is why the field can be almost static and still
 * read as alive.
 *
 * COLOURS
 * ------------------------------------------------------------------------
 * Both come from the active palette, through lib/palette-colours.ts, for the
 * same reason the tutor's scene does: a reader can be on any of fifty-two
 * palettes and a hard-coded colour is wrong on fifty-one of them.
 *
 *   glitch colour   the single MOST SATURATED accent in the palette
 *   base colour     white on a dark palette, black on a light one
 *
 * ONE glitch colour, not two, and that is the whole point of it. With the
 * component's stock pair the flash reads as an animation between two colours.
 * With a single colour the flash reads as a change in INTENSITY, which is
 * what "a letter glitching" actually looks like — and it means the field
 * cannot introduce a hue the reader's palette does not contain.
 *
 * The base colour is not derived, it is chosen: the letters have to sit ON the
 * page, and the only legible answer on a near-black page is near-white and on
 * near-white paper is near-black. Taking it from a token would put a coloured
 * base under a coloured flash, and the flash would stop reading as a flash.
 */

import { useEffect, useRef } from "react";
import { isLightTheme, mostSaturatedAccent, PALETTE_ACCENT_TOKENS, type ThemeTokens } from "@/lib/palette-colours";

const DEFAULT_CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$&*()-_+=/[]{};:<>.,0123456789";
const DEFAULT_FONT =
  "ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, Consolas, 'Liberation Mono', monospace";
const MAX_COLORS = 8;
const INTRO_SECONDS = 1.4;
const REST_RATE = 0.2;
const GLITCH_RATE = 0.1;
const MAX_WALKERS = 48;

/**
 * THE TUNING
 * ------------------------------------------------------------------------
 * Every value the component exposes, at the number this surface wants.
 *
 *   baseOpacity: 0.8   Nearly opaque, where the component's own default is
 *                      0.16. The strip is 20vh of a dashboard, not a
 *                      full-bleed hero: it sits behind an avatar, a name, an
 *                      email and a row of controls, and the scrims at its two
 *                      ends are what keeps those readable. So the letters
 *                      themselves are near-solid and the EDGES do the fading,
 *                      rather than the letters being ghostly everywhere and
 *                      the edges doing nothing.
 *
 *   density: 1         Every cell carries a letter at rest. The strip is short
 *                      and wide, so at the component's default 0.9 the field
 *                      reads as sparse text and the horizon of it is missing.
 *
 *   spacing: 0.5       Tighter than the default 0.6 and tighter than the
 *                      "classic" look, because at 14px on a 20vh strip the
 *                      looser pitch leaves the field reading as a word list.
 *
 *   smooth: false      The component's default is true, which fades a
 *                      glitching letter in and out. Off, it flickers on and
 *                      off instantly, which is the look the name asks for and
 *                      also the cheaper one — no per-frame attack curve on
 *                      every active cell.
 *
 *   flow: 0            No drifting waves of light. At the default 0.5 the
 *                      rest brightness breathes across the field, which is
 *                      lovely over a full page and reads as flicker here,
 *                      competing with the glitching for the same attention.
 *
 *   interactive: false And cursorRadius: 0. The strip carries the account's
 *                      avatar and a row of controls. A field that lights up
 *                      around the pointer is a field that lights up under a
 *                      button the reader is reaching for, and a canvas that
 *                      tracks the cursor in a strip this short would move the
 *                      identity block by a handful of pixels while they aim
 *                      at it. Neither is wired up. clickEffect is kept at
 *                      "tear" rather than "none": with interaction off it can
 *                      never fire, but leaving it at the default means the one
 *                      thing this component does well is still here if the
 *                      strip ever gets a surface of its own to be clicked.
 *
 *   stars... n/a.      Not a prop on this component; the stars and the
 *                      aurora in the sibling scene are its own vocabulary.
 */
/**
 * The shape of every setting below.
 *
 * Written out rather than inferred from `as const`, for one concrete reason:
 * `as const` narrows `baseColor` to the literal `"#ffffff"`, and the component
 * reassigns it per theme. That is a compile error under `as const` and an `as
 * any` under anything weaker — neither is a thing to discover on a palette
 * change.
 */
type LetterGlitchProps = {
  /** Colours a glitching letter lights up in. One here, by design. */
  readonly glitchColors: ReadonlyArray<string>;
  /** The colour a letter sits at when nothing is happening. */
  readonly baseColor: string;
  readonly characters: string;
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly spacing: number;
  readonly density: number;
  readonly baseOpacity: number;
  readonly glitchAmount: number;
  readonly speed: number;
  readonly smooth: boolean;
  readonly interactive: boolean;
  readonly cursorRadius: number;
  readonly clickEffect: "tear" | "burst" | "none";
  readonly edgeFade: number;
  readonly centerFade: number;
  readonly flow: number;
  readonly intro: boolean;
};

const TUNING: LetterGlitchProps = {
  /** Filled in per theme. */
  glitchColors: [],
  baseColor: "#ffffff",
  characters: DEFAULT_CHARACTERS,
  fontFamily: DEFAULT_FONT,
  fontSize: 14,
  spacing: 0.5,
  density: 1,
  baseOpacity: 0.8,
  glitchAmount: 0.8,
  speed: 1,
  smooth: false,
  interactive: false,
  cursorRadius: 0,
  clickEffect: "tear",
  edgeFade: 0,
  centerFade: 0,
  flow: 0,
  intro: true,
};

/**
 * Device pixel ratio cap.
 *
 * The glyph atlas is rasterised once at fontSize * ratio and each cell is
 * filled by a single texelFetch, so the cost here is one nearest-neighbour
 * lookup per pixel — this component is far cheaper per pixel than the tutor
 * scene, which shades four noise octaves and a star grid per pixel. The cap is
 * 2 rather than 1.5 for that reason: the letters are hard-edged glyph
 * coverage, and nearest-neighbour magnification of a 14px glyph is exactly
 * where a too-low buffer turns into mush.
 */
const DPR_CAP = 2;

/* ------------------------------------------------------------------ */
/* GLSL                                                                */
/* ------------------------------------------------------------------ */

const VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uAtlas;
uniform sampler2D uState;
uniform ivec2 uCell;
uniform ivec2 uGrid;
uniform int uAtlasColumns;
uniform vec2 uResolution;
uniform vec2 uOrigin;
uniform vec3 uBase;
uniform float uBaseOpacity;
uniform vec3 uColors[8];
uniform float uEdge;
uniform float uCenter;
uniform vec2 uPointer;
uniform float uRadius;
uniform float uPresence;
uniform float uReveal;
uniform float uTime;
uniform float uFlow;
uniform float uFlowScale;
uniform vec4 uBackground;
out vec4 outColor;

float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 w = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
}

float smoother(float x) {
  x = clamp(x, 0.0, 1.0);
  return x * x * x * (x * (x * 6.0 - 15.0) + 10.0);
}

void main() {
  /* The y flip is load-bearing. The state texture is indexed in GRID space,
     whose row 0 is the top of the field, while gl_FragCoord.y counts up from
     the bottom. Without the flip every cell shows its vertically mirrored
     neighbour's glyph. */
  vec2 frag = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y) - uOrigin;
  ivec2 q = ivec2(floor(frag));
  ivec2 cell = q / uCell;
  vec4 color = vec4(0.0);
  if (all(greaterThanEqual(q, ivec2(0))) && all(lessThan(cell, uGrid))) {
    vec4 state = texelFetch(uState, cell, 0);
    int glyph = int(state.r * 255.0 + 0.5);
    ivec2 texel = ivec2(glyph % uAtlasColumns, glyph / uAtlasColumns) * uCell + (q - cell * uCell);
    float coverage = texelFetch(uAtlas, texel, 0).a;
    if (coverage > 0.0) {
      vec2 center = vec2(cell * uCell) + vec2(uCell) * 0.5 + uOrigin;
      float mask = 1.0;
      if (uEdge > 0.0) {
        vec2 edge = min(center, uResolution - center) / uEdge;
        mask = smoother(edge.x) * smoother(edge.y);
      }
      if (uCenter > 0.0) {
        vec2 room = max(abs(center - uResolution * 0.5) - uResolution * vec2(0.3, 0.24), 0.0);
        float soft = min(uResolution.x, uResolution.y) * 0.24;
        mask *= 1.0 - uCenter * (1.0 - smoother(length(room) / soft));
      }
      float seed = hash(vec2(cell) + 17.0);
      float rest = state.g * uBaseOpacity * (0.8 + 0.2 * sin(uTime * (0.5 + 1.2 * seed) + seed * 40.0));
      if (uFlow > 0.0) {
        vec2 p = center / uFlowScale;
        float n = 0.65 * noise(p + vec2(uTime * 0.05, uTime * 0.03))
                + 0.35 * noise(p * 2.03 - vec2(uTime * 0.04, -uTime * 0.06));
        rest *= mix(1.0, 0.1 + 1.7 * smoothstep(0.25, 0.8, n), uFlow);
      }
      if (uPresence > 0.0) {
        float d = length(center - uPointer) / uRadius;
        float f = clamp(1.0 - d * d, 0.0, 1.0);
        rest = mix(rest, max(rest, uReveal * step(0.004, state.g)), f * f * uPresence);
      }
      float heat = state.b;
      rest = min(rest, 1.0) * (1.0 - heat);
      vec3 tint = uColors[int(state.a * 255.0 + 0.5)];
      float weight = coverage * mask;
      color = vec4((uBase * rest + tint * heat) * weight, (rest + heat) * weight);
    }
  }
  outColor = color + uBackground * (1.0 - color.a);
}`;

/* ------------------------------------------------------------------ */
/* the engine                                                          */
/* ------------------------------------------------------------------ */

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const smoother = (v: number): number => {
  const x = clamp(v, 0, 1);
  return x * x * x * (x * (x * 6 - 15) + 10);
};

/** Every uniform resolved BY NAME — see the note on the same helper in horizon-bloom.tsx. */
function uniformMap(gl: WebGL2RenderingContext, p: WebGLProgram): Record<string, WebGLUniformLocation | null> {
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) as number;
  const out: Record<string, WebGLUniformLocation | null> = {};
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    if (info === null) continue;
    out[info.name.replace(/\[0\]$/, "")] = gl.getUniformLocation(p, info.name);
  }
  return out;
}

function startLetterGlitch(
  canvas: HTMLCanvasElement,
  container: HTMLElement,
  getProps: () => LetterGlitchProps,
  onError?: (err: unknown) => void,
): { destroy(): void } | null {
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
  });
  if (gl === null) return null;

  const compile = (type: number, src: string): WebGLShader | null => {
    const s = gl.createShader(type);
    if (s === null) return null;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (gl.getShaderParameter(s, gl.COMPILE_STATUS)) return s;
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error(`shader: ${log ?? "compile failed"}`);
  };

  let program: WebGLProgram;
  let u: Record<string, WebGLUniformLocation | null>;
  try {
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT);
    if (vs === null || fs === null) return null;
    const p = gl.createProgram();
    if (p === null) return null;
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error(`link: ${gl.getProgramInfoLog(p) ?? "failed"}`);
    }
    program = p;
    u = uniformMap(gl, p);
  } catch (err) {
    onError?.(err);
    return null;
  }

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.disable(gl.BLEND);

  const makeTexture = (): WebGLTexture => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  const atlasTexture = makeTexture();
  const stateTexture = makeTexture();
  const maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  const atlas = document.createElement("canvas");
  const atlasContext = atlas.getContext("2d");
  const probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (atlasContext === null) return null;

  const colorCache = new Map<string, [number, number, number]>();
  const parse = (value: string): [number, number, number] => {
    const key = String(value);
    const hit = colorCache.get(key);
    if (hit !== undefined) return hit;
    let rgb: [number, number, number] = [1, 1, 1];
    if (probe !== null) {
      probe.clearRect(0, 0, 1, 1);
      probe.fillStyle = "#ffffff";
      probe.fillStyle = key;
      probe.fillRect(0, 0, 1, 1);
      const d = probe.getImageData(0, 0, 1, 1).data;
      rgb = [d[0]! / 255, d[1]! / 255, d[2]! / 255];
    }
    colorCache.set(key, rgb);
    return rgb;
  };

  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

  const view = { width: 1, height: 1, ratio: 1 };
  const grid = { cols: 0, rows: 0, cellW: 0, cellH: 0, originX: 0, originY: 0, atlasColumns: 1 };
  const pointer = { x: 0, y: 0, sx: 0, sy: 0, inside: false, presence: 0, stir: 0, fresh: true };
  const walkers: Array<Record<string, number>> = [];
  const palette = new Float32Array(MAX_COLORS * 3);
  const loadedFonts = new Set<string>();

  let pool = [0];
  let typeKey = "";
  let paletteKey = "";
  let colorCount = 1;
  let count = 0;
  let data = new Uint8Array(0);
  let heat = new Float32Array(0);
  let peak = new Float32Array(0);
  let hold = new Float32Array(0);
  let fade = new Float32Array(0);
  let wait = new Float32Array(0);
  let delay = new Float32Array(0);
  let luck = new Float32Array(0);
  let level = new Float32Array(0);
  let born = new Float32Array(0);
  let slot = new Int32Array(0);
  let active = new Int32Array(0);
  let activeCount = 0;
  let introLeft = TUNING.intro && !reduce;
  let clock = 0;
  let time = 0;
  let density = -1;
  let restCarry = 0;
  let glitchCarry = 0;
  let cursorCarry = 0;
  let dirty = true;
  let raf = 0;
  let last = 0;
  let visible = true;
  let destroyed = false;

  const randomGlyph = (): number => pool[(Math.random() * pool.length) | 0]!;
  const randomColor = (): number => (Math.random() * colorCount) | 0;
  const props = (): LetterGlitchProps => getProps();
  const restValue = (i: number, appear = 1): number =>
    luck[i]! < props().density ? Math.round(level[i]! * 255 * appear) : 0;

  const cellAt = (x: number, y: number): number => {
    const c = Math.floor((x - grid.originX) / grid.cellW);
    const r = Math.floor((y - grid.originY) / grid.cellH);
    if (c < 0 || r < 0 || c >= grid.cols || r >= grid.rows) return -1;
    return r * grid.cols + c;
  };

  const ignite = (i: number, strength: number, holdTime: number, fadeTime: number, color: number, after = 0): void => {
    if (slot[i]! < 0) {
      slot[i] = activeCount;
      active[activeCount++] = i;
      heat[i] = 0;
      hold[i] = holdTime;
      peak[i] = strength;
      fade[i] = fadeTime;
      wait[i] = 0;
      delay[i] = after;
      data[i * 4 + 3] = color;
      return;
    }
    if (heat[i]! < 0.15) data[i * 4 + 3] = color;
    peak[i] = hold[i]! > 0 ? Math.max(peak[i]!, strength) : strength;
    hold[i] = Math.max(hold[i]!, holdTime);
    fade[i] = Math.max(fade[i]!, fadeTime);
    delay[i] = Math.min(delay[i]!, after);
  };

  const release = (k: number): void => {
    const i = active[k]!;
    const moved = active[--activeCount]!;
    active[k] = moved;
    slot[moved] = k;
    slot[i] = -1;
    heat[i] = 0;
    data[i * 4 + 2] = 0;
  };

  const buildType = (): { resized: boolean; charsChanged: boolean } => {
    const s = props();
    const size = s.fontSize * view.ratio;
    const font = `${size}px ${s.fontFamily}`;
    const chars = Array.from(s.characters);
    const unique = Array.from(new Set(chars)).slice(0, 256);

    atlasContext.font = font;
    let advance = 1;
    for (const ch of unique) advance = Math.max(advance, atlasContext.measureText(ch).width);
    const metrics = atlasContext.measureText("M");
    const cellW = Math.max(2, Math.ceil(advance + size * s.spacing));
    const cellH = Math.max(2, Math.ceil(size * (0.95 + s.spacing)));
    const columns = Math.max(1, Math.min(unique.length, Math.floor(maxSize / cellW)));

    atlas.width = columns * cellW;
    atlas.height = Math.ceil(unique.length / columns) * cellH;
    atlasContext.font = font;
    atlasContext.textAlign = "center";
    atlasContext.textBaseline = "alphabetic";
    atlasContext.fillStyle = "#ffffff";
    // Centred on the glyph's own ascent/descent rather than on a fixed
    // baseline, so a cell of punctuation sits in the same optical band as a
    // cell of capitals. Fixed, the row drifts as the mix changes.
    const baseline = cellH / 2 + ((metrics.actualBoundingBoxAscent ?? size * 0.7) - (metrics.actualBoundingBoxDescent ?? size * 0.2)) / 2;
    unique.forEach((ch, i) => {
      atlasContext.fillText(ch, (i % columns) * cellW + cellW / 2, Math.floor(i / columns) * cellH + baseline);
    });

    gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);

    const lookup = new Map(unique.map((ch, i) => [ch, i]));
    const nextPool = chars.map((ch) => lookup.get(ch)).filter((i): i is number => i !== undefined);
    const charsChanged = nextPool.length !== pool.length || nextPool.some((i, k) => i !== pool[k]);
    pool = nextPool.length > 0 ? nextPool : [0];

    const resized = cellW !== grid.cellW || cellH !== grid.cellH;
    grid.cellW = cellW;
    grid.cellH = cellH;
    grid.atlasColumns = columns;

    if (!loadedFonts.has(font) && document.fonts?.load) {
      loadedFonts.add(font);
      document.fonts
        .load(font, s.characters)
        .then(() => {
          typeKey = "";
          wake();
        })
        .catch(() => {});
    }
    return { resized, charsChanged };
  };

  const birthTime = (c: number, r: number, cols: number, rows: number): number => {
    const dx = (c + 0.5) / cols - 0.5;
    const dy = (r + 0.5) / rows - 0.5;
    const radial = Math.min(1, Math.hypot(dx, dy * 0.8) * 1.6);
    return INTRO_SECONDS * (0.3 * radial + 0.7 * Math.pow(Math.random(), 1.3));
  };

  const buildGrid = (): void => {
    const cols = Math.ceil(canvas.width / grid.cellW) + 1;
    const rows = Math.ceil(canvas.height / grid.cellH) + 1;
    grid.originX = Math.floor((canvas.width - cols * grid.cellW) / 2);
    grid.originY = Math.floor((canvas.height - rows * grid.cellH) / 2);
    if (cols === grid.cols && rows === grid.rows) return;

    const n = cols * rows;
    const nextData = new Uint8Array(n * 4);
    const nextLuck = new Float32Array(n);
    const nextLevel = new Float32Array(n);
    const nextBorn = new Float32Array(n);
    // Re-anchor on resize by shifting the old grid by half the difference, so
    // a window drag does not reshuffle every letter.
    const shiftC = Math.floor((grid.cols - cols) / 2);
    const shiftR = Math.floor((grid.rows - rows) / 2);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const oc = c + shiftC;
        const or_ = r + shiftR;
        if (oc >= 0 && or_ >= 0 && oc < grid.cols && or_ < grid.rows) {
          const j = or_ * grid.cols + oc;
          nextData[i * 4] = data[j * 4]!;
          nextData[i * 4 + 1] = data[j * 4 + 1]!;
          nextLuck[i] = luck[j]!;
          nextLevel[i] = level[j]!;
          nextBorn[i] = born[j]!;
        } else {
          nextData[i * 4] = randomGlyph();
          nextLuck[i] = Math.random();
          nextLevel[i] = 0.55 + 0.45 * Math.random();
          nextBorn[i] = introLeft ? birthTime(c, r, cols, rows) : -1;
        }
      }
    }

    grid.cols = cols;
    grid.rows = rows;
    count = n;
    data = nextData;
    luck = nextLuck;
    level = nextLevel;
    born = nextBorn;
    heat = new Float32Array(n);
    peak = new Float32Array(n);
    hold = new Float32Array(n);
    fade = new Float32Array(n);
    wait = new Float32Array(n);
    delay = new Float32Array(n);
    slot = new Int32Array(n).fill(-1);
    active = new Int32Array(n);
    activeCount = 0;
    walkers.length = 0;

    for (let i = 0; i < n; i++) data[i * 4 + 1] = born[i]! >= 0 ? 0 : restValue(i);

    density = props().density;
    gl.bindTexture(gl.TEXTURE_2D, stateTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, cols, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    dirty = false;
  };

  const syncType = (): void => {
    const s = props();
    const key = `${s.fontSize * view.ratio}|${s.fontFamily}|${s.spacing}|${s.characters}`;
    if (key === typeKey) return;
    typeKey = key;
    const { resized, charsChanged } = buildType();
    if (resized || grid.cols === 0) buildGrid();
    if (charsChanged) {
      for (let i = 0; i < count; i++) data[i * 4] = randomGlyph();
      dirty = true;
    }
  };

  const syncPalette = (): void => {
    const s = props();
    const key = s.glitchColors.join(",");
    if (key === paletteKey) return;
    paletteKey = key;
    colorCount = Math.max(1, s.glitchColors.length);
    for (let i = 0; i < MAX_COLORS; i++) {
      const rgb = parse(s.glitchColors[Math.min(i, colorCount - 1)] ?? "#ffffff");
      palette[i * 3] = rgb[0];
      palette[i * 3 + 1] = rgb[1];
      palette[i * 3 + 2] = rgb[2];
    }
    for (let i = 0; i < count; i++) {
      if (data[i * 4 + 3]! >= colorCount) data[i * 4 + 3] = randomColor();
    }
    dirty = true;
  };

  const addWalker = (w: Record<string, number>): void => {
    if (walkers.length < MAX_WALKERS) {
      walkers.push({ carry: 0, after: 0, wiggle: 0, branch: 0, ...w });
    }
  };

  /**
   * THE TEAR
   *
   * Two walkers per row, launched in opposite directions along five rows
   * centred on the click, each igniting every cell it crosses. The rows get
   * progressively shorter and dimmer with distance from the centre and the
   * outer two are usually skipped, which is what makes it read as a rip rather
   * than a rectangle of noise. Each row's pair is offset horizontally from the
   * click so the two halves of the tear do not start on the same column.
   */
  const spawnTear = (x: number, y: number): void => {
    const centre = cellAt(x, y);
    if (centre < 0) return;
    const r0 = Math.floor(centre / grid.cols);
    const width = grid.cols * grid.cellW;
    for (let dr = -2; dr <= 2; dr++) {
      const r = r0 + dr;
      if (r < 0 || r >= grid.rows) continue;
      const weight = 1 - Math.abs(dr) / 3;
      if (dr !== 0 && Math.random() > 0.3 + 0.6 * weight) continue;
      const color = randomColor();
      const rowY = grid.originY + (r + 0.5) * grid.cellH;
      const shift = (Math.random() - 0.5) * 6 * grid.cellW * (1 - weight);
      for (const angle of [0, Math.PI]) {
        const life = width * (0.12 + 0.5 * weight * (0.4 + 0.6 * Math.random()));
        addWalker({
          x: x + shift,
          y: rowY,
          angle,
          life,
          span: life,
          speed: (2200 + Math.random() * 1200) * view.ratio,
          after: Math.abs(dr) * 0.035 + Math.random() * 0.03,
          color,
        });
      }
    }
  };

  const spawnBurst = (x: number, y: number): void => {
    const centre = cellAt(x, y);
    if (centre < 0) return;
    ignite(centre, 1, 0.08, 0.8, randomColor());
    if (props().clickEffect === "burst") {
      const reach = Math.min(view.width, view.height) * view.ratio;
      const rays = 5 + ((Math.random() * 3) | 0);
      const turn = Math.random() * Math.PI * 2;
      for (let k = 0; k < rays; k++) {
        const life = reach * (0.25 + Math.random() * 0.3);
        addWalker({
          x,
          y,
          angle: turn + (k / rays) * Math.PI * 2 + (Math.random() - 0.5) * 0.4,
          life,
          span: life,
          speed: (700 + Math.random() * 400) * view.ratio,
          wiggle: 0.2,
          branch: 0.03,
          color: randomColor(),
        });
      }
    } else {
      spawnTear(x, y);
    }
  };

  const stepWalkers = (dt: number): void => {
    for (let k = walkers.length - 1; k >= 0; k--) {
      const w = walkers[k]!;
      if (w.after! > 0) {
        w.after = w.after! - dt;
        continue;
      }
      // Step by the cell's own diagonal, so a walker at 45 degrees cannot
      // tunnel through a cell it should have lit.
      const step = Math.max(1, Math.abs(Math.cos(w.angle!)) * grid.cellW + Math.abs(Math.sin(w.angle!)) * grid.cellH * 0.6);
      w.carry = w.carry! + w.speed! * dt;
      while (w.carry! >= step && w.life! > 0) {
        w.carry = w.carry! - step;
        w.life = w.life! - step;
        w.angle = w.angle! + (Math.random() - 0.5) * w.wiggle!;
        w.x = w.x! + Math.cos(w.angle!) * step;
        w.y = w.y! + Math.sin(w.angle!) * step;
        const i = cellAt(w.x!, w.y!);
        if (i < 0) {
          w.life = 0;
          break;
        }
        const left = w.life! / w.span!;
        ignite(i, 0.5 + 0.5 * left, 0.03 + Math.random() * 0.05, 0.5 + 0.5 * left, w.color!);
        if (w.branch! > 0 && Math.random() < w.branch!) {
          const side = Math.random() < 0.5 ? -1 : 1;
          const life = w.life! * (0.45 + Math.random() * 0.3);
          addWalker({
            x: w.x!,
            y: w.y!,
            angle: w.angle! + side * (0.5 + Math.random() * 0.5),
            life,
            span: w.span!,
            speed: w.speed!,
            wiggle: w.wiggle!,
            color: w.color!,
          });
        }
      }
      if (w.life! <= 0) walkers.splice(k, 1);
    }
  };

  /**
   * AMBIENT ACTIVITY
   *
   * Two independent rates. `restCarry` reshuffles glyphs in cells that are not
   * currently glitching, which is what makes a static field still scramble.
   * `glitchCarry` starts new glitches, and a quarter of them are drawn out as
   * a short horizontal RUN rather than a single cell — a one-cell glitch is a
   * blink, a run is a glitch.
   *
   * glitchAmount is raised to the power 1.6 before it is used as a rate,
   * because the eye reads the response as very non-linear: the difference
   * between 0.5 and 0.6 events per second per cell is obvious and the
   * difference between 0.05 and 0.06 is not.
   */
  const ambient = (dt: number): void => {
    const s = props();
    if (reduce || s.speed <= 0 || count === 0) return;

    restCarry += count * REST_RATE * s.speed * dt;
    let changes = Math.min(count, restCarry | 0);
    restCarry -= changes;
    while (changes-- > 0) {
      const i = (Math.random() * count) | 0;
      if (slot[i]! < 0) {
        data[i * 4] = randomGlyph();
        dirty = true;
      }
    }

    const tempo = Math.max(s.speed, 0.2);
    glitchCarry += count * Math.pow(s.glitchAmount, 1.6) * GLITCH_RATE * s.speed * dt;
    let events = Math.min(count, glitchCarry | 0);
    glitchCarry -= events;
    while (events-- > 0) {
      const i = (Math.random() * count) | 0;
      const color = randomColor();
      const strength = 0.45 + 0.55 * Math.random();
      const holdTime = (0.04 + Math.random() * 0.26) / tempo;
      const fadeTime = (0.45 + Math.random() * 0.6) / tempo;
      const roll = Math.random();
      if (roll < 0.24) {
        const c = i % grid.cols;
        const long = roll < 0.015;
        const length = Math.min(grid.cols - c, long ? 10 + ((Math.random() * 24) | 0) : 2 + ((Math.random() * 7) | 0));
        const pace = (long ? 0.012 : 0.028) / tempo;
        for (let k = 0; k < length; k++) ignite(i + k, strength, holdTime, fadeTime, color, k * pace);
      } else {
        ignite(i, strength, holdTime, fadeTime, color);
      }
    }
  };

  const excite = (dt: number): void => {
    const s = props();
    if (pointer.presence < 0.02 || reduce || count === 0 || !s.interactive) return;
    const radius = s.cursorRadius * view.ratio;
    if (radius < 1) return;
    const c0 = Math.max(0, Math.floor((pointer.sx - radius - grid.originX) / grid.cellW));
    const c1 = Math.min(grid.cols - 1, Math.floor((pointer.sx + radius - grid.originX) / grid.cellW));
    const r0 = Math.max(0, Math.floor((pointer.sy - radius - grid.originY) / grid.cellH));
    const r1 = Math.min(grid.rows - 1, Math.floor((pointer.sy + radius - grid.originY) / grid.cellH));
    const chance = pointer.presence * (3 + 9 * pointer.stir) * dt;
    for (let r = r0; r <= r1; r++) {
      const dy = (grid.originY + (r + 0.5) * grid.cellH - pointer.sy) / radius;
      for (let c = c0; c <= c1; c++) {
        const dx = (grid.originX + (c + 0.5) * grid.cellW - pointer.sx) / radius;
        const d = dx * dx + dy * dy;
        if (d >= 1) continue;
        const i = r * grid.cols + c;
        if (slot[i]! < 0 && Math.random() < (1 - d) * (1 - d) * chance) {
          data[i * 4] = randomGlyph();
          dirty = true;
        }
      }
    }
    const cells = (Math.PI * radius * radius) / (grid.cellW * grid.cellH);
    cursorCarry += cells * pointer.presence * (0.15 + 4 * pointer.stir) * dt;
    let sparks = Math.min(512, cursorCarry | 0);
    cursorCarry -= sparks;
    while (sparks-- > 0) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.sqrt(Math.random());
      const falloff = (1 - distance * distance) ** 2;
      if (Math.random() > falloff) continue;
      const i = cellAt(pointer.sx + Math.cos(angle) * distance * radius, pointer.sy + Math.sin(angle) * distance * radius);
      if (i < 0) continue;
      ignite(i, (0.3 + 0.7 * Math.random()) * (0.45 + 0.55 * pointer.stir), 0.02 + Math.random() * 0.08, 0.35 + Math.random() * 0.4, randomColor());
    }
  };

  /**
   * THE ENVELOPE
   *
   * Every active cell is moved along attack -> hold -> decay here, and its
   * heat is written back into the state texture. With `smooth` on, attack is
   * an exponential approach to the peak and decay is exponential; with it off
   * the cell is simply at its peak for the hold and then at nothing, which is
   * the hard flicker the dashboard wants and is also why nothing below has to
   * interpolate.
   *
   * The glyph is reshuffled on a timer that GROWS as the heat falls —
   * `(1 - h)^2` — so a cell tearing across the screen changes character almost
   * every frame while one barely lit barely changes at all.
   */
  const settle = (dt: number): void => {
    const s = props();
    const tempo = Math.max(s.speed, 0.5);
    const attack = 1 - Math.exp(-dt / 0.05);
    for (let k = 0; k < activeCount; ) {
      const i = active[k]!;
      if (delay[i]! > 0) {
        delay[i] = delay[i]! - dt;
        k++;
        continue;
      }
      let h = heat[i]!;
      if (hold[i]! > 0) {
        hold[i] = hold[i]! - dt;
        h = s.smooth ? h + (peak[i]! - h) * attack : peak[i]!;
      } else {
        h = s.smooth ? h * Math.exp((-dt * 4) / Math.max(fade[i]!, 0.05)) : 0;
      }
      if (h < 0.012 && hold[i]! <= 0) {
        release(k);
        dirty = true;
        continue;
      }
      heat[i] = h;
      wait[i] = wait[i]! - dt;
      if (wait[i]! <= 0) {
        data[i * 4] = randomGlyph();
        wait[i] = ((0.045 + 0.45 * (1 - h) * (1 - h)) * (0.6 + 0.8 * Math.random())) / tempo;
      }
      data[i * 4 + 2] = Math.round(h * 255);
      dirty = true;
      k++;
    }
  };

  /**
   * THE INTRO
   *
   * Each cell is born at its own time — earlier near the middle, and with a
   * random component — so the field assembles outward rather than appearing
   * all at once. A cell ignites as it is born, at low strength, which is the
   * flicker the boot is made of.
   */
  const reveal = (dt: number): void => {
    if (!introLeft) return;
    const s = props();
    let pending = false;
    for (let i = 0; i < count; i++) {
      const t = born[i]!;
      if (t < 0) continue;
      const age = clock - t;
      if (age < 0) {
        pending = true;
        continue;
      }
      if (age < dt && Math.random() < (luck[i]! < s.density ? 0.45 : 0.12)) {
        ignite(i, 0.4 + 0.5 * Math.random(), 0.02, 0.35 + Math.random() * 0.35, randomColor());
      }
      const appear = s.smooth ? smoother(age / 0.35) : 1;
      data[i * 4 + 1] = restValue(i, appear);
      if (appear >= 1) born[i] = -1;
      else pending = true;
    }
    dirty = true;
    if (!pending) introLeft = false;
  };

  const draw = (now: number): void => {
    if (destroyed) return;
    raf = window.requestAnimationFrame(draw);
    const s = props();
    const dt = last === 0 ? 1 / 60 : clamp((now - last) / 1000, 0.0005, 0.05);
    last = now;
    clock += dt;
    if (!reduce) time += dt * s.speed;

    syncType();
    syncPalette();

    if (s.density !== density) {
      density = s.density;
      for (let i = 0; i < count; i++) if (born[i]! < 0) data[i * 4 + 1] = restValue(i);
      dirty = true;
    }

    const goal = s.interactive && pointer.inside && !reduce ? 1 : 0;
    pointer.presence += (goal - pointer.presence) * (1 - Math.exp(-dt / 0.25));
    if (Math.abs(goal - pointer.presence) < 0.002) pointer.presence = goal;
    const px = pointer.sx;
    const py = pointer.sy;
    const follow = 1 - Math.exp(-dt / 0.07);
    pointer.sx += (pointer.x - pointer.sx) * follow;
    pointer.sy += (pointer.y - pointer.sy) * follow;
    const moved = Math.hypot(pointer.sx - px, pointer.sy - py) / view.ratio / dt;
    pointer.stir += (clamp(moved / 1400, 0, 1) - pointer.stir) * (1 - Math.exp(-dt / 0.12));
    if (pointer.stir < 0.001) pointer.stir = 0;

    reveal(dt);
    ambient(dt);
    excite(dt);
    stepWalkers(dt);
    settle(dt);

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(program);
    gl.bindVertexArray(vao);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, stateTexture);
    if (dirty) {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, grid.cols, grid.rows, gl.RGBA, gl.UNSIGNED_BYTE, data);
      dirty = false;
    }
    gl.uniform1i(u.uState, 1);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
    gl.uniform1i(u.uAtlas, 0);

    gl.uniform2i(u.uCell, grid.cellW, grid.cellH);
    gl.uniform2i(u.uGrid, grid.cols, grid.rows);
    gl.uniform1i(u.uAtlasColumns, grid.atlasColumns);
    gl.uniform2f(u.uResolution, canvas.width, canvas.height);
    gl.uniform2f(u.uOrigin, grid.originX, grid.originY);
    gl.uniform3fv(u.uBase, parse(s.baseColor));
    gl.uniform1f(u.uBaseOpacity, clamp(s.baseOpacity, 0, 1));
    gl.uniform3fv(u.uColors, palette);
    gl.uniform1f(u.uEdge, clamp(s.edgeFade, 0, 0.5) * Math.min(canvas.width, canvas.height));
    gl.uniform1f(u.uCenter, clamp(s.centerFade, 0, 1));
    gl.uniform2f(u.uPointer, pointer.sx, pointer.sy);
    gl.uniform1f(u.uRadius, Math.max(1, s.cursorRadius * view.ratio));
    gl.uniform1f(u.uPresence, pointer.presence);
    gl.uniform1f(u.uReveal, Math.min(1, s.baseOpacity * 3.5));
    gl.uniform1f(u.uTime, time);
    gl.uniform1f(u.uFlow, clamp(s.flow, 0, 1));
    gl.uniform1f(u.uFlowScale, Math.max(canvas.width, canvas.height) * 0.32);
    // Transparent: the strip's own background, the scrims and the identity
    // block's glass all sit in the same stacking context, and an opaque
    // canvas would hide them.
    gl.uniform4f(u.uBackground, 0, 0, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  function wake(): void {
    if (raf === 0 && visible && !document.hidden) raf = window.requestAnimationFrame(draw);
  }

  const resize = (): void => {
    const s = props();
    view.width = Math.max(1, container.clientWidth);
    view.height = Math.max(1, container.clientHeight);
    view.ratio = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    canvas.width = Math.max(1, Math.round(view.width * view.ratio));
    canvas.height = Math.max(1, Math.round(view.height * view.ratio));
    syncType();
    if (grid.cols > 0) buildGrid();
    wake();
  };

  const locate = (e: PointerEvent): void => {
    const r = container.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    pointer.inside = x >= 0 && y >= 0 && x <= r.width && y <= r.height;
    pointer.x = x * view.ratio;
    pointer.y = y * view.ratio;
    if (pointer.fresh || pointer.presence < 0.02) {
      pointer.sx = pointer.x;
      pointer.sy = pointer.y;
      pointer.fresh = false;
    }
  };

  const onPointerMove = (e: PointerEvent): void => {
    locate(e);
    wake();
  };
  const onPointerDown = (e: PointerEvent): void => {
    locate(e);
    const s = props();
    if (!pointer.inside || s.clickEffect === "none" || !s.interactive || reduce || count === 0) return;
    spawnBurst(pointer.x, pointer.y);
    wake();
  };
  const onPointerUp = (e: PointerEvent): void => {
    if (e.pointerType !== "mouse") pointer.inside = false;
  };
  const onPointerLeave = (): void => {
    pointer.inside = false;
    wake();
  };
  const onVisibility = (): void => {
    last = 0;
    wake();
  };
  const onFonts = (): void => {
    typeKey = "";
    wake();
  };

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);

  const intersection = new IntersectionObserver(
    (entries) => {
      visible = entries.some((e) => e.isIntersecting);
      if (visible) {
        last = 0;
        wake();
      }
    },
    { threshold: 0 },
  );
  intersection.observe(container);

  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerdown", onPointerDown, { passive: true });
  window.addEventListener("pointerup", onPointerUp, { passive: true });
  window.addEventListener("pointercancel", onPointerUp, { passive: true });
  document.documentElement.addEventListener("pointerleave", onPointerLeave);
  document.addEventListener("visibilitychange", onVisibility);
  document.fonts?.addEventListener?.("loadingdone", onFonts);

  resize();

  return {
    destroy() {
      destroyed = true;
      window.cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      intersection.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      document.fonts?.removeEventListener?.("loadingdone", onFonts);
      gl.deleteTexture(atlasTexture);
      gl.deleteTexture(stateTexture);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(program);
    },
  };
}

/* ------------------------------------------------------------------ */
/* the component                                                       */
/* ------------------------------------------------------------------ */

/** Read the palette tokens off `.nt-root`, the way every engine here does. */
function readTokens(): ThemeTokens {
  const host = document.querySelector<HTMLElement>(".nt-root") ?? document.documentElement;
  const cs = getComputedStyle(host);
  const bag: Record<string, string> = { "--bg-0": cs.getPropertyValue("--bg-0").trim() };
  for (const n of PALETTE_ACCENT_TOKENS) bag[n] = cs.getPropertyValue(n).trim();
  return bag;
}

/**
 * The base colour: white on a dark palette, black on a light one.
 *
 * Not derived from a token on purpose — see the note at the top of the file.
 * It is the one colour in this component that is a decision rather than a
 * reading.
 */
function baseColorFor(tokens: ThemeTokens): string {
  return isLightTheme(tokens) ? "#000000" : "#ffffff";
}

export default function LetterGlitch(): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (host === null || canvas === null) return;

    // The colours are resolved once here and read through a getter on every
    // frame, because a theme change has to reach the running engine without
    // tearing down its grid — the same MutationObserver trick
    // ascii-field.tsx and horizon-bloom.tsx use.
    let tuning: LetterGlitchProps = { ...TUNING, glitchColors: [TUNING.baseColor] };
    const retheme = (): void => {
      const tokens = readTokens();
      tuning = {
        ...TUNING,
        glitchColors: [mostSaturatedAccent(tokens)],
        baseColor: baseColorFor(tokens),
      };
    };
    retheme();

    const engine = startLetterGlitch(canvas, host, () => tuning, (err: unknown) => {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[letter-glitch] disabled:", err);
      }
    });

    // next-themes swaps the palette name onto <html> as a class, so watching
    // that attribute is what repaints the field in the new theme instead of
    // holding the colours it booted with.
    const themeObserver = new MutationObserver(retheme);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    return () => {
      themeObserver.disconnect();
      engine?.destroy();
    };
  }, []);

  return (
    <div ref={hostRef} className="nt-letter-glitch">
      <canvas ref={canvasRef} aria-hidden="true" />
    </div>
  );
}
