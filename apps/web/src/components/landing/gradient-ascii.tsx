"use client";

import { useEffect, useRef } from "react";

/**
 * GRADIENT ASCII FIELD
 * ------------------------------------------------------------
 * Replaces the flowing ASCII engine on the two surfaces that carry the
 * hero copy — the landing page and /login. A WebGL2 four-pass pipeline
 * (gradient field -> glyph atlas -> blurred halo -> composite) drawn
 * as ASCII characters that scramble under the cursor and ripple on click.
 *
 * WHY A DIFFERENT ENGINE, AND NOT THE OLD ONE RETUNED
 * The previous field was canvas2d: one ImageData buffer, one putImageData
 * per frame, glyphs blitted from a pre-rendered atlas. It could only draw
 * what it had — characters on a background colour. This one resolves the
 * field as a real 4-stop gradient in Lab space and lets a shape function
 * decide which part of that ramp each pixel sits at, so the horizon glow
 * and the sun are genuinely different colours rather than the same ramp
 * read at two brightnesses.
 *
 * COLOUR IS NOT DECIDED HERE
 * Every colour comes from the theme the page is currently wearing, read
 * off `.nt-root` the same way the engine it replaces did. Nothing in this
 * file names a colour, so all thirty-three palettes stay correct without
 * a line being edited per theme.
 */

/* ---- pipeline limits (fixed; not theme-tunable) ---- */
const MAX_COLORS = 8;
const MAX_CLICKS = 4;
const MAX_TRAIL = 24;
const CLICK_LIFE = 1.2;
const TRAIL_LIFE = 0.7;
const TRAIL_STEP = 0.015;
const INTRO_SECONDS = 2.4;
const ATLAS_CELL_W = 60;
const ATLAS_CELL_H = 100;
const ATLAS_COLUMNS = 16;
const FONT_SCALE = 0.78;

/**
 * THE LOOK
 * ------------------------------------------------------------
 * Frozen rather than prop-driven: this is one treatment for two screens,
 * and a knob nobody turns is a knob that drifts.
 *
 *   flow 0   + speed 0
 *     Together these make the field STATIC. `flow` is the amplitude of
 *     the domain warp that bends the noise before the shape is evaluated;
 *     `speed` is the clock feeding that warp and the horizon's breathing
 *     arch. Zeroing both removes the drift — which matters here, because
 *     this field sits directly behind body copy that a reader is trying
 *     to parse. A moving background behind moving eyes is a tax.
 *
 *   density 1, glyph alpha 1, gradient 1, glow 1
 *     Full strength on every channel. This is a hero, not an accent: it
 *     fills the viewport and the old ambient opacity of 0.55 would leave
 *     it reading as a nearly blank rectangle, which is exactly the
 *     complaint that got the landing field boosted in the first place.
 *
 *   softness 1
 *     Widens every transition in the shape functions — the horizon rim
 *     and the sun both soften. Hard-edged bands at full opacity fight the
 *     headline sitting on them.
 *
 *   depth 0.5
 *     Half the glyph cells are drawn through a mip LOD, so the field has
 *     a focus plane and the eye is given somewhere to rest.
 *
 *   flicker 0.15, grain 0.15
 *     Both are low on purpose. Flicker jitters the glyph choice per cell;
 *     above ~0.2 it stops reading as texture and starts reading as a
 *     rendering fault, which is the wrong impression for a page whose
 *     product is study notes.
 *
 *   radius 0.1
 *     How far the cursor's scramble reaches, in the shader's normalised
 *     units. Small enough that the pointer disturbs the field it is over
 *     rather than repainting the screen.
 *
 * Everything below is the upstream default, kept: the horizon shape, the
 * `' =+xX0S8#@'` glyph ramp, an 18px cell, pointer scrambling, a wave on
 * click, and the 2.4s intro wipe on first paint.
 */
const SPEC = {
  shape: "horizon",
  characters: " =+xX0S8#@",
  cellSize: 18,
  density: 1,
  glyphOpacity: 1,
  glow: 1,
  depthOfField: 0.5,
  flicker: 0.15,
  softness: 1,
  scale: 1,
  flow: 0,
  speed: 0,
  gradientOpacity: 1,
  grain: 0.15,
  variation: 0,
  scrambleRadius: 0.1,
  mouseInteraction: true,
  clickEffect: "wave",
  intro: true,
} as const;

/* ============================================================================
   SHADERS

   GLSL ES 3.00 throughout, so this needs WebGL2 outright. There is no WebGL1
   path and no canvas2d fallback: the whole effect is the shader pipeline.
   ========================================================================= */

/** One fullscreen triangle, positioned from gl_VertexID. No vertex buffer. */
const VERTEX = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/** Cheap per-cell hash: glyph picking, flicker and grain all want decorrelated
    randomness rather than smooth noise. */
const COMMON = `
float hash12(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
`;

/**
 * PASS 1 — the gradient field.
 * Half resolution, two attachments. Each shape returns two "how far up the
 * colour ramp am I" scalars plus a blend factor, which is what lets the
 * horizon rim and the sun be separately coloured by one function.
 */
