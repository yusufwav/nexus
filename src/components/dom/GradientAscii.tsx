'use dom';

import { useEffect, useRef } from "react";

/**
 * GRADIENT ASCII FIELD — the DOM COMPONENT
 * ------------------------------------------------------------
 * The web app's landing field, brought to the phone.
 *
 * A WebGL2 four-pass pipeline (gradient field -> glyph atlas -> blurred
 * halo -> composite) drawn as ASCII characters, in a DOM component so
 * that the WebGL pipeline is the one that already exists rather than a
 * reimplementation of it in a different graphics API.
 *
 * PORTED FROM THE WEB APP
 * ------------------------------------------------------------
 * `apps/web/src/components/landing/gradient-ascii.tsx` in the web repo,
 * unchanged except for the four things below. The shaders are the web
 * app's, byte for byte, because a shader that has been looked at is
 * worth more than a shader that has been rewritten.
 *
 *   1. THE SHAPE IS `rise`, not `horizon`. The field comes UP FROM THE
 *      BOTTOM: the glow's core sits below the frame and the field spreads
 *      upward out of it, and the intro wipe reveals it from that core.
 *   2. THE COLOURS COME IN AS PROPS. The web app reads them off the
 *      page's CSS custom properties; there are no CSS custom properties
 *      here, so the active palette's own tokens are handed across the
 *      bridge and the ramp is derived from exactly the same maths.
 *   3. THERE IS NO POINTER. This is a background behind every control on
 *      the screen, so there is nothing under the reader's thumb to
 *      scramble and nothing to click.
 *   4. THE GLYPHS ARE SET IN THE PLATFORM'S OWN MONOSPACE. The app's
 *      JetBrains Mono is a native font, and a native font is not a font
 *      the WebView can rasterise. The ramp is ' =+xX0S8#@', which every
 *      monospace face on both platforms has.
 *
 * COLOUR IS NOT DECIDED HERE
 * Every colour comes from the palette the app is currently wearing, which
 * arrives as two props. Nothing in this file names a colour, so all
 * fifty-two palettes stay correct without a line being edited per theme.
 */

/* ---- pipeline limits (fixed; not theme-tunable) ---- */
const MAX_COLORS = 8;
const MAX_CLICKS = 4;
const MAX_TRAIL = 24;
const CLICK_LIFE = 1.2;
const TRAIL_LIFE = 0.7;
const TRAIL_STEP = 0.015;
const INTRO_SECONDS = 2.4;
/** How long the field takes to reach a new strength. */
const STRENGTH_SECONDS = 0.75;
/** How long the field takes to come BACK from a fade. */
const FADE_IN_SECONDS = 0.8;
/** How often the field is drawn. Half of sixty, and the motion is the same. */
const FRAME_MS = 1000 / 30;
const ATLAS_CELL_W = 60;
const ATLAS_CELL_H = 100;
const ATLAS_COLUMNS = 16;
const FONT_SCALE = 0.78;

