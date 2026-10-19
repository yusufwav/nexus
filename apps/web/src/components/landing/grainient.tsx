"use client";

import { useEffect, useRef } from "react";

/**
 * THE GRAINIENT
 * ------------------------------------------------------------
 * A flow of colour with grain in it, behind the landing page.
 *
 * Two WebGL2 passes. The first renders the gradient: a ramp of up to eight
 * colours, interpolated in LAB space so the transitions stay clean rather
 * than going grey through the middle, warped by a two-octave value-noise
 * drift that advects the field so the colour MOVES rather than merely
 * sitting there. The second reads that back at half resolution and adds the
 * grain, animated by offsetting the hash input every frame so it shimmers
 * instead of sitting there like a dirty lens.
 *
 * This is a port of the react-bits component of the same name. The shaders
 * are the original ones, character for character, so the look is the
 * original's look. What changed is that nothing here names a colour: the
 * ramp is read off the theme the page is currently wearing, the same way
 * the ASCII field beside it reads its own. That is what lets one file serve
 * all fifty palettes, and both a light and a dark theme.
 *
 * THE SETTINGS
 * ------------------------------------------------------------
 * They are the ones the react-bits preview URL names, and nothing else was
 * touched:
 *
 *   interactive=false  grainAmount=0.03  angle=67   flow=0.9
 *   silk=0             contrast=1.38      speed=0.8  grainSize=0.5
 *   clickSwirl=false   scale=0.7
 *
 * Everything the URL does not name is left at react-bits' own default. The
 * settings that react-bits does not expose in the URL are exposed here as
 * well: `lightMode` follows the page, and `intro` is on so the field
 * reveals itself rather than snapping into place.
 *
 * WHY IT IS A SEPARATE CANVAS AND NOT A CSS GRADIENT
 * ------------------------------------------------------------
 * Because the thing that makes it good is the drift: the colour is being
 * advected through a noise field, so the gradient is never in the same
 * place twice. A CSS gradient with a slow background-position animation
 * moves a hard edge, and the shape of the colour is the whole effect.
 */

/* ============================================================
   THE SHADERS
   The original react-bits ones, character for character. The
   `#version 300 es` line has to be the FIRST thing in the source,
   so these template literals open with no newline.
   ============================================================ */