const FIELD = `#version 300 es
precision highp float;
precision highp int;
uniform float uAspect;
uniform float uTime;
uniform int uShape;
uniform vec3 uRamp[8];
uniform int uCount;
uniform float uScale;
uniform float uSoftness;
uniform float uFlow;
uniform vec2 uSeed;
uniform vec4 uTrail[24];
uniform float uRadius;
uniform vec4 uClicks[4];
uniform int uClickEffect;
uniform float uIntro;
uniform float uFrame;
in vec2 vUv;
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outAux;
${COMMON}
vec2 hash22(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.103, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.xx + q.yz) * q.zy) * 2.0 - 1.0;
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(hash22(i), f);
  float b = dot(hash22(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float c = dot(hash22(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float d = dot(hash22(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
  return 0.5 + 0.5 * mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

/* The ramp arrives in Lab so it interpolates perceptually. An sRGB lerp
   between a near-black and a saturated crimson passes through mud; Lab
   does not, which is the entire reason for the round trip. */
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

vec3 horizon(vec2 p, float time, out float order) {
  float span = 0.5 * max(uAspect, 1.0);
  float x = p.x / span;
  float arch = -0.17 - 0.2 * x * x + 0.02 * sin(time * 0.6);
  float soft = mix(0.05, 0.22, uSoftness);
  float edge = p.y - arch;
  float rim = 0.38 * smoothstep(-soft, 0.42, edge);
  vec2 sun = vec2(0.08 * sin(time * 0.31) * span, 0.58);
  float spread = length((p - sun) / vec2(0.95 * span, 0.75));
  float sky = mix(0.55, 1.0, smoothstep(0.2, 0.95, spread));
  order = clamp(edge * 1.3, 0.0, 1.0);
  return vec3(rim, sky, smoothstep(0.18, 0.62, edge));
}

vec3 pinch(vec2 p, float time, out float order) {
  float span = 0.5 * max(uAspect, 0.75);
  float x = p.x / span;
  float sway = 0.02 * sin(x * 1.7 + time * 0.55);
  float breathe = 1.0 + 0.06 * sin(time * 0.8);
  float width = (0.13 + 0.22 * x * x) * breathe * mix(0.85, 1.2, uSoftness);
  float y = abs(p.y - sway) / width;
  float t = exp(-pow(y, 2.2)) * (0.42 + 0.58 * exp(-x * x * 1.8));
  order = clamp(abs(p.y - sway) * 2.4 + abs(x) * 0.3, 0.0, 1.0);
  return vec3(t, t, 0.0);
}

vec3 rise(vec2 p, float time, out float order) {
  float wide = max(uAspect, 0.9);
  vec2 center = vec2(0.05 * sin(time * 0.45) * wide, -0.7);
  vec2 radius = vec2(0.82 * wide, 0.64 * (1.0 + 0.04 * sin(time * 0.8)));
  float d = length((p - center) / radius);
  float soft = mix(0.6, 1.15, uSoftness);
  float t = clamp(pow(clamp(1.0 - d, 0.0, 1.0), soft) * 1.35, 0.0, 1.0);
  order = clamp((d - 0.2) * 1.3, 0.0, 1.0);
  return vec3(t, t, 0.0);
}

vec3 eclipse(vec2 p, float time, out float order) {
  float fit = min(1.0, uAspect * 1.25);
  float r = 0.23 * fit * (1.0 + 0.015 * sin(time * 0.9));
  float angle = atan(p.y, p.x);
  float rays = noise(vec2(cos(angle), sin(angle)) * 2.2 + time * 0.08) * 0.8 + 0.6;
  float d = length(p) - r;
  float reach = mix(0.07, 0.15, uSoftness) * rays * fit;
  float t = smoothstep(-0.006, 0.006 + 0.02 * uSoftness, d) * exp(-max(d, 0.0) / reach);
  order = clamp(d * 2.0, 0.0, 1.0);
  return vec3(t, t, 0.0);
}

vec4 tone(float t) {
  float x = smoothstep(0.3, 1.0, t) * float(uCount - 1);
  int index = int(floor(x));
  return vec4(mix(uRamp[index], uRamp[min(index + 1, uCount - 1)], fract(x)), smoothstep(0.0, 0.38, t));
}

void main() {
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
  float time = uTime;
  vec2 q = p / uScale;

  /* The domain warp. At flow 0 this is zero and the field holds still. */
  vec2 warp = vec2(
    noise(q * 1.6 + uSeed + vec2(0.0, time * 0.3)),
    noise(q * 1.6 + uSeed.yx + vec2(4.3, -time * 0.24))
  ) - 0.5;
  q += warp * uFlow * (uShape == 3 ? 0.04 : 0.18);

  float order = 0.0;
  vec3 shape;
  if (uShape == 0) shape = horizon(q, time, order);
  else if (uShape == 1) shape = pinch(q, time, order);
  else if (uShape == 2) shape = rise(q, time, order);
  else shape = eclipse(q, time, order);

  /* 'order' is each shape's distance from its core, so the intro wipes on
     identically through all four whatever their geometry. */
  float reveal = clamp((uIntro * 1.45 - order) / 0.45, 0.0, 1.0);
  reveal = reveal * reveal * (3.0 - 2.0 * reveal);

  /* Pointer trail and click ripples write ONLY the scramble channel. The
     glyph pass reads it and swaps in random characters, so the gradient
     underneath stays smooth instead of tearing. */
  float scramble = 0.0;
  for (int i = 0; i < 24; i++) {
    vec4 point = uTrail[i];
    if (point.z <= 0.0) continue;
    vec2 d = p - point.xy;
    scramble = max(scramble, point.z * exp(-dot(d, d) / (uRadius * uRadius)));
  }
  for (int i = 0; i < 4; i++) {
    vec4 c = uClicks[i];
    if (c.w <= 0.0) continue;
    float d = length(p - c.xy);
    if (uClickEffect == 1) {
      scramble = max(scramble, exp(-pow((d - c.z * 0.75) / 0.06, 2.0)) * c.w);
    } else if (uClickEffect == 2) {
      float size = 0.08 + 0.22 * (1.0 - exp(-c.z * 5.0));
      scramble = max(scramble, (1.0 - smoothstep(size * 0.6, size, d)) * c.w);
    }
  }

  vec2 t = clamp(shape.xy * mix(0.7, 1.0, reveal), 0.0, 1.0);
  vec4 mixed = mix(tone(t.x), tone(t.y), shape.z);
  vec3 color = encode(labToRgb(mixed.rgb));
  float alpha = mixed.a * reveal;

  /* One 8-bit dither step. Without it a gradient this soft bands visibly. */
  float dither = (hash12(gl_FragCoord.xy + uFrame * 13.7) - 0.5) / 255.0;
  outColor = clamp(vec4(color * alpha + dither, alpha + dither), 0.0, 1.0);
  outAux = vec4(reveal, scramble, 0.0, 1.0);
}`;

/**
 * Shared glyph lookup.
 * One cell is one character: sample the field at the cell centre, take its
 * luma, and pick a glyph from the ramp at that density. Included verbatim in
 * both the sharp and the blurred pass, so the halo can never drift out of
 * register with the glyphs it is a halo of.
 */