/**
 * THE LOOK
 * ------------------------------------------------------------
 * These are the REFERENCE engine's own numbers — read off the
 * reference's control panel, not guessed at — with four changes:
 * the pointer is off (this is a background), the grain is off (the
 * reference's own panel was already at zero), the colours are the
 * app's palette rather than a fixed set of four, and the shape is
 * `rise` rather than `horizon`.
 *
 *   flow 1.8   + speed 1
 *     The field is ALIVE. `flow` is the amplitude of the domain warp
 *     that bends the noise before the shape is evaluated; `speed` is
 *     the clock feeding that warp and the shape's own breathing. At
 *     zero they are both zero and the field is a photograph: the
 *     characters never change, the glow never breathes, and a
 *     background that is supposed to be a field reads as a texture on
 *     the glass.
 *
 *     The reference's own numbers are 0.5 and 1. They are turned up
 *     because the reference's field is a four-colour ramp, and a
 *     character that changes COLOUR is a change you see at a glance;
 *     this field is one colour, so the only movement left in it is
 *     the characters themselves and the shape they sit in, and that
 *     needs more of it to read.
 *
 *   density 0.8, glyph alpha 0.85, gradient 0.9
 *     The reference's numbers, and they are what make the field read
 *     as a FIELD rather than as a wash: enough cells carry a glyph,
 *     and each glyph is bright enough to be a character.
 *
 *   glow 0.2
 *     The bloom behind the characters is a hint, not a fog. At the
 *     reference's 1 the halo swallowed the characters and the field
 *     looked like a coloured cloud with a texture in it.
 *
 *   depth 0
 *     No mip blur on any cell, so every character is crisp. The app
 *     had half of them blurred, which is what made the field look
 *     soft and mushy next to the reference's.
 *
 *   flicker 0.2
 *     The characters change as the field breathes, and this is how
 *     much they change.
 *
 *   variation 0.5
 *     How far the field's own noise and its glyph picking are thrown
 *     from the grid they would sit on without it. It is a static
 *     offset, not a movement.
 *
 *   grain 0
 *     No film grain. The reference's own panel reads zero, and the
 *     grain was resampling at 24Hz — a shimmer over the whole screen
 *     that read as a fault rather than as a texture.
 *
 *   softness 0.5
 *     How sharply the shape's edge falls off. The reference's value.
 *
 * The glyph ramp is the reference's too: `' =+xX0S8#@'`, at an 18px
 * cell, with the 2.4s intro wipe on first paint.
 */
const SPEC = {
  /*
   * RISE.
   *
   * The glow's core sits BELOW the frame — at y = -0.67 — and the field
   * spreads upward out of it, so the field comes up from the bottom. The
   * intro wipe reveals it outward from that same core, which is what
   * makes the first two seconds of the screen read as the field rising.
   *
   * The core's y and the radius are in the shader's own units, which are
   * the screen's height, so the field's extent is a proportion of
   * whatever screen it is on: this one reaches a third of the way down
   * from the top.
   */
  shape: "rise",
  characters: " =+xX0S8#@",
  cellSize: 18,
  density: 0.6,
  glyphOpacity: 0.85,
  glow: 2,
  depthOfField: 0,
  flicker: 0.2,
  softness: 0.5,
  scale: 1.2,
  flow: 1.8,
  speed: 0.5,
  gradientOpacity: 0.9,
  grain: 0,
  variation: 2,
  scrambleRadius: 0.1,
  /*
   * THERE IS NO POINTER HERE.
   *
   * This field is a BACKGROUND: it sits behind every control on the
   * screen, so there is nothing under the reader's thumb to scramble and
   * nothing to click. The upstream default is a live pointer scramble and
   * a wave on click, and both of them cost a uniform update and a buffer
   * upload on every mouse move to animate something nobody can reach.
   */
  mouseInteraction: false,
  clickEffect: "none",
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
  vec2 center = vec2(0.07 * sin(time * 1.1) * wide, -0.67);
  vec2 radius = vec2(0.86 * wide, 0.95 * (1.0 + 0.05 * sin(time * 1.6)));
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
  return vec4(mix(uRamp[index], uRamp[min(index + 1, uCount - 1)], fract(x)), smoothstep(0.0, 0.9, t));
}