const VERTEX = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FIELD = `#version 300 es
precision highp float;
precision highp int;
uniform float uAspect;
uniform float uTime;
uniform vec3 uRamp[8];
uniform int uCount;
uniform int uType;
uniform vec2 uDir;
uniform float uExtent;
uniform float uBands;
uniform float uSoftness;
uniform float uFlow;
uniform float uScale;
uniform float uSilk;
uniform vec4 uStir[24];
uniform float uStirWeight[24];
uniform vec4 uTwirl[4];
uniform vec2 uSeed;
uniform float uContrast;
uniform float uSaturation;
uniform float uSettle;
uniform float uReveal;
in vec2 vUv;
out vec4 outColor;

vec2 hash2(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.103, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.xx + q.yz) * q.zy) * 2.0 - 1.0;
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(hash2(i), f);
  float b = dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float c = dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float d = dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
  return 0.5 + 0.5 * mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

vec2 drift(vec2 p, float t) {
  vec2 w1 = vec2(
    noise(p * 0.85 + vec2(t * 0.11, t * 0.07)),
    noise(p * 0.85 + vec2(4.1, 1.7) - vec2(t * 0.08, t * 0.12))
  );
  vec2 w2 = vec2(
    noise(p * 1.55 + w1 * 1.8 + vec2(1.3, 7.1) + t * 0.05),
    noise(p * 1.55 + w1 * 1.8 + vec2(6.4, 2.2) - t * 0.06)
  );
  return (w1 - 0.5) * 1.1 + (w2 - 0.5) * 0.55;
}

vec2 warp(vec2 p) {
  vec2 q = p / uScale;
  if (uType == 1) {
    float turn = uTime * 0.35;
    q = mat2(cos(turn), sin(turn), -sin(turn), cos(turn)) * q;
  } else {
    q += vec2(-uDir.y, uDir.x) * uTime * 0.45;
  }
  return p + drift(q + uSeed, uTime) * uFlow * uScale * uSettle;
}

float coord(vec2 p) {
  vec2 w = warp(p);
  return uType == 1 ? 1.0 - length(w) * 1.1 : dot(w, uDir) / uExtent + 0.5;
}

vec3 labToRgb(vec3 lab) {
  float l = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
  float m = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
  float s = lab.x - 0.0894841775 * lab.y - 1.2914855480 * lab.z;
  l = l * l * l;
  m = m * m * m;
  s = s * s * s;
  return vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  );
}

vec3 encode(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
  for (int i = 0; i < 24; i++) {
    float w = uStirWeight[i];
    if (w <= 0.0) continue;
    vec2 d = p - uStir[i].xy;
    p -= uStir[i].zw * w * exp(-dot(d, d) / 0.045);
  }
  for (int i = 0; i < 4; i++) {
    float angle = uTwirl[i].z;
    if (angle == 0.0) continue;
    vec2 d = p - uTwirl[i].xy;
    float a = angle * exp(-dot(d, d) / (uTwirl[i].w * uTwirl[i].w));
    float c = cos(a);
    float s = sin(a);
    p = uTwirl[i].xy + mat2(c, -s, s, c) * d;
  }
  float raw = coord(p);
  float s = raw;
  if (uBands > 1.0) {
    s *= uBands;
    float cycle = floor(s);
    s = fract(s);
    if (mod(cycle, 2.0) > 0.5) s = 1.0 - s;
  }
  s = clamp(s, 0.0, 1.0);
  float scaled = s * float(uCount - 1);
  int index = int(min(floor(scaled), float(uCount - 2)));
  float f = scaled - float(index);
  float edge = max(uSoftness * 0.5, fwidth(scaled) * 0.75);
  float shaped = smoothstep(0.5 - edge, 0.5 + edge, f);
  vec3 from = uRamp[0];
  vec3 to = uRamp[1];
  for (int i = 0; i < 7; i++) {
    if (i == index) {
      from = uRamp[i];
      to = uRamp[i + 1];
    }
  }
  vec3 lab = mix(from, to, shaped);
  if (uSilk > 0.0) {
    vec2 grad = vec2(coord(p + vec2(0.004, 0.0)) - raw, coord(p + vec2(0.0, 0.004)) - raw) / 0.004;
    vec2 slope = grad * sin(3.14159265 * clamp(raw, 0.0, 1.0) * uBands) * uSilk * 4.0;
    vec3 normal = normalize(vec3(-slope, 1.0));
    vec3 light = normalize(vec3(-uDir.y, uDir.x, 1.2));
    float diffuse = dot(normal, light) - light.z;
    lab = uRamp[0] + (lab - uRamp[0]) * (1.0 + (diffuse * 0.35 + max(diffuse, 0.0) * diffuse * 0.6) * uSilk);
  }
  lab = mix(uRamp[0], lab, smoothstep(0.0, 1.0, uReveal * 1.5 - length(vUv - 0.5) * 0.6));
  lab.x = (lab.x - 0.55) * uContrast + 0.55;
  lab.yz *= uSaturation;
  outColor = vec4(encode(labToRgb(lab)), 1.0);
}`;

const COMPOSITE = `#version 300 es
precision highp float;
uniform sampler2D uField;
uniform float uGrain;
uniform float uGrainSize;
uniform float uFrame;
in vec2 vUv;
out vec4 outColor;

float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

float clump(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main() {
  vec3 color = texture(uField, vUv).rgb;
  vec2 pixel = gl_FragCoord.xy + uFrame * vec2(17.0, 59.0);
  float fine = hash(pixel) + hash(pixel + 7.13) - 1.0;
  float coarse = (clump(pixel / max(uGrainSize, 1.0)) - 0.5) * 2.0;
  float grain = mix(fine, coarse, clamp(uGrainSize - 1.0, 0.0, 1.0) * 0.8);
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color += grain * uGrain * (0.45 + 2.2 * luma * (1.0 - luma));
  outColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}`;

/* ============================================================
   THE SETTINGS
   ============================================================ */

const MAX_COLORS = 8;
const MAX_STIRS = 24;
const MAX_TWIRLS = 4;
const STIR_LIFE = 1.3;
const STIR_STEP = 0.06;
const TWIRL_LIFE = 2.6;
const INTRO_SECONDS = 1.6;
const TYPES = { linear: 0, radial: 1 } as const;
const LIFT = 0.2;