const GLYPHS = `
uniform sampler2D uField;
uniform sampler2D uAux;
uniform sampler2D uAtlas;
uniform vec2 uResolution;
uniform vec2 uCell;
uniform vec2 uOffset;
uniform vec2 uAtlasGrid;
uniform float uCount;
uniform float uDensity;
uniform float uOpacity;
uniform float uFlicker;
uniform float uDepth;
uniform float uGlyphTime;
uniform float uSeedValue;
uniform float uLight;
${COMMON}
float sampleGlyph(float index, vec2 local, vec2 coord, float soft) {
  float column = mod(index, uAtlasGrid.x);
  float row = floor(index / uAtlasGrid.x);
  vec2 atlasUv = vec2((column + local.x) / uAtlasGrid.x, (row + 1.0 - local.y) / uAtlasGrid.y);
  vec2 continuous = coord / uAtlasGrid;
  float scale = exp2(soft);
  return textureGrad(uAtlas, atlasUv, dFdx(continuous) * scale, dFdy(continuous) * scale).a;
}

vec4 glyphAt(vec2 px) {
  vec2 coord = (px - uOffset) / uCell;
  vec2 cell = floor(coord);
  vec2 local = coord - cell;
  vec2 uv = clamp(((cell + 0.5) * uCell + uOffset) / uResolution, vec2(0.0), vec2(1.0));
  vec4 field = texture(uField, uv);
  vec4 aux = texture(uAux, uv);

  /* Paper mode inverts the field: dark ink on a light page. */
  vec3 visible = uLight > 0.5 ? field.rgb + (1.0 - field.a) : field.rgb;
  float luma = dot(visible, vec3(0.2126, 0.7152, 0.0722));
  float value = uLight > 0.5 ? clamp((1.0 - luma) * 1.5, 0.0, 1.0) : luma;

  float pick = hash12(cell + uSeedValue * 7.31);
  float level = hash12(cell * 1.73 + 4.1 + uSeedValue);
  float tick = floor(uGlyphTime * 9.0 + level * 9.0);
  float wobble = (hash12(cell * 2.31 + tick * 17.7) - 0.5) * uFlicker * 0.4 + (level - 0.5) * 0.1;
  float tone = clamp(pow(value, 0.75) + wobble, 0.0, 1.0);
  float index = floor(tone * (uCount - 1.0) + 0.5);

  /* The scramble channel overrides the glyph with a fresh random one,
     quantised to ~20Hz so it reads as static and not as a strobe. */
  float decode = max(aux.g, 1.0 - aux.r);
  if (decode > 0.02) {
    float frame = floor(uGlyphTime * 20.0);
    if (hash12(cell * 3.7 + frame * 5.3) < decode * 1.25) index = 1.0 + floor(hash12(cell + frame * 1.37) * (uCount - 1.0));
  }

  float present = step(pick, uDensity * mix(1.0, 0.3 + tone * 1.1, 0.55));
  float cutoff = smoothstep(0.03, 0.1, value);

  /* depthOfField blurs a random subset of cells by picking a mip LOD. */
  float focus = step(hash12(cell * 0.71 + 9.2 + uSeedValue), uDepth);
  float coverage = sampleGlyph(index, local, coord, focus * 1.2);

  float alpha = uOpacity * present * cutoff * coverage * mix(1.0, 0.35 + 0.65 * level, 0.55) * (1.0 - focus * 0.5);
  if (uLight < 0.5) {
    vec3 light = field.rgb * 0.55 + vec3(0.03) * field.a;
    return vec4(light * alpha, 0.6 * field.a * alpha);
  }
  vec3 ink = visible * 0.8;
  return vec4(ink * alpha, alpha);
}
`;

/** PASS 2 — the halo, at quarter resolution. Only exists to be blurred. */
const HALO = `#version 300 es
precision highp float;
uniform float uDownscale;
in vec2 vUv;
out vec4 outColor;
${GLYPHS}
void main() {
  outColor = glyphAt(gl_FragCoord.xy * uDownscale);
}`;

/** PASS 3 — separable gaussian, run horizontally then vertically. */
const BLUR = `#version 300 es
precision highp float;
uniform sampler2D uSource;
uniform vec2 uStep;
in vec2 vUv;
out vec4 outColor;
void main() {
  vec4 sum = texture(uSource, vUv) * 0.2270270270;
  sum += texture(uSource, vUv + uStep * 1.3846153846) * 0.3162162162;
  sum += texture(uSource, vUv - uStep * 1.3846153846) * 0.3162162162;
  sum += texture(uSource, vUv + uStep * 3.2307692308) * 0.0702702703;
  sum += texture(uSource, vUv - uStep * 3.2307692308) * 0.0702702703;
  outColor = sum;
}`;

/** PASS 4 — composite, additively. */
const COMPOSITE = `#version 300 es
precision highp float;
uniform sampler2D uHalo;
uniform float uGlow;
uniform float uGradient;
uniform float uGrain;
uniform float uFrame;
in vec2 vUv;
out vec4 outColor;
${GLYPHS}
void main() {
  vec4 base = texture(uField, vUv) * uGradient;
  vec4 glyph = glyphAt(gl_FragCoord.xy);
  vec4 halo = texture(uHalo, vUv) * uGlow;
  vec4 color;
  if (uLight < 0.5) {
    color = base + glyph + halo;
  } else {
    /* Paper: the halo tucks behind the ink rather than over it. */
    color = glyph + base * (1.0 - glyph.a);
    color += halo * 0.6 * (1.0 - color.a);
  }
  float grain = (hash12(gl_FragCoord.xy + uFrame * vec2(17.0, 59.0)) + hash12(gl_FragCoord.xy * 1.31 + uFrame * 7.0) - 1.0) * uGrain;
  float body = clamp(color.a, 0.0, 1.0);
  color.rgb += grain * (0.25 + body) * 0.5;
  color.a = clamp(color.a, 0.0, 1.0);
  /* rgb must never exceed alpha or the glyphs fringe against the page. */
  color.rgb = clamp(color.rgb, 0.0, color.a);
  outColor = color;
}`;

/* ============================================================================
   COLOUR — theme in, ramp out
   ========================================================================= */

const SHAPES: Record<string, number> = { horizon: 0, pinch: 1, rise: 2, eclipse: 3 };
const CLICK_EFFECTS: Record<string, number> = { none: 0, wave: 1, burst: 2 };

/** An sRGB triple -> XYZ, D65. */
const srgbToXyz = (rgb: readonly [number, number, number]): [number, number, number] => [
  0.4122214708 * rgb[0] + 0.5363325363 * rgb[1] + 0.0514459929 * rgb[2],
  0.2119034982 * rgb[0] + 0.6806995451 * rgb[1] + 0.1073969566 * rgb[2],
  0.0883024619 * rgb[0] + 0.2817188376 * rgb[1] + 0.6299787005 * rgb[2],
];