void main() {
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
  float time = uTime;
  vec2 q = p / uScale;

  /* The domain warp. At flow 0 this is zero and the field holds still. */
  vec2 warp = vec2(
    noise(q * 1.6 + uSeed + vec2(0.0, time * 0.6)),
    noise(q * 1.6 + uSeed.yx + vec2(4.3, -time * 0.45))
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

  /*
   * Paper mode composites the field over white to get the colour the eye
   * actually sees there: uField stores colour PREMULTIPLIED by the shape's own
   * alpha, so adding (1 - field.a) puts it back on the page.
   */
  vec3 visible = uLight > 0.5 ? field.rgb + (1.0 - field.a) : field.rgb;
  float luma = dot(visible, vec3(0.2126, 0.7152, 0.0722));

  /*
   * HOW BIG A CHARACTER IS. The ramp " =+xX0S8#@" is ordered by how much ink
   * each character carries, so the size of a glyph reads out how much field is
   * behind it. Two readings of one question, and they are mirror images:
   *
   *   on black, the field IS light, so the answer is its luma;
   *   on paper, the field is ink on white, so the answer is how far BELOW white
   *   it falls.
   *
   * 1 - luma measures exactly that, and it already spans 0 to 1 on its own: 0
   * where the shape has faded and the page is bare paper, 0.93 for the base
   * palette's #8b0000.
   *
   * THE 1.5 GAIN THAT WAS HERE IS GONE, and that is the whole fix. The ramp's
   * four stops are the accent at four lightnesses, whose lumas run 0.06, 0.53,
   * 0.31, 0.12. Scaled by 1.5, every stop below luma 0.333 clamps to 1.0 -
   * that is THREE OF THE FOUR - so most of the field was pinned to the single
   * largest character and the ramp had a plateau instead of a gradient. That
   * is why the size falloff read as absent on light pages: the top of the
   * page was flat at maximum and only the very bottom moved.
   *
   * Measured, not reasoned. Encoding the chosen glyph index into the red
   * channel and screenshotting it gives the mean index per band. Before, the
   * top third averaged 8.55 with a peak of 8.91 on a 0-9 scale. After, it
   * averages 7.31 and descends 7.9 -> 5.6 -> 3.0 -> 0.18 down the page, which
   * is the shape dark mode already had.
   *
   * The dark branch is untouched and stays plain luma. It never needed a gain:
   * on black the field's luma already runs 0.06 to 0.53 across the ramp, and
   * boosting that would only clip the top end the same way.
   */
  float value = uLight > 0.5 ? clamp(1.0 - luma, 0.0, 1.0) : luma;

  float pick = hash12(cell + uSeedValue * 7.31);
  float level = hash12(cell * 1.73 + 4.1 + uSeedValue);
  float tick = floor(uGlyphTime * 14.0 + level * 14.0);
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

  /*
   * THE GLYPHS ARE WHITE ON A DARK PAGE, AND INK ON A LIGHT ONE.
   *
   * Only the COLOUR is decided here. Everything that decides which
   * character a cell draws, how dense it is, how bright and how large is
   * computed above out of value and level, and none of that is touched -
   * so the field's structure, its depth-of-field, its flicker and its
   * scramble are all exactly what they were.
   *
   * ON BLACK the letters are white, and the field's own colour is the
   * wash behind them: the gradient is the light on the page and the
   * letters are the shape it takes.
   *
   * ON PAPER the letters are INK - the field's own colour composited
   * over white, which is what the visible colour already is - because white
   * letters on near-white paper have almost nothing to contrast
   * against. The web app made the letters white in BOTH modes, which
   * left the light palettes with a field that could not be seen at all;
   * this is the reference engine's branch, which is the one that works
   * on a page the reader can read.
   *
   * THE GRADIENT IS NOT TOUCHED. The wash behind the letters is the
   * uField texture, whose colour is the ramp, and the ramp is still
   * derived from the theme in themeRamp() further down this file.
   *
   * The ALPHA still branches, because it always did and the reason
   * predates this: on a dark page a glyph is dimmed by the gradient's
   * own opacity, so a letter thins out where the wash behind it thins
   * out, and on paper it is not. That asymmetry is what makes the two
   * pages read as the same field at two exposures.
   */
  if (uLight < 0.5) {
    float outAlpha = 0.6 * field.a * alpha;
    return vec4(vec3(1.0) * outAlpha, outAlpha);
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
uniform float uIntensity;
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

  /*
   * HOW MUCH OF THE FIELD THE READER SEES.
   *
   * One scale on the whole picture, applied last, so the wash, the glyphs
   * and the halo all come down together and the field at sixty per cent is
   * the same field at sixty per cent — not the field at a hundred per cent
   * under a grey veil, which is a different picture.
   *
   * It is applied HERE, in the composite, rather than as the opacity of the
   * view that holds this WebView, because a WebView is drawn into its own
   * layer on Android and does NOT take the alpha of the view it sits in.
   * A fade done on the native side is a fade that does not happen.
   *
   * Both the colour and the alpha are scaled, so the output stays
   * premultiplied: rgb never exceeds a.
   */
  color.rgb *= uIntensity;
  color.a *= uIntensity;

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
 * THE RAMP: ONE COLOUR, IN FOUR STOPS
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
 * ONE COLOUR, NOT FOUR
 * The ramp used to be four stops of the accent at four lightnesses, which
 * meant the field changed colour as it climbed: a dark red at the floor
 * and a pale tint at the top, so the eye read a wash of two colours
 * instead of a glow. Every stop is now the SAME colour — the accent at its
 * own saturation, which is the most saturated colour the palette has.
 *
 * What carries the field from the bottom of the screen to the top is
 * therefore ALPHA, not hue: the shape's own density. A glow of one colour
 * is a glow; a glow of four is a gradient of several, and the palette
 * asked for one.
 *
 * Stops come back already in the shader's space, so no colour is converted on
 * its way to the GPU a second time.
 */
const RAMP_STOPS = 4;

/**
 * THE RAMP, FROM THE APP'S OWN TOKENS.
 *
 * The web app reads `--bg-0` and `--accent-a` off the page's own CSS
 * custom properties. There are no CSS custom properties here — the
 * palette lives in JavaScript and is handed across the bridge as two
 * hex strings — so the same two colours arrive as arguments and the
 * same maths is done on them.
 */
function themeRamp(
  pageHex: string,
  accentHex: string,
): {
  stops: [number, number, number][];
  lightMode: boolean;
} {
  const bg = hexToRgb(pageHex);
  const accent = hexToRgb(accentHex);

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
   * ONE COLOUR.
   *
   * Every stop of the ramp is the palette's own accent, at its own
   * saturation, unaltered: the most saturated colour the palette has, used
   * for the whole field.
   *
   * The ramp used to be four lightnesses of the accent, which meant the
   * field changed colour as it went up — a dark red at the floor and a
   * pale tint at the top, so the eye read a wash of two colours rather
   * than a glow. One colour with a ramp of ALPHA is the same picture
   * without the second colour in it: the shape's own density is what
   * carries it from the bottom of the screen to the top, and the hue is
   * the palette's own all the way.
   *
   * The accent is converted to the shader's space once, here, and every
   * stop is that one value.
   */
  const one = xyzToRamp(srgbToXyz(hslToRgb([hue, sat, lum])));
  const stops: [number, number, number][] = [];
  for (let i = 0; i < RAMP_STOPS; i++) {
    stops.push([one[0], one[1], one[2]]);
  }

  return { stops, lightMode: pageLight > 0.5 };
}

/**
 * The family the glyphs are rasterised in.
 *
 * `--nt-font-mono` is `var(--font-jetbrains-mono), ui-monospace, ...` and
 * the canvas font shorthand does not resolve nested `var()`, so the token
 * is resolved through a throwaway element and let the cascade do it. Same
 * THE PHONE HAS NO SUCH TOKEN. The app's JetBrains Mono is a NATIVE font,
 * and a native font is not a font this WebView can rasterise — it is not
 * installed in the WebView's own environment, and there is no URL to
 * load it from. So the glyphs are set in the platform's own monospace,
 * which is what the web app falls back to anyway. The ramp is ' =+xX0S8#@'
 * and every one of those is in every monospace face on both platforms.
 * probe the ASCII field used; it falls back rather than throwing, so it can
 * never be the reason the field is blank.
 */
const MONO_FONT = "ui-monospace, SFMono-Regular, Menlo, Roboto Mono, monospace";

function resolveMonoFont(): string {
  return MONO_FONT;
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
  /**
   * The page's own background colour, as the palette has it.
   *
   * The page colour is the field's floor: it is what the field is drawn
   * ON, and it is what decides whether the composite blends additively
   * (right on black) or normally (right on paper).
   */
  readonly bg: string;
  /** The palette's accent — the colour the field is made of. */
  readonly accent: string;
  /**
   * How much of the field the reader sees.
   *
   * This is the composite's own scale, not a veil over the top: the field
   * is drawn at full strength and then brought back to the screen's share
   * by the shader, so the whole picture comes down together rather than
   * the glyphs thinning out under a wash that is still at full strength.
   */
  readonly intensity?: number;
  /**
   * Fade the field away.
   *
   * The fade happens in here, in the WebView, over `dimDuration` — not on
   * the native view that holds the WebView, because a WebView is drawn
   * into its own layer and does not take the alpha of the view it is in.
   */
  readonly dim?: boolean;
  /** How long the fade takes. Slow on purpose. */
  readonly dimDuration?: number;
  /** The reader has asked for less movement. */
  readonly reduced?: boolean;
  /** The DOM component's own props — the WebView underneath it. */
  readonly dom?: import("expo/dom").DOMProps;
}

export default function GradientAscii({
  bg,
  accent,
  intensity = 0.6,
  dim = false,
  dimDuration = 2600,
  reduced: reducedProp = false,
}: GradientAsciiProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  /**
   * The live settings, and the function that repaints them.
   *
   * They live in a ref because the effect that owns the GL context has to
   * be reachable from outside it, and it must not re-run when they
   * change: the context, the programs and the atlas all belong to one
   * mount, and a second mount would be handed a context that the first
   * one's cleanup already released.
   */
  const liveRef = useRef<{
    readonly repaint: () => void;
    readonly setDim: (value: boolean) => void;
  } | null>(null);

  /*
   * THE PROPS, AS THE RUNNING FIELD SEES THEM.
   *
   * The effect that owns the GL context must not re-run when the palette
   * changes — a second mount would be handed a context the first one's
   * cleanup already released — so the effect cannot simply close over the
   * props it was mounted with. It would then be repainting the palette it
   * BOOTED with, forever, and the reader's theme change would be a
   * change of the page and not of the field.
   *
   * So the props are kept in a ref, and the repaint reads them from there.
   * The ref is the current truth; the closure is not.
   *
   * The ref is written in an effect rather than during the render, because
   * a ref written during a render is a value the next render may not see
   * — and, more to the point, React does not promise that a render which
   * writes a ref is followed by a commit. The effect below is declared
   * FIRST on purpose: the repaint effect runs after it, so the repaint
   * always reads props that have already been written.
   */
  const propsRef = useRef({ bg, accent, intensity, dim, dimDuration, reduced: reducedProp });
  useEffect(() => {
    propsRef.current = { bg, accent, intensity, dim, dimDuration, reduced: reducedProp };
  }, [bg, accent, intensity, dim, dimDuration, reducedProp]);

  /*
   * THE PALETTE, WHEN IT CHANGES.
   *
   * The web app watched the class attribute on the root element, because
   * that is what its theme provider swaps. Here the palette arrives as
   * props over the bridge, so a change is a change of props — and the
   * ramp is re-derived from the new two colours and the field repainted
   * in them, rather than holding the colours it booted with.
   */
  useEffect(() => {
    liveRef.current?.repaint();
  }, [bg, accent, intensity, reducedProp]);

  /*
   * THE FADE, WHEN IT IS ASKED FOR.
   *
   * A boolean crosses the bridge and the fade is run in here, by the same
   * clock that draws the field, so it is the same picture going away
   * rather than the picture being scaled by something outside it.
   */
  const dimRef = useRef(dim);
  useEffect(() => {
    if (dimRef.current === dim) {
      return;
    }
    dimRef.current = dim;
    liveRef.current?.setDim(dim);
  }, [dim]);

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

    /*
     * REDUCED MOTION IS THE READER'S SETTING, NOT THE PLATFORM'S.
     *
     * The web app asked the platform, because a browser has an
     * operating-system setting for it. The app has its own switch, in the
     * You tab, and it is that one which is passed in.
     */
    /*
     * `let`, not `const`, because the reader can turn reduced motion on
     * while the field is running and the change has to reach the running
     * pipeline — see `applyTheme`, which is the one place that writes it.
     */
    let reduced = reducedProp;
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
      /*
       * THE STRENGTH THE READER SEES.
       *
       * The composite's own scale, so the wash, the glyphs and the halo all
       * come down together. It is the prop, and it lives here so that the
       * per-frame `resolved()` reads it the same way it reads everything
       * else.
       */
      intensity: propsRef.current.intensity,
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
      intensity: clamp(settings.intensity, 0, 1),
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
    let lastDraw = 0;
    let visible = true;
    let disposed = false;

    /*
     * THE FADE.
     *
     * `dimTarget` is where the fade is going and `dimAmount` is where it
     * is; the second one walks towards the first one at 1/dimDuration per
     * second, which is what makes the fade slow rather than instant.
     *
     * A screen that mounts with the field already meant to be gone starts
     * with the two of them equal: there is nothing to fade from, because
     * there was never a field on the screen.
     */
    let dimTarget = propsRef.current.dim ? 1 : 0;
    let dimAmount = dimTarget;
    let dimDuration = Math.max(1, propsRef.current.dimDuration);

    /*
     * THE STRENGTH, AND HOW IT GETS THERE.
     *
     * There is one field for the whole app, and a screen asks for a
     * strength rather than owning a field, so the strength CHANGES when
     * the reader moves between screens. It walks to its new value over
     * three quarters of a second, which is long enough to read as a
     * change and short enough not to be a wait.
     */
    let intensityTarget = propsRef.current.intensity;
    let intensityAmount = intensityTarget;

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
      gl.uniform1f(cu.uIntensity, s.intensity * (1 - dimAmount));
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
      /*
       * THE FADE, WALKED OUT SLOWLY.
       *
       * Reduced motion is not a slower fade. It is no fade: the field is
       * either there or it is not, and the reader asked for the difference
       * to be instantaneous.
       *
       * The fade OUT is the slow one, because that is the one the reader
       * asked for: a conversation starts and the field leaves. The fade
       * BACK is quicker, because a background that takes two and a half
       * seconds to come back is a background that is late.
       */
      if (reduced) {
        dimAmount = dimTarget;
        intensityAmount = intensityTarget;
      } else {
        if (dimAmount < dimTarget) {
          dimAmount = Math.min(dimTarget, dimAmount + dt / (dimDuration / 1000));
        } else if (dimAmount > dimTarget) {
          dimAmount = Math.max(dimTarget, dimAmount - dt / (FADE_IN_SECONDS));
        }
        if (intensityAmount !== intensityTarget) {
          const step = dt / STRENGTH_SECONDS;
          const gap = intensityTarget - intensityAmount;
          intensityAmount += Math.sign(gap) * Math.min(step, Math.abs(gap));
        }
      }
      settings.intensity = intensityAmount;
      grainClock += dt;
      /*
       * Grain resamples at 24Hz, not per frame. Faster than that and it
       * stops being film grain and becomes video noise.
       */
      if (!reduced && grainClock > 1 / 24) {
        grainClock = 0;
        frameSeed = (frameSeed + 1) % 97;
      }
      /*
       * THIRTY FRAMES A SECOND, NOT SIXTY.
       *
       * The field is always animating now, and a full-screen WebGL2
       * pipeline at sixty frames a second takes the GPU away from the
       * rest of the app — the side menu's slide runs on the UI thread
       * and was losing frames to it.
       *
       * The motion does not need sixty: the glyph clock and the shape's
       * clock are both time-based, so the field moves exactly as it
       * did at half the frames. The clocks still advance on every
       * animation frame; only the DRAWING is halved.
       */
      if (now - lastDraw < FRAME_MS) {
        raf = window.requestAnimationFrame(frame);
        return;
      }
      lastDraw = now;
      updateInput(dt);
      draw();
      /*
       * The loop idles out entirely under reduced motion once the intro and
       * every transient have expired. Any pointer movement, resize or theme
       * change calls wake(), which brings it straight back for one frame.
       */
      const busy =
        !reduced ||
        introClock < 1 ||
        clicks.length > 0 ||
        trail.length > 0 ||
        dimAmount !== dimTarget;
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
      /*
       * THE CURRENT PROPS, NOT THE MOUNTED ONES.
       *
       * This closure was created by the mount, and the mount is not going
       * to happen again — but the palette is not the mount's property, it
       * is the reader's. Reading the ref here is what makes a theme change
       * a change of the FIELD and not only of the page around it.
       */
      const current = propsRef.current;
      const next = themeRamp(current.bg, current.accent);
      settings.stops = next.stops;
      settings.lightMode = next.lightMode;
      intensityTarget = current.intensity;
      dimDuration = Math.max(1, current.dimDuration);
      reduced = current.reduced;
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

    /*
     * THE LIVE SETTINGS, FOR THE PROPS.
     *
     * The palette arrives as props over the bridge, so a palette change
     * is a change of props rather than a change of a class attribute on
     * the document. This is where the effect hands the outside world a way
     * to push new colours into the running field, and it is the same
     * `applyTheme` the web app's observer called.
     */
    liveRef.current = {
      repaint: () => {
        applyTheme();
      },
      setDim: (value: boolean) => {
        dimTarget = value ? 1 : 0;
        wake();
      },
    };

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
      liveRef.current = null;
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
    /*
     * THE DEPENDENCIES ARE DELIBERATELY EMPTY.
     *
     * This effect owns the GL context, the four programs, the three
     * render targets and the glyph atlas, and all of them belong to ONE
     * mount: a canvas keeps returning the same context object for its
     * whole life, so a second mount would be handed a context the first
     * mount's cleanup already released, and every call on it would
     * silently do nothing.
     *
     * The palette and the strength are NOT applied here — they are
     * applied by the effect above, through `liveRef`, which re-derives
     * the ramp and repaints the running field without touching any of
     * the GL objects this effect created.
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
   * THE FIELD, AND THE PAGE UNDER IT.
   *
   * The div carries the page's own colour and the canvas is laid over
   * it, so the WebView is OPAQUE and the field's own background is the
   * palette's. A transparent WebView would be a different gamble: the
   * platform's default is white, and a white rectangle behind every
   * screen is not a failure mode worth shipping.
   *
   * `pointer-events: none` because nothing under the reader's thumb
   * should reach a background.
   */
  return (
    <>
      {/*
       * THE PAGE'S OWN RESET.
       *
       * A document has a body with an eight-pixel margin, and a body
       * that is not the height of the window makes `height: 100%` mean
       * the height of the CONTENT rather than the height of the SCREEN.
       * Both of those put the field a finger's width off where it
       * belongs, so both are reset here.
       */}
      <style>{`html,body{margin:0;padding:0;height:100%;width:100%;overflow:hidden;background:${bg};}`}</style>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          overflow: "hidden",
          background: bg,
          pointerEvents: "none",
        }}
      >
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        />
      </div>
    </>
  );
}