const SETTINGS = {
  type: "linear" as "linear" | "radial",
  angle: 67,
  bands: 1,
  speed: 0.8,
  flow: 0.9,
  scale: 0.7,
  softness: 1,
  silk: 0,
  grainAmount: 0.03,
  grainSize: 0.5,
  grainAnimated: true,
  contrast: 1.38,
  saturation: 1,
  variation: 0,
  interactive: false,
  stir: 1,
  clickSwirl: false,
  intro: true,
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const toLinear = (v: number): number =>
  v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;

const toLab = ([r, g, b]: [number, number, number]): [number, number, number] => {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
};

/* ---- theme colours ---- */

type Rgb = [number, number, number];

function hexToRgb(value: string): Rgb {
  const s = value.trim().replace("#", "");
  const full =
    s.length === 3
      ? s
          .split("")
          .map((c) => c + c)
          .join("")
      : s;
  const n = Number.parseInt(full.slice(0, 6), 16);
  if (!Number.isFinite(n)) return [0, 0, 0];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function toHex([r, g, b]: Rgb): string {
  const c = (v: number): string =>
    Math.round(clamp(v, 0, 1) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Mix `a` toward `b` by `t`. t = 0 leaves a alone, t = 1 returns b. */
function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

/** Perceptual lightness, 0..1, from the sRGB triple. */
function lightness([r, g, b]: Rgb): number {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  return 0.2126 * Math.cbrt(lr) + 0.7152 * Math.cbrt(lg) + 0.0722 * Math.cbrt(lb);
}

function rgbToHsl([r, g, b]: Rgb): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb([h, s, l]: [number, number, number]): Rgb {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t: number): number => {
    let v = t;
    if (v < 0) v += 1;
    if (v > 1) v -= 1;
    if (v < 1 / 6) return p + (q - p) * 6 * v;
    if (v < 1 / 2) return q;
    if (v < 2 / 3) return p + (q - p) * (2 / 3 - v) * 6;
    return p;
  };
  return [hue(h + 1 / 3), hue(h), hue(h - 1 / 3)];
}

/**
 * A stop at a GIVEN lightness, wearing a given hue.
 *
 * The hue and the saturation come from the theme's own colour; only the
 * lightness is imposed. That is what lets a ramp walk evenly from the page's
 * own background to its own pale accent in every palette, without knowing
 * what any of them are.
 */
function atLightness(colour: Rgb, l: number): Rgb {
  const [h, s] = rgbToHsl(colour);
  return hslToRgb([h, s, l]);
}

/**
 * THE RAMP, READ OFF THE THEME.
 *
 * Every colour comes from the theme the page is currently wearing, read off
 * `.nt-root` the same way the ASCII field beside it reads its own. Nothing
 * in this file names a colour, so all fifty palettes stay correct without a
 * line being edited per theme.
 *
 * THE HUES, IN ORDER
 * ------------------------------------------------------------
 * The three accents the palette generator seeds, darkest-looking first:
 * the rotated hue, the identity accent, and the secondary, then the
 * secondary again at the pale end. So the ramp walks
 *
 *     deep hue -> identity -> secondary -> pale
 *
 * which is the shape of react-bits' own default ramp: a warm walk from
 * near-black through a saturated middle to a cream.
 *
 * WHY THE LIGHTNESS IS IMPOSED RATHER THAN TAKEN
 * ------------------------------------------------------------
 * Because the theme's own accents are not spread across the lightness
 * range. In the default dark theme they sit at 0, 0.17, 0.25, 0.91 and
 * 0.96 - three of them crammed into the bottom fifth, and the ramp spends
 * most of the screen on near-black as a result. It looked like the
 * background was broken, and it was: the palette was right and the ramp
 * was wrong.
 *
 * So each stop keeps its HUE and SATURATION and is given a lightness
 * instead, and those lightnesses are spread evenly. The ramp is then a
 * clean walk whatever the palette, and the theme's own colour is still
 * what you see - just spread out instead of bunched.
 *
 * A LIGHT PAGE
 * ------------------------------------------------------------
 * A light page cannot carry the dark ramp at all: its bottom end is a
 * near-black panel, and the landing page has paragraphs of dark text over
 * it. So on a light page the walk runs the OTHER WAY - pale at one end,
 * the deep hue at the other - and every stop is kept light enough to read
 * dark text on.
 *
 * The order is reversed on a light page, and that is not an accident.
 * react-bits' `lightMode` finds the colours that share the first colour's
 * lightness and turns them white, then takes the REST of the ramp in
 * reverse. So the tints have to be handed over darkest-first for the
 * finished ramp to come out pale-first. Getting that order wrong produces
 * a gradient that goes pale-dark-pale-dark, which looks like a mistake
 * because it is one.
 */
function themeRamp(): { colors: string[]; lightMode: boolean } {
  const host = document.querySelector<HTMLElement>(".nt-root");
  const cs = getComputedStyle(host ?? document.documentElement);
  const token = (name: string): string => cs.getPropertyValue(name).trim();

  const bg = hexToRgb(token("--bg-0") || "#000000");
  const accentA = hexToRgb(token("--accent-a") || "#8b0000");
  const accentB = hexToRgb(token("--accent-b") || "#fdd3ae");
  const accentC = hexToRgb(token("--accent-c") || "#6b0024");
  const fg = hexToRgb(token("--fg") || "#f2f4f7");

  // HOW BRIGHT THE PAGE IS, rather than looking for a class named "light".
  // There are fifty generated palettes plus a hand-written pair, and they are
  // not all reached by a class called light. Reading the page's own colour
  // and asking how bright it is is the one test that is correct for all of
  // them, and it is what the ASCII field does.
  const pageLight = 0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2];

  // The hues, in the order the ramp walks them.
  const hues = [accentC, accentA, accentB, accentB];

  if (pageLight <= 0.5) {
    // A DARK PAGE: the walk runs UP, from the page's own black to its own
    // pale accent.
    const targets = [0.16, 0.4, 0.66, 0.88];
    return {
      colors: [
        toHex(bg),
        ...hues.map((hue, i) => toHex(atLightness(hue, targets[i]))),
      ],
      lightMode: false,
    };
  }

  /*
    A LIGHT PAGE.

    THE ACCENTS AT FULL STRENGTH. Their own lightness, their own
    saturation, nothing mixed toward the paper and nothing lifted.

    This is the second half of a correction. The first version of this
    ramp raised the lightness of every accent to walk evenly from the paper
    down to the deep end - and that is exactly how you dim a colour. HSL
    saturation and perceptual chroma are not the same thing: a deep red at
    100% HSL saturation and 26% lightness is a vivid red, and the same hue
    at 86% lightness is a pale pink with half the chroma. Raising the
    lightness to spread the ramp is the same mistake wearing a different
    hat.

    On top of that, react-bits' own `lightMode` flag lifts each tint 20% of
    the way to white AND scales its chroma by 0.8, and it takes the tints
    in REVERSE when it builds the ramp. So feeding it a natural ramp
    produces a gradient that runs dark-light-dark-light. Which is why the
    ramp is built here and the flag is not set: the colours are the theme's
    own, at their own strength, in a deliberate order, and the page's own
    colour does the fading.

    The order is the same one the dark ramp walks - the deep hue, the
    identity accent, then the pale one - so the two themes are recognisably
    the same palette, just lightened by the page rather than by the ramp.
  */
  return {
    colors: [
      toHex(bg),
      toHex(accentC),
      toHex(accentA),
      toHex(accentB),
      toHex(fg),
    ],
    lightMode: false,
  };
}

/* ============================================================
   THE COMPONENT
   ============================================================ */

export default function Grainient(): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const canvas = document.createElement("canvas");
    canvas.className = "nt-grain__canvas";
    canvas.setAttribute("aria-hidden", "true");
    host.appendChild(canvas);

    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
    });
    if (!gl) {
      // No WebGL2. The page is perfectly readable without the background, so
      // this is not worth failing over - but it IS worth saying, because a
      // silent missing background is the kind of thing that gets mistaken
      // for a design decision.
      console.warn("[grainient] WebGL2 is unavailable; the background is not drawn.");
      return;
    }

    const compile = (
      type: number,
      source: string,
    ): WebGLShader | null => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
      gl.deleteShader(shader);
      return null;
    };

    const link = (
      fragmentSource: string,
    ): { program: WebGLProgram; uniforms: Record<string, WebGLUniformLocation | null> } | null => {
      const vertex = compile(gl.VERTEX_SHADER, VERTEX);
      const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
      const program = gl.createProgram();
      if (!vertex || !fragment || !program) return null;
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        gl.deleteProgram(program);
        return null;
      }
      const uniforms: Record<string, WebGLUniformLocation | null> = {};
      const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < count; i++) {
        const info = gl.getActiveUniform(program, i);
        if (!info) continue;
        const name = info.name.replace(/\[0\]$/, "");
        uniforms[name] = gl.getUniformLocation(program, name);
      }
      return { program, uniforms };
    };

    const field = link(FIELD);
    const composite = link(COMPOSITE);
    if (!field || !composite) {
      console.warn("[grainient] the shaders did not compile; the background is not drawn.");
      return;
    }
    const fu = field.uniforms;
    const cu = composite.uniforms;

    const vao = gl.createVertexArray();
    const target = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, target);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const buffer = gl.createFramebuffer();
    const fieldSize = { width: 0, height: 0 };

    const probe = document.createElement("canvas").getContext("2d", {
      willReadFrequently: true,
    });
    const colorCache = new Map<string, Rgb>();
    const parse = (value: string): Rgb => {
      const key = String(value);
      const cached = colorCache.get(key);
      if (cached) return cached;
      let rgb: Rgb = [0, 0, 0];
      if (probe) {
        probe.clearRect(0, 0, 1, 1);
        probe.fillStyle = "#000000";
        probe.fillStyle = key;
        probe.fillRect(0, 0, 1, 1);
        const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
        rgb = [r / 255, g / 255, b / 255];
      }
      colorCache.set(key, rgb);
      return rgb;
    };

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const view = { width: 1, height: 1, ratio: 1 };
    const ramp = new Float32Array(MAX_COLORS * 3);
    const stirs = new Float32Array(MAX_STIRS * 4);
    const stirWeights = new Float32Array(MAX_STIRS);
    const twirls = new Float32Array(MAX_TWIRLS * 4);
    const trail: Array<{
      x: number; y: number; vx: number; vy: number;
      age: number; grow: number; done: boolean;
    }> = [];
    const spins: Array<{ x: number; y: number; age: number; direction: number }> = [];
    const pointer = { x: 0.5, y: 0.5, sx: 0.5, sy: 0.5, vx: 0, inside: false, fresh: true };

    let colors: string[] = [];
    let lightMode = false;
    let paletteKey = "";
    let time = 0;
    let introClock = SETTINGS.intro && !reduce ? 0 : 1;
    let frameSeed = 0;
    let grainClock = 0;
    let raf = 0;
    let last = 0;
    let visible = true;
    /**
     * Whether the ASCII hero is still on screen.
     *
     * The hero is opaque and covers the grainient entirely, so while it is
     * up the background is being drawn for nobody. The two backgrounds are
     * also the two most expensive things on the page - a full-viewport
     * WebGL canvas each - and they never need to run at the same time. So
     * the grainient stops its loop while the hero is on screen, and the
     * ASCII field's own visibility handling takes over the moment it
     * leaves.
     */
    let heroOnScreen = false;

    const syncPalette = (): void => {
      const key = `${colors.join(",")}|${lightMode}`;
      if (key === paletteKey) return;
      paletteKey = key;
      const labs = colors.map((c) => toLab(parse(c)));
      if (!lightMode) {
        labs.forEach((lab, i) => ramp.set(lab, i * 3));
      } else {
        const blank = labs.map(([L]) => Math.abs(L - labs[0][0]) < 0.1);
        const tints = labs.filter((_, i) => !blank[i]).reverse();
        labs.forEach((_, i) => {
          const [L, a, b] = blank[i] ? [1, 0, 0] : (tints.shift() ?? [1, 0, 0]);
          ramp.set([L + (1 - L) * LIFT, a * (1 - LIFT), b * (1 - LIFT)], i * 3);
        });
      }
    };

    const draw = (): void => {
      const aspect = view.width / view.height;
      syncPalette();
      gl.bindVertexArray(vao);
      gl.disable(gl.BLEND);
      gl.bindFramebuffer(gl.FRAMEBUFFER, buffer);
      gl.viewport(0, 0, fieldSize.width, fieldSize.height);
      gl.useProgram(field.program);
      gl.uniform1f(fu.uAspect, aspect);
      gl.uniform1f(fu.uTime, time);
      gl.uniform3fv(fu.uRamp, ramp);
      gl.uniform1i(fu.uCount, colors.length);
      const radians = (SETTINGS.angle * Math.PI) / 180;
      gl.uniform1i(fu.uType, TYPES[SETTINGS.type]);
      gl.uniform2f(fu.uDir, Math.sin(radians), Math.cos(radians));
      gl.uniform1f(
        fu.uExtent,
        aspect * Math.abs(Math.sin(radians)) + Math.abs(Math.cos(radians)),
      );
      gl.uniform1f(fu.uBands, SETTINGS.bands);
      gl.uniform1f(fu.uSoftness, SETTINGS.softness);
      gl.uniform1f(fu.uFlow, SETTINGS.flow);
      gl.uniform1f(fu.uScale, SETTINGS.scale);
      gl.uniform1f(fu.uSilk, SETTINGS.silk);
      gl.uniform4fv(fu.uStir, stirs);
      gl.uniform1fv(fu.uStirWeight, stirWeights);
      gl.uniform4fv(fu.uTwirl, twirls);
      gl.uniform2f(fu.uSeed, SETTINGS.variation * 3.17, SETTINGS.variation * 1.91);
      gl.uniform1f(fu.uContrast, SETTINGS.contrast);
      gl.uniform1f(fu.uSaturation, SETTINGS.saturation);
      gl.uniform1f(fu.uSettle, introClock * introClock * (3 - 2 * introClock));
      gl.uniform1f(fu.uReveal, introClock);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(composite.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, target);
      gl.uniform1i(cu.uField, 0);
      gl.uniform1f(cu.uGrain, SETTINGS.grainAmount);
      gl.uniform1f(cu.uGrainSize, SETTINGS.grainSize * view.ratio);
      gl.uniform1f(cu.uFrame, frameSeed);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const resize = (): void => {
      view.width = Math.max(1, host.clientWidth);
      view.height = Math.max(1, host.clientHeight);
      view.ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(view.width * view.ratio));
      canvas.height = Math.max(1, Math.round(view.height * view.ratio));
      const width = Math.max(1, Math.round(canvas.width / 2));
      const height = Math.max(1, Math.round(canvas.height / 2));
      if (width !== fieldSize.width || height !== fieldSize.height) {
        fieldSize.width = width;
        fieldSize.height = height;
        gl.bindTexture(gl.TEXTURE_2D, target);
        gl.texImage2D(
          gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null,
        );
        gl.bindFramebuffer(gl.FRAMEBUFFER, buffer);
        gl.framebufferTexture2D(
          gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0,
        );
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }
      draw();
      wake();
    };

    const updateTouches = (dt: number, aspect: number): void => {
      const follow = 1 - Math.exp(-dt / 0.06);
      const px = pointer.sx;
      const py = pointer.sy;
      pointer.sx += (pointer.x - pointer.sx) * follow;
      pointer.sy += (pointer.y - pointer.sy) * follow;
      const vx = ((pointer.sx - px) / dt) * aspect;
      const vy = (pointer.sy - py) / dt;
      pointer.vx = vx;
      const head = trail[0];
      trail.forEach((sample) => {
        if (sample.done) sample.age += dt;
      });
      if (SETTINGS.interactive && pointer.inside && Math.hypot(vx, vy) > 0.02 && !reduce) {
        if (!head || head.done) {
          trail.unshift({ x: 0, y: 0, vx: 0, vy: 0, age: 0, grow: 0, done: false });
          if (trail.length > MAX_STIRS) trail.pop();
        }
        const live = trail[0];
        live.x = (pointer.sx - 0.5) * aspect;
        live.y = pointer.sy - 0.5;
        live.vx = vx;
        live.vy = vy;
        live.grow = Math.min(1, live.grow + dt / STIR_STEP);
        live.done = live.grow >= 1;
      } else if (head) {
        head.done = true;
      }
      while (trail.length && trail[trail.length - 1].age > STIR_LIFE) trail.pop();
      for (let i = 0; i < MAX_STIRS; i++) {
        const sample = trail[i];
        if (!sample) {
          stirWeights[i] = 0;
          continue;
        }
        const fade = 1 - sample.age / STIR_LIFE;
        const cap = Math.min(1, 2.2 / Math.max(Math.hypot(sample.vx, sample.vy), 0.001));
        stirs.set([sample.x, sample.y, sample.vx * cap, sample.vy * cap], i * 4);
        stirWeights[i] = fade * fade * sample.grow * SETTINGS.stir * 0.05;
      }
      spins.forEach((spin) => {
        spin.age += dt;
      });
      while (spins.length && spins[spins.length - 1].age > TWIRL_LIFE) spins.pop();
      for (let i = 0; i < MAX_TWIRLS; i++) {
        const spin = spins[i];
        if (!spin) {
          twirls[i * 4 + 2] = 0;
          continue;
        }
        const k = spin.age / TWIRL_LIFE;
        const envelope = Math.min(1, spin.age / 0.18) * (1 - k) * (1 - k);
        twirls.set(
          [
            spin.x, spin.y,
            spin.direction * 2.4 * envelope,
            0.16 + 0.1 * Math.min(1, spin.age / 0.5),
          ],
          i * 4,
        );
      }
    };

    const frame = (now: number): void => {
      raf = 0;
      if (!visible || document.hidden) return;
      const dt = last ? clamp((now - last) / 1000, 0.001, 0.05) : 1 / 60;
      last = now;
      if (!reduce) time += dt * SETTINGS.speed * 0.16;
      if (introClock < 1) introClock = Math.min(1, introClock + dt / INTRO_SECONDS);
      grainClock += dt;
      if (SETTINGS.grainAnimated && !reduce && grainClock > 1 / 24) {
        grainClock = 0;
        frameSeed = (frameSeed + 1) % 97;
      }
      updateTouches(dt, view.width / view.height);
      draw();
      const busy =
        (!reduce && (SETTINGS.speed > 0 || SETTINGS.grainAnimated)) ||
        introClock < 1 ||
        trail.length > 0 ||
        spins.length > 0;
      if (busy) raf = requestAnimationFrame(frame);
      else last = 0;
    };

    function wake(): void {
      if (heroOnScreen) return;
      if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame);
    }

    const locate = (event: PointerEvent): void => {
      const rect = host.getBoundingClientRect();
      const x = (event.clientX - rect.left) / Math.max(1, rect.width);
      const y = 1 - (event.clientY - rect.top) / Math.max(1, rect.height);
      pointer.inside = x >= 0 && x <= 1 && y >= 0 && y <= 1;
      pointer.x = x;
      pointer.y = y;
      if (pointer.fresh || !pointer.inside) {
        pointer.sx = x;
        pointer.sy = y;
        pointer.fresh = false;
      }
    };

    const onPointerMove = (event: PointerEvent): void => {
      locate(event);
      if (pointer.inside || trail.length) wake();
    };

    const onPointerDown = (event: PointerEvent): void => {
      locate(event);
      if (!pointer.inside || !SETTINGS.clickSwirl || reduce) return;
      spins.unshift({
        x: (pointer.x - 0.5) * (view.width / view.height),
        y: pointer.y - 0.5,
        age: 0,
        direction: pointer.vx < 0 ? 1 : -1,
      });
      if (spins.length > MAX_TWIRLS) spins.pop();
      wake();
    };

    const onPointerLeave = (): void => {
      pointer.inside = false;
    };

    const onVisibility = (): void => {
      last = 0;
      wake();
    };

    /**
     * THE THEME CAN CHANGE AT ANY MOMENT, so the ramp is re-read whenever the
     * class on <html> changes. The ASCII field beside it does the same thing
     * with the same mechanism, which is why both of them stay correct across
     * fifty palettes without knowing what any of them are.
     */
    const applyTheme = (): void => {
      const next = themeRamp();
      colors = next.colors;
      lightMode = next.lightMode;
      wake();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    const intersection = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      if (visible) {
        last = 0;
        wake();
      }
    });
    intersection.observe(host);
    const themeObserver = new MutationObserver(applyTheme);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    /**
     * The hero stops the loop while it is on screen. The observer is set up
     * here rather than in the component because the grainient knows nothing
     * about the page around it - this is the one place the two meet.
     */
    const hero = document.querySelector<HTMLElement>(".nt-landing");
    const heroObserver = hero
      ? new IntersectionObserver((entries) => {
          heroOnScreen = entries.some((entry) => entry.isIntersecting);
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

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    document.documentElement.addEventListener("pointerleave", onPointerLeave);
    document.addEventListener("visibilitychange", onVisibility);

    applyTheme();
    resize();

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      themeObserver.disconnect();
      heroObserver?.disconnect();
      resizeObserver.disconnect();
      intersection.disconnect();
      cancelAnimationFrame(raf);
      gl.deleteTexture(target);
      gl.deleteFramebuffer(buffer);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(field.program);
      gl.deleteProgram(composite.program);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.remove();
    };
  }, []);

  return <div className="nt-grain" ref={hostRef} aria-hidden="true" />;
}