/**
 * XYZ -> the triple the shader's `labToRgb` expects, i.e. the EXACT inverse
 * of that function.
 *
 * This is deliberately not the obvious `toLab`. Uploading toLab() — which is
 * what a straight port does, and what the upstream component does — does not
 * round trip, and silently so. The two matrices are the standard CIE pair,
 * which is written for L in 0..100, while toLab produces 0..1, so every colour
 * is crushed toward black: #8b0000 renders as roughly #420000, and a
 * near-paper #e8e2db as mid-grey. Upstream does not notice because its palette
 * is hand-tuned by eye against the distortion it already contains.
 *
 * That tolerance is not available here. The whole point of deriving the ramp
 * from the theme is that the field is the palette's colour, and if a theme
 * says cream the field has to be cream — not a shade of it that nobody chose.
 * Inverting the shader's own function is what makes it exact rather than
 * approximately right.
 */
const xyzToRamp = (xyz: readonly [number, number, number]): [number, number, number] => {
  const x = Math.cbrt(Math.max(0, xyz[0]));
  const y = Math.cbrt(Math.max(0, xyz[1]));
  const z = Math.cbrt(Math.max(0, xyz[2]));
  return [
    0.2104542553 * x + 0.793617785 * y - 0.0040720468 * z,
    1.9779984951 * x - 2.428592205 * y + 0.4505937099 * z,
    0.0259040371 * x + 0.7827717662 * y - 0.808675766 * z,
  ];
};

/**
 * Mixing happens in cube-root-linear XYZ.
 *
 * That is the same space the shader calls Lab: its matrix is linear, so
 * interpolating before it is identical to interpolating after it — but
 * staying on the XYZ side keeps this file's maths exactly invertible, which
 * the 0..100 scale mismatch above is a good reason to insist on.
 *
 * And the companding is the reason to bother with a non-linear space at all:
 * between a near-black and a saturated crimson, a straight sRGB lerp passes
 * through mud, which is exactly the midpoint of this ramp.
 */
/**
 * HSL, because lightness and saturation have to move INDEPENDENTLY here.
 *
 * Every earlier attempt built this ramp by interpolating two endpoint
 * colours, and that is structurally unable to keep a hue alive: a lerp
 * toward the page background greys the colour out, and a lerp toward the
 * page foreground pinks it out. On the dark theme that produced exactly
 * the wrong thing - a desaturated rose where the palette says maroon.
 *
 * In HSL the hue is simply carried through untouched and only L and S are
 * touched, so "a lighter version of scarlet" stays scarlet instead of
 * decaying into pink.
 */
const rgbToHsl = (rgb: readonly [number, number, number]): [number, number, number] => {
  const max = Math.max(...rgb);
  const min = Math.min(...rgb);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) {
    return [0, 0, l];
  }
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rgb[0]) {
    h = ((rgb[1] - rgb[2]) / d) % 6;
  } else if (max === rgb[1]) {
    h = (rgb[2] - rgb[0]) / d + 2;
  } else {
    h = (rgb[0] - rgb[1]) / d + 4;
  }
  return [((h / 6) % 1 + 1) % 1, s, l];
};

const hslToRgb = (hsl: readonly [number, number, number]): [number, number, number] => {
  const [h, s, l] = hsl;
  if (s === 0) {
    return [l, l, l];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number): number => {
    let u = t;
    if (u < 0) u += 1;
    if (u > 1) u -= 1;
    if (u < 1 / 6) return p + (q - p) * 6 * u;
    if (u < 1 / 2) return q;
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
    return p;
  };
  return [channel(h + 1 / 3), channel(h), channel(h - 1 / 3)];
};

function hexToRgb(hex: string | undefined): [number, number, number] {
  const h = (hex ?? "").replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = Number.parseInt(full, 16);
  if (Number.isNaN(n)) {
    return [255, 255, 255];
  }
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * THE RAMP: FOUR STOPS OF THE THEME'S OWN COLOUR
 * ------------------------------------------------------------
 * Anchored on `--accent-a`, which the palette generator documents as the
 * palette's identity: "they stay exactly as seeded on both branches". That
 * is the one token guaranteed to be neither diluted nor inverted for
 * legibility, which makes it the only defensible candidate for the colour
 * this field is supposed to be.
 *
 * `--ascii-low`/`--ascii-high` were the obvious source, since they are the
 * ASCII field's own two ends, and they are the wrong one. On a dark theme
 * `--ascii-high` is the palette's SECONDARY colour, and on a light theme it
 * is that secondary already mixed 45% toward the foreground — the
 * generator does that on purpose so accents stay legible as ink on paper,
 * which is a different job from being a luminous glow. Reading it and then
 * lightening it further is how the dark theme ended up a desaturated rose
 * instead of the maroon-scarlet its palette actually specifies.
 *
 * FOUR STOPS, DARKEST TO LIGHTEST, HUE CONSTANT
 * The count matches the upstream component's default palette; the ordering
 * is ours, because the upstream four are in no meaningful order and the
 * shader assumes index 0 is the floor of the range and the last index is
 * the highlight.
 *
 * Index 1 IS THE ACCENT, UNTOUCHED — its own hue, its own saturation, its
 * own lightness. The other three are built around it by moving only
 * lightness and saturation downward, so the most saturated colour in the
 * ramp is provably the theme's own and nothing in the ramp can out-chroma
 * it. That is what makes the field read as the theme rather than as a
 * tinted approximation of it.
 *
 * Stops come back already in the shader's space, so no colour is
 * converted on its way to the GPU a second time.
 */
const RAMP_STOPS = 4;

/** Where the theme's own colour sits, dark to light. */
const ACCENT_STOP = 1;

/**
 * Saturation per stop, as a fraction of the accent's own.
 *
 * Index 1 is exactly 1 by definition and everything else is under it, so
 * the most saturated stop is unique and is the accent. The top of the ramp
 * falls away hardest because that end is a highlight, and a highlight at
 * full chroma on a near-white page is a pink smear.
 */
const RAMP_CHROMA = [0.86, 1, 0.82, 0.46] as const;

/*
 * The three tables that define a stop must agree, or the ramp silently
 * grows a tail. `RAMP_CHROMA[stopCount]` being undefined is the failure that
 * matters: `sat * undefined` is NaN, HSL conversion of NaN clamps to 0, and
 * the extra stop ships as pure white with a perfectly plausible-looking
 * highlight — no error, no NaN on screen, and `uCount` quietly stretches the
 * ramp across it. Asserted at module scope so it cannot be reintroduced.
 */
if (RAMP_CHROMA.length !== RAMP_STOPS || ACCENT_STOP !== 1) {
  throw new Error(
    `ramp tables disagree: RAMP_STOPS=${RAMP_STOPS} ` +
      `RAMP_CHROMA.length=${RAMP_CHROMA.length} ACCENT_STOP=${ACCENT_STOP}`,
  );
}

function themeRamp(): {
  stops: [number, number, number][];
  lightMode: boolean;
} {
  const host = document.querySelector<HTMLElement>(".nt-root");
  const cs = getComputedStyle(host ?? document.documentElement);
  const token = (name: string): string => cs.getPropertyValue(name).trim();

  const bg = hexToRgb(token("--bg-0"));
  const accent = hexToRgb(token("--accent-a"));

  const [hue, sat, lum] = rgbToHsl(accent);

  /*
   * HOW BRIGHT THE PAGE IS, rather than looking for a class named "light".
   *
   * There are fifty generated palettes plus a hand-written pair, and they
   * are not all reached by a class called light. Reading --bg-0 and asking
   * how bright it is is the one test that is correct for all of them and
   * needs no registry to stay in sync.
   *
   * It is not cosmetic either: it picks the composite's blend mode.
   * Additive is right for light on black and wrong on paper, where it
   * renders the glow as a white wash and the glyphs as nothing at all.
   */
  const pageLight = 0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2];

  /*
   * Lightness per stop, dark to light, built to exactly RAMP_STOPS entries.
   *
   * Slot 0 is a SCALED version of the accent rather than a fixed near-black.
   * A fixed dark end is invisible on a dark page, which turns the ramp into a
   * disc floating in a void: the horizon shape spends most of its area below
   * the arch, so that is where the bottom two-thirds of the hero goes, and at
   * L=0.05 there is nothing to see. Scaling keeps the hue present right down
   * to the floor, so the sweep reads dark-to-light across the whole field.
   * It also stays ordered without a clamp, since any fraction below 1 of the
   * accent's own lightness is below the accent — including for a palette
   * shipping a very dark primary.
   *
   * Slots 2 and up walk from the accent toward white. The spacing is then
   * forced strictly ascending, because a palette whose accent is already
   * light can otherwise produce two stops at the same lightness and the
   * shader's fract() picks whichever one it lands on.
   */
  const lightness: number[] = [lum * 0.45, lum];
  for (let i = 2; i < RAMP_STOPS; i++) {
    const k = (i - 1) / (RAMP_STOPS - 2);
    lightness.push(lum + (1 - lum) * (0.38 + 0.32 * k));
  }
  for (let i = 2; i < lightness.length; i++) {
    lightness[i] = Math.max(lightness[i]!, lightness[i - 1]! + 0.06);
  }

  const stops = lightness.map((l, i) =>
    xyzToRamp(srgbToXyz(hslToRgb([hue, sat * RAMP_CHROMA[i]!, l]))),
  );

  return { stops, lightMode: pageLight > 0.5 };
}

/**
 * The family the glyphs are rasterised in.
 *
 * `--nt-font-mono` is `var(--font-jetbrains-mono), ui-monospace, ...` and
 * the canvas font shorthand does not resolve nested `var()`, so the token
 * is resolved through a throwaway element and let the cascade do it. Same
 * probe the ASCII field used; it falls back rather than throwing, so it can
 * never be the reason the field is blank.
 */
function resolveMonoFont(): string {
  const probe = document.createElement("span");
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.width = "0";
  probe.style.height = "0";
  probe.style.fontFamily = "var(--nt-font-mono)";
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).fontFamily;
  probe.remove();
  return resolved && resolved.length > 0
    ? resolved
    : "ui-monospace, SFMono-Regular, Menlo, monospace";
}

/* ============================================================================
   GL PLUMBING
   ========================================================================= */

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (shader === null) {
    return null;
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    return shader;
  }
  gl.deleteShader(shader);
  return null;
}

/** Links a program and caches every active uniform location up front — it is a
    synchronous driver query, and this would otherwise run four times a frame. */
function link(
  gl: WebGL2RenderingContext,
  fragmentSource: string,
): { program: WebGLProgram; uniforms: Record<string, WebGLUniformLocation | null> } | null {
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (vertex === null || fragment === null || program === null) {
    return null;
  }
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
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(program, i);
    if (info !== null) {
      uniforms[info.name.replace(/\[0\]$/, "")] = gl.getUniformLocation(program, info.name);
    }
  }
  return { program, uniforms };
}

interface Target {
  textures: WebGLTexture[];
  framebuffer: WebGLFramebuffer;
  width: number;
  height: number;
}

function createTarget(gl: WebGL2RenderingContext, count: number): Target {
  const textures = Array.from({ length: count }, () => {
    const texture = gl.createTexture() as WebGLTexture;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  });
  return { textures, framebuffer: gl.createFramebuffer() as WebGLFramebuffer, width: 0, height: 0 };
}

function sizeTarget(
  gl: WebGL2RenderingContext,
  target: Target,
  width: number,
  height: number,
): void {
  if (target.width === width && target.height === height) {
    return;
  }
  target.width = width;
  target.height = height;
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
  target.textures.forEach((texture, i) => {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0 + i,
      gl.TEXTURE_2D,
      texture,
      0,
    );
  });
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

/**
 * Rasterises the character ramp ONCE into a texture atlas.
 *
 * The per-glyph cost then becomes one texture fetch instead of a
 * glyph-cache walk, which is the difference between this field running
 * every frame and this field running on a good day.
 */
function buildAtlas(
  gl: WebGL2RenderingContext,
  characters: string,
  fontFamily: string,
): { texture: WebGLTexture; count: number; grid: [number, number] } {
  const list = [...new Set([...characters].filter((c) => c !== "\n" && c !== "\r"))];
  if (list.length === 0) {
    list.push(" ");
  }
  const font = `300 ${Math.round(ATLAS_CELL_H * FONT_SCALE)}px ${fontFamily}`;
  const columns = Math.min(ATLAS_COLUMNS, list.length);
  const rows = Math.ceil(list.length / columns);
  const canvas = document.createElement("canvas");
  canvas.width = ATLAS_CELL_W * columns;
  canvas.height = ATLAS_CELL_H * rows;
  const ctx = canvas.getContext("2d");
  if (ctx !== null) {
    ctx.font = font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    list.forEach((char, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      ctx.fillText(
        char,
        column * ATLAS_CELL_W + ATLAS_CELL_W / 2,
        row * ATLAS_CELL_H + ATLAS_CELL_H / 2 + 3,
      );
    });
  }
  const texture = gl.createTexture() as WebGLTexture;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return { texture, count: list.length, grid: [columns, rows] };
}

/* ============================================================================
   COMPONENT
   ========================================================================= */

export interface GradientAsciiProps {
  /** Extra class alongside `.nt-gradient`. */
  readonly className?: string;
}

export default function GradientAscii({
  className,
}: GradientAsciiProps = {}): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return;
    }

    const gl = canvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
    });

    /*
     * No WebGL2, no field — and that is a normal outcome, not an error to
     * throw. Every program here is GLSL ES 3.00 and the effect IS the
     * pipeline, so there is no reduced version worth drawing. The page is
     * already legible without a background: both surfaces mount their own
     * veil over it. Returning quietly leaves a clean page rather than a
     * broken one, and rather than a console full of shader errors on every
     * machine with acceleration disabled.
     */
    if (gl === null) {
      return;
    }

    const field = link(gl, FIELD);
    const halo = link(gl, HALO);
    const blur = link(gl, BLUR);
    const composite = link(gl, COMPOSITE);
    if (field === null || halo === null || blur === null || composite === null) {
      return;
    }

    const vao = gl.createVertexArray();
    const fieldTarget = createTarget(gl, 2);
    const haloA = createTarget(gl, 1);
    const haloB = createTarget(gl, 1);

    const reduced =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const view = { width: 1, height: 1, ratio: 1 };
    const ramp = new Float32Array(MAX_COLORS * 3);
    const clickData = new Float32Array(MAX_CLICKS * 4);
    const clicks: { x: number; y: number; age: number }[] = [];
    const trailData = new Float32Array(MAX_TRAIL * 4);
    const trail: { x: number; y: number; age: number }[] = [];
    const pointer = { x: 0, y: 0, inside: false };

    /**
     * Live settings. Read fresh inside draw(), so the theme observer can
     * mutate `colors` without re-running the effect or rebuilding a thing.
     */
    const settings = {
      ...SPEC,
      stops: [] as [number, number, number][],
      lightMode: false,
      fontFamily: "monospace",
    };

    /** The clamp set, resolved per frame — same guards the source engine applies. */
    const resolved = () => ({
      stops: settings.stops,
      shape: SHAPES[settings.shape] ?? 0,
      characters: settings.characters,
      cellSize: clamp(settings.cellSize, 6, 64),
      density: clamp(settings.density, 0, 1),
      glyphOpacity: clamp(settings.glyphOpacity, 0, 1),
      glow: clamp(settings.glow, 0, 2),
      depthOfField: clamp(settings.depthOfField, 0, 1),
      flicker: clamp(settings.flicker, 0, 1),
      softness: clamp(settings.softness, 0, 1),
      scale: clamp(settings.scale, 0.4, 2.5),
      flow: clamp(settings.flow, 0, 2),
      speed: Math.max(0, settings.speed),
      gradientOpacity: clamp(settings.gradientOpacity, 0, 1),
      grain: clamp(settings.grain, 0, 0.4),
      variation: Math.max(0, settings.variation),
      mouseInteraction: settings.mouseInteraction,
      scrambleRadius: clamp(settings.scrambleRadius, 0.02, 0.4),
      clickEffect: CLICK_EFFECTS[settings.clickEffect] ?? 1,
      intro: settings.intro,
      lightMode: settings.lightMode,
      fontFamily: settings.fontFamily || "monospace",
    });

    let atlas: { texture: WebGLTexture; count: number; grid: [number, number] } | null = null;
    let atlasKey = "";
    let paletteKey = "";
    let time = 0;
    let glyphTime = 0;
    let introClock = settings.intro && !reduced ? 0 : 1;
    let frameSeed = 0;
    let grainClock = 0;
    let raf = 0;
    let last = 0;
    let visible = true;
    let disposed = false;

    const syncAtlas = (): void => {
      const s = resolved();
      const key = `${s.fontFamily}|${s.characters}`;
      if (key === atlasKey && atlas !== null) {
        return;
      }
      atlasKey = key;
      if (atlas !== null) {
        gl.deleteTexture(atlas.texture);
      }
      atlas = buildAtlas(gl, s.characters, s.fontFamily);
      /*
       * The webfont almost always resolves after first paint, which would
       * otherwise bake the fallback face into the atlas permanently. Rebuild
       * once it lands; the key guard drops the result if the user switched
       * theme while the font was in flight.
       */
      document.fonts?.load?.(`300 64px ${s.fontFamily}`, s.characters).then(
        () => {
          if (disposed || atlasKey !== key) {
            return;
          }
          if (atlas !== null) {
            gl.deleteTexture(atlas.texture);
          }
          atlas = buildAtlas(gl, s.characters, s.fontFamily);
          draw();
        },
        () => {},
      );
    };

    /**
     * Push the ramp to the GPU, but only when it actually changed.
     *
     * The stops are already in the shader's own space, so this is a copy
     * rather than a conversion — the theme's colours are what get rendered,
     * not a colour-space approximation of them.
     */
    const syncPalette = (): void => {
      const s = resolved();
      const key = s.stops.map((stop) => stop.join(",")).join(";");
      if (key === paletteKey) {
        return;
      }
      paletteKey = key;
      s.stops.forEach((stop, i) => ramp.set(stop, i * 3));
    };

    const bindGlyphs = (
      program: { program: WebGLProgram; uniforms: Record<string, WebGLUniformLocation | null> },
      width: number,
      height: number,
    ): void => {
      if (atlas === null) {
        return;
      }
      const s = resolved();
      const u = program.uniforms;
      const cellH = s.cellSize * view.ratio;
      const cellW = cellH * (ATLAS_CELL_W / ATLAS_CELL_H);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, fieldTarget.textures[0] as WebGLTexture);
      gl.uniform1i(u.uField, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, fieldTarget.textures[1] as WebGLTexture);
      gl.uniform1i(u.uAux, 1);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, atlas.texture);
      gl.uniform1i(u.uAtlas, 2);
      gl.uniform2f(u.uResolution, width, height);
      gl.uniform2f(u.uCell, cellW, cellH);
      /* Centre the grid when the cell count leaves a remainder, so the field
         stays symmetric rather than drifting to one edge. */
      gl.uniform2f(
        u.uOffset,
        (width - Math.ceil(width / cellW) * cellW) / 2,
        (height - Math.ceil(height / cellH) * cellH) / 2,
      );
      gl.uniform2f(u.uAtlasGrid, atlas.grid[0], atlas.grid[1]);
      gl.uniform1f(u.uCount, atlas.count);
      gl.uniform1f(u.uDensity, s.density);
      gl.uniform1f(u.uOpacity, s.glyphOpacity);
      gl.uniform1f(u.uFlicker, reduced ? 0 : s.flicker);
      gl.uniform1f(u.uDepth, s.depthOfField);
      gl.uniform1f(u.uGlyphTime, glyphTime);
      gl.uniform1f(u.uSeedValue, s.variation);
      gl.uniform1f(u.uLight, s.lightMode ? 1 : 0);
    };

    const draw = (): void => {
      const s = resolved();
      const aspect = view.width / view.height;
      syncAtlas();
      syncPalette();
      gl.bindVertexArray(vao);
      gl.disable(gl.BLEND);

      /* ---- pass 1: field, half res, two attachments ---- */
      gl.bindFramebuffer(gl.FRAMEBUFFER, fieldTarget.framebuffer);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      gl.viewport(0, 0, fieldTarget.width, fieldTarget.height);
      gl.useProgram(field.program);
      const fu = field.uniforms;
      gl.uniform1f(fu.uAspect, aspect);
      gl.uniform1f(fu.uTime, time);
      gl.uniform1i(fu.uShape, s.shape);
      gl.uniform3fv(fu.uRamp, ramp);
      gl.uniform1i(fu.uCount, s.stops.length);
      gl.uniform1f(fu.uScale, s.scale);
      gl.uniform1f(fu.uSoftness, s.softness);
      gl.uniform1f(fu.uFlow, s.flow);
      gl.uniform2f(fu.uSeed, s.variation * 3.17, s.variation * 1.91);
      gl.uniform4fv(fu.uTrail, trailData);
      gl.uniform1f(fu.uRadius, s.scrambleRadius);
      gl.uniform4fv(fu.uClicks, clickData);
      gl.uniform1i(fu.uClickEffect, s.clickEffect);
      gl.uniform1f(fu.uIntro, introClock);
      gl.uniform1f(fu.uFrame, frameSeed);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      /* ---- passes 2 + 3: halo at quarter res, blurred separably ---- */
      const glowing = s.glow > 0.001;
      if (glowing) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, haloA.framebuffer);
        gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
        gl.viewport(0, 0, haloA.width, haloA.height);
        gl.useProgram(halo.program);
        bindGlyphs(halo, canvas.width, canvas.height);
        gl.uniform1f(halo.uniforms.uDownscale, canvas.width / haloA.width);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        gl.useProgram(blur.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.uniform1i(blur.uniforms.uSource, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, haloB.framebuffer);
        gl.bindTexture(gl.TEXTURE_2D, haloA.textures[0] as WebGLTexture);
        gl.uniform2f(blur.uniforms.uStep, 1 / haloA.width, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindFramebuffer(gl.FRAMEBUFFER, haloA.framebuffer);
        gl.bindTexture(gl.TEXTURE_2D, haloB.textures[0] as WebGLTexture);
        gl.uniform2f(blur.uniforms.uStep, 0, 1 / haloB.height);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }

      /* ---- pass 4: composite to the canvas ---- */
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(composite.program);
      bindGlyphs(composite, canvas.width, canvas.height);
      const cu = composite.uniforms;
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, haloA.textures[0] as WebGLTexture);
      gl.uniform1i(cu.uHalo, 3);
      gl.uniform1f(cu.uGlow, glowing ? s.glow : 0);
      gl.uniform1f(cu.uGradient, s.gradientOpacity);
      gl.uniform1f(cu.uGrain, s.grain);
      gl.uniform1f(cu.uFrame, frameSeed);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    /* Age the transients and pack them for the GPU. */
    const updateInput = (dt: number): void => {
      trail.forEach((point) => {
        point.age += dt;
      });
      while (trail.length > 0 && trail[trail.length - 1]!.age > TRAIL_LIFE) {
        trail.pop();
      }
      for (let i = 0; i < MAX_TRAIL; i++) {
        const point = trail[i];
        if (point === undefined) {
          trailData[i * 4 + 2] = 0;
          continue;
        }
        const k = 1 - point.age / TRAIL_LIFE;
        /* Squared falloff: linear leaves a visible hard tail behind the cursor. */
        trailData.set([point.x, point.y, k * k, 0], i * 4);
      }

      clicks.forEach((click) => {
        click.age += dt;
      });
      while (clicks.length > 0 && clicks[clicks.length - 1]!.age > CLICK_LIFE) {
        clicks.pop();
      }
      for (let i = 0; i < MAX_CLICKS; i++) {
        const click = clicks[i];
        if (click === undefined) {
          clickData[i * 4 + 3] = 0;
          continue;
        }
        const k = click.age / CLICK_LIFE;
        /* Fast attack, quadratic decay. */
        const envelope = Math.min(1, click.age / 0.08) * (1 - k) * (1 - k);
        clickData.set([click.x, click.y, click.age, envelope], i * 4);
      }
    };

    const frame = (now: number): void => {
      raf = 0;
      if (disposed || !visible || document.hidden) {
        return;
      }
      const s = resolved();
      const dt = last > 0 ? clamp((now - last) / 1000, 0.001, 0.05) : 1 / 60;
      last = now;
      /*
       * At speed 0 the shape clock stays at zero, so the field holds its
       * pose. The glyph clock still advances, but at a 0.15 floor rather
       * than the configured speed — which is what keeps the low flicker
       * alive as texture instead of leaving it entirely dead.
       */
      if (!reduced) {
        time += dt * s.speed * 0.5;
        glyphTime += dt * Math.max(s.speed, 0.15);
      }
      if (introClock < 1) {
        introClock = Math.min(1, introClock + dt / INTRO_SECONDS);
      }
      grainClock += dt;
      /*
       * Grain resamples at 24Hz, not per frame. Faster than that and it
       * stops being film grain and becomes video noise.
       */
      if (!reduced && grainClock > 1 / 24) {
        grainClock = 0;
        frameSeed = (frameSeed + 1) % 97;
      }
      updateInput(dt);
      draw();
      /*
       * The loop idles out entirely under reduced motion once the intro and
       * every transient have expired. Any pointer movement, resize or theme
       * change calls wake(), which brings it straight back for one frame.
       */
      const busy =
        !reduced || introClock < 1 || clicks.length > 0 || trail.length > 0;
      if (busy) {
        raf = window.requestAnimationFrame(frame);
      } else {
        last = 0;
      }
    };

    function wake(): void {
      if (!raf && !disposed && visible && !document.hidden) {
        raf = window.requestAnimationFrame(frame);
      }
    }

    const resize = (): void => {
      view.width = Math.max(1, canvas.clientWidth);
      view.height = Math.max(1, canvas.clientHeight);
      /*
       * Capped at 2 device pixels per CSS pixel. This is a full-viewport
       * layer behind a text hero, and the glyph pass plus the bloom chain
       * scale with area — past 2 the cost quadruples for a difference
       * nobody can see on a layer that is itself mostly soft gradient.
       */
      view.ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(view.width * view.ratio));
      canvas.height = Math.max(1, Math.round(view.height * view.ratio));
      sizeTarget(
        gl,
        fieldTarget,
        Math.max(1, Math.round(canvas.width / 2)),
        Math.max(1, Math.round(canvas.height / 2)),
      );
      const haloW = Math.max(1, Math.round(canvas.width / 4));
      const haloH = Math.max(1, Math.round(canvas.height / 4));
      sizeTarget(gl, haloA, haloW, haloH);
      sizeTarget(gl, haloB, haloW, haloH);
      draw();
      wake();
    };

    /*
     * Pointer coordinates arrive in the shader's space: x scaled by aspect,
     * y flipped because GL's origin is bottom-left.
     */
    const locate = (event: PointerEvent): void => {
      const rect = canvas.getBoundingClientRect();
      const x = (event.clientX - rect.left) / Math.max(1, rect.width);
      const y = 1 - (event.clientY - rect.top) / Math.max(1, rect.height);
      const aspect = rect.width / Math.max(1, rect.height);
      pointer.inside = x >= 0 && x <= 1 && y >= 0 && y <= 1;
      pointer.x = (x - 0.5) * aspect;
      pointer.y = y - 0.5;
    };

    const onPointerMove = (event: PointerEvent): void => {
      locate(event);
      const s = resolved();
      if (!pointer.inside || !s.mouseInteraction || reduced) {
        return;
      }
      const head = trail[0];
      const gap =
        head === undefined ? Infinity : Math.hypot(pointer.x - head.x, pointer.y - head.y);
      if (gap < TRAIL_STEP) {
        return;
      }
      /*
       * A fast flick outruns TRAIL_STEP and would leave a dotted trail, so
       * the skipped cells are backfilled. Six is the cap: past that a jump
       * is a teleport, not a flick, and interpolating it smears the trail
       * across the whole field.
       */
      if (head !== undefined && head.age < 0.1) {
        const steps = Math.min(6, Math.floor(gap / (TRAIL_STEP * 2)));
        for (let i = 1; i <= steps; i++) {
          const k = i / (steps + 1);
          trail.unshift({
            x: head.x + (pointer.x - head.x) * k,
            y: head.y + (pointer.y - head.y) * k,
            age: 0,
          });
        }
      }
      trail.unshift({ x: pointer.x, y: pointer.y, age: 0 });
      trail.length = Math.min(trail.length, MAX_TRAIL);
      wake();
    };

    const onPointerDown = (event: PointerEvent): void => {
      locate(event);
      const s = resolved();
      if (!pointer.inside || !s.clickEffect || reduced) {
        return;
      }
      clicks.unshift({ x: pointer.x, y: pointer.y, age: 0 });
      if (clicks.length > MAX_CLICKS) {
        clicks.pop();
      }
      wake();
    };

    const onVisibility = (): void => {
      last = 0;
      wake();
    };

    /**
     * THEME CHANGES
     * The palette is resolved on the class attribute of <html>, which is what
     * the theme provider swaps — watching it is what lets the field repaint
     * in the new palette instead of holding the colours it booted with.
     *
     * Left un-debounced on purpose: it re-derives four hex stops from four
     * token reads, which is far too cheap to be worth a timer, and the
     * alternative is a frame rendered in the old palette.
     */
    const applyTheme = (): void => {
      const next = themeRamp();
      settings.stops = next.stops;
      settings.lightMode = next.lightMode;
      wake();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    const intersection = new IntersectionObserver(
      (entries) => {
        visible = entries.some((entry) => entry.isIntersecting);
        if (visible) {
          last = 0;
          wake();
        }
      },
      { threshold: 0 },
    );
    intersection.observe(canvas);
    const themeObserver = new MutationObserver(applyTheme);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);

    /*
     * Order matters: the font and the palette are resolved BEFORE the first
     * resize, because resize() draws immediately and drawing with an empty
     * ramp would mean a frame of black before the theme arrives.
     */
    settings.fontFamily = resolveMonoFont();
    applyTheme();
    resize();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      intersection.disconnect();
      themeObserver.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("visibilitychange", onVisibility);
      [fieldTarget, haloA, haloB].forEach((target) => {
        target.textures.forEach((texture) => {
          gl.deleteTexture(texture);
        });
        gl.deleteFramebuffer(target.framebuffer);
      });
      if (atlas !== null) {
        gl.deleteTexture(atlas.texture);
      }
      gl.deleteVertexArray(vao);
      [field, halo, blur, composite].forEach((program) => {
        gl.deleteProgram(program.program);
      });
      /*
       * Deliberately NOT calling WEBGL_lose_context.loseContext() here.
       *
       * It looks like tidiness and it is a trap. A canvas keeps returning
       * the SAME context object from getContext for its whole life, so if
       * this component ever mounts twice — StrictMode's double-invoke in
       * dev, or a remount on navigation — the second mount is handed a
       * context that was already killed by the first mount's cleanup. Every
       * call on it then silently no-ops, the canvas stays fully transparent,
       * and there is no error anywhere to explain it.
       *
       * Everything created above is deleted explicitly, which is the whole
       * of the real cleanup; the context itself dies with its canvas.
       */
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className === undefined ? "nt-gradient" : `nt-gradient ${className}`}
    />
  );
}