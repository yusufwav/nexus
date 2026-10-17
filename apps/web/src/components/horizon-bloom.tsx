"use client";

/**
 * HORIZON BLOOM — the tutor chat's background
 * ------------------------------------------------------------------------
 * A sunrise breaking over the glowing edge of a dark planet, behind the
 * conversation on /ai. It is a WebGL2 fragment shader rendered to an
 * offscreen HDR buffer, blurred into a bloom and composited back with film
 * grain over the top.
 *
 * WHY IT IS NOT THE ASCII FIELD
 * ------------------------------------------------------------------------
 * `.nt-ai > canvas.nt-ambient-bg` is still in the stylesheet and still
 * positioned here, with the veil above it and the shell above that. This
 * component mounts into that same slot - so the layout, the veil and the
 * glass panels are all untouched - but paints a lit scene rather than
 * glyphs.
 *
 * The reason that matters is the veil's arithmetic. --ai-veil is a 40%
 * black wash, tuned to knock a 0.6-opacity field of bright characters back
 * far enough to read LaTeX against. A field of moving letters is uniform
 * noise across the viewport; a horizon is not. It is almost entirely dark,
 * with all of its light in a band and a glow. The same 40% veil that a
 * full-bleed character field needs to become readable would flatten the
 * lit part of this to nothing, so the veil is lowered for the scene. That
 * and nothing else is what --ai-bloom-veil is for.
 *
 * WHY THE COLOURS ARE DERIVED, NOT PICKED
 * ------------------------------------------------------------------------
 * There are fifty-two palettes in the registry and a reader can be on any
 * of them. Two hard-coded light colours would be wrong on fifty-one of
 * them, so warm, cool and the page background all come out of the active
 * palette - see lib/palette-colours.ts for the rules and
 * scripts/audit-horizon-colours.mjs for the check that all fifty-two still
 * produce a usable pair.
 *
 * The effect's own documented behaviour is that on a light background the
 * two colours "become matching inks", and that is a branch in the shader
 * rather than a second set of colours: the same derived pair renders as
 * light on dark and as ink on light.
 *
 * COLOUR SPACE
 * ------------------------------------------------------------------------
 * The two colours are blended in OKLab, not in sRGB, and that is the
 * shader's doing rather than a detail of the transfer function. Mixing a
 * warm pink into a violet in sRGB passes through a dead grey in the middle,
 * and the effect's atmosphere ramps between exactly those two across its
 * whole height - so an sRGB mix would put a grey band in the sky. The
 * conversion is Björn Ottosson's and is the same one the browser uses for
 * oklch(), so a colour that survives the round trip is the colour here.
 */

import { useEffect, useRef } from "react";
import { PALETTE_ACCENT_TOKENS, horizonPalette } from "@/lib/palette-colours";

/**
 * The effect's settings, as chosen for the tutor chat.
 *
 * Every one of these is the effect's own parameter at the value the tutor
 * surface wants, so they are named rather than inlined: this is a tuned
 * look, and the tuning is the documentation.
 *
 * The three that are NOT at the default and are worth a line each:
 *
 *   rim: 3          the maximum. This is a background, not a hero image, and
 *                   the rim is the one line that would otherwise read as a
 *                   hard edge cutting the viewport in half. At the maximum it
 *                   is a bright horizon rather than a drawn line.
 *
 *   clouds: 2       the maximum, which is what puts the light catching the
 *                   tops of something just below the limb. At the default the
 *                   planet below the rim is flat black; this is the only
 *                   thing in the scene with any structure down there.
 *
 *   stars: 2        the maximum, same reasoning in the other direction: the
 *                   sky is most of the frame, and an empty one is just black.
 *
 * curvature: 0.5   deliberately gentle. At 1 the planet fills a third of the
 *                   viewport and its limb sweeps across the middle of the
 *                   transcript; at 0.5 the horizon is a long low arc sitting
 *                   in the bottom fifth, which is depth rather than subject.
 *
 * interactive:false, parallax: 0
 *                   the reader is typing into this page. A canvas that
 *                   tracks the pointer is a canvas that moves the thing
 *                   they are aiming at, so neither the pointer roll nor the
 *                   click-to-raise-an-aurora is wired up. The aurora still
 *                   appears on its own - see autoAurora.
 *
 * autoAurora: true
 *                   which is what replaces the interaction. Something rises
 *                   from the horizon every few seconds whether or not anyone
 *                   is touching it, so the scene is alive on a page that is
 *                   otherwise completely static - a reader thinking about a
 *                   limit is not moving the mouse.
 */
const TUNING = {
  horizon: 0.7,
  curvature: 0.5,
  tilt: 0,
  sunPosition: 0.6,
  sunrise: 1.5,
  spread: 0.5,
  atmosphere: 1,
  thickness: 1.5,
  rim: 3,
  flare: 0.8,
  airglow: 0.7,
  clouds: 2,
  stars: 2,
  aurora: 1,
  speed: 2,
  drift: 2,
  parallax: 0,
  bloom: 0.5,
  grain: 0.5,
  autoAurora: true,
  interactive: false,
  intro: true,
  paused: false,
} as const;

/**
 * Device pixel ratio cap.
 *
 * Not 2, and not for a reason anyone would guess from the number. The cost
 * of this is a per-pixel fragment shader over the WHOLE viewport - four
 * value-noise octaves for the cloud tops, a grid of stars, up to three
 * aurora curtains, then a bright pass, two separable blurs and a composite.
 * At 2x on a 1440p display that is roughly four times the fragment work of
 * 1x for a background whose entire job is to be behind text.
 *
 * The horizon is a smooth gradient, so the extra samples buy almost nothing
 * visible; the grain, which IS high frequency, is the one thing that wants
 * the resolution, and it still gets it - 1.5 is enough for film grain to
 * read as grain rather than as blotches.
 */
const DPR_CAP = 1.5;

/** Aurora curtains, in the order they may be spawned. */
const MAX_AURORAS = 3;

/** Seconds between automatic auroras, plus the spread the randomiser adds. */
const AURORA_EVERY = [4.5, 3.2] as const;

/* ------------------------------------------------------------------ */
/* colour                                                              */
/* ------------------------------------------------------------------ */

function srgbToOklab(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  const lin = (c: number): number => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const R = lin((n >> 16) & 255);
  const G = lin((n >> 8) & 255);
  const B = lin(n & 255);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function hexToLinear(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  const lin = (c: number): number => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return [lin((n >> 16) & 255), lin((n >> 8) & 255), lin(n & 255)];
}

/* ------------------------------------------------------------------ */
/* GLSL                                                                */
/* ------------------------------------------------------------------ */

/**
 * A fullscreen triangle from gl_VertexID alone - no buffers, no attributes.
 *
 * vUv goes out because the post passes sample their input with it. The scene
 * pass does not read it - it works in gl_FragCoord - and a vertex output with
 * no matching fragment input is legal, so one vertex shader serves both.
 *
 * The 0/2/4 triangle rather than two: a fullscreen QUAD drawn as two triangles
 * runs the diagonal twice, and every pixel along that seam is shaded twice.
 * A three-vertex triangle has no seam, no duplicated work, and no diagonal
 * to show up as a hairline in a blur pass.
 */
const VERT = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/**
 * THE SCENE.
 *
 * Everything is in viewport-height units, so the composition is the same on
 * a phone and on a 4K monitor: p.y runs -0.5 to 0.5 and the planet's radius
 * is 2.4 / curvature, which puts the limb at the right place for a curve
 * this gentle.
 */
const SCENE = `#version 300 es
precision highp float;

out vec4 fragColor;

uniform vec2  uRes;
uniform float uTime;
uniform vec3  uWarmOk;
uniform vec3  uCoolOk;
uniform vec3  uBg;
uniform float uHorizon, uCurv, uTilt, uSunPos, uSunrise, uSpread;
uniform float uAtmo, uThickness, uRim, uFlare, uAirglow, uClouds, uStars, uAurora;
uniform float uSpeed, uDrift, uParallax;
uniform float uIntro;
uniform float uLightMode;
uniform float uEncode;
uniform vec4  uAur[${MAX_AURORAS}];

/* ---- hash / noise ---- */
float hash12(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
vec2 hash22(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.xx + q.yz) * q.zy);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1,0)), u.x),
             mix(hash12(i + vec2(0,1)), hash12(i + vec2(1,1)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.07; a *= 0.5; }
  return s;
}

/* OKLab -> linear sRGB. The inverse of what the CPU sent in. */
vec3 okToLin(vec3 c) {
  float l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
  float m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
  float s_ = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
  vec3 lms = vec3(l_ * l_ * l_, m_ * m_ * m_, s_ * s_ * s_);
  return vec3( 4.0767416621 * lms.x - 3.3077115913 * lms.y + 0.2309699292 * lms.z,
              -1.2684380046 * lms.x + 2.6097574011 * lms.y - 0.3413193965 * lms.z,
              -0.0041960863 * lms.x - 0.7034186147 * lms.y + 1.7076147010 * lms.z);
}
vec3 okMix(float t) { return okToLin(mix(uWarmOk, uCoolOk, clamp(t, 0.0, 1.0))); }

void main() {
  float aspect = uRes.x / uRes.y;
  float hw = 0.5 * aspect;
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float t = uTime * uSpeed;

  /* tilt - rotates the whole view */
  float a  = radians(uTilt);
  float ca = cos(a), sa = sin(a);
  p = mat2(ca, -sa, sa, ca) * p;

  /* pointer parallax. Zero here - interactive is off - but the branch is
     kept so the uniform means what the shader says it means. */
  if (uParallax > 0.0) {
    float pa = 0.0;
    float cp = cos(pa), sp = sin(pa);
    p = mat2(cp, -sp, sp, cp) * p;
  }

  /* the sun's slow wander along the horizon */
  float sunX = uSunPos * 0.425 * aspect
             + (sin(t * 0.13 + 1.7) * 0.055 + sin(t * 0.052 + 0.4) * 0.035) * uDrift * hw;

  /* the planet. R = 2.40 / curvature, fitted against the reference so the
     limb lands on the frame edge where it should at curvature 0.2 to 5. */
  float R = 2.40 / max(uCurv, 0.05);
  vec2  C = vec2(0.0, (0.5 - uHorizon) - R);
  float above = length(p - C) - R;

  /* the intro: the sun climbs through the edge as the light spreads */
  float ie = uIntro * uIntro * (3.0 - 2.0 * uIntro);

  float sx = clamp(sunX, -R * 0.985, R * 0.985);
  float sy = C.y + sqrt(max(R * R - sx * sx, 1e-5));
  vec2  sunP = vec2(sx, sy + (ie - 0.55) * 0.055 * uSunrise);

  float dx = p.x - sunP.x;

  /* how far along the horizon the light reaches */
  float spd = uSpread * mix(0.14, 1.0, ie);
  float wR  = 0.050 + 0.28 * spd;
  float wA  = 0.500 + 0.85 * spd;
  float alongRim  = mix(0.15, 1.0, 1.0 / (1.0 + pow(abs(dx) / wR, 2.0)));
  float alongAtmo = mix(0.10, 1.0, 1.0 / (1.0 + pow(abs(dx) / wA, 2.0)));

  float H = 0.125 * uThickness;
  float below = max(-above, 0.0);
  float body  = smoothstep(0.0018, -0.0018, above);
  float atmoUp   = exp(-max(above, 0.0) / H);
  float atmoDown = exp(-below / (H * 0.20));

  /* warm at the surface, cool higher and further out */
  float hRamp = clamp(above / (H * 1.80), 0.0, 1.0);
  float sRamp = clamp(abs(dx) / (wA * 1.60), 0.0, 1.0);
  float tMix  = clamp(hRamp * 0.72 + sRamp * 0.28, 0.0, 1.0);
  if (uLightMode > 0.5) tMix = clamp(tMix + 0.26, 0.0, 1.0);

  vec3 cAtmo = okMix(tMix);
  vec3 cWarm = okMix(0.05);
  vec3 cCool = okMix(0.95);

  /* ---- layer intensities ---- */
  float iAtmo = uAtmo * atmoUp * alongAtmo;
  float iBand = uAtmo * exp(-max(above, 0.0) / (H * 0.34)) * alongAtmo;
  float iWash = uAtmo * atmoDown * alongAtmo * body;
  float rw    = 0.0026 + 0.0018 * uThickness;
  float iRim  = uRim * alongRim * (exp(-abs(above) / rw) * 1.70 + exp(-abs(above) / (rw * 8.0)) * 0.50);
  float iAir  = uAirglow * exp(-pow((above - (H * 1.8 + 0.012)) / (H * 0.85), 2.0)) * alongAtmo;
  float cn    = fbm(vec2(p.x * 11.0 + 3.1, below * 34.0));
  float iCl   = uClouds * body * exp(-below / 0.085) * (0.35 + 0.65 * alongAtmo) * (0.20 + 0.80 * cn);

  vec2  ds = p - sunP;
  float r  = length(ds);
  float iFl = uFlare * (exp(-r / 0.009) * 2.4 + exp(-r / 0.050) * 0.42);
  iFl += uFlare * exp(-abs(ds.x) / 0.170) * exp(-abs(ds.y) / 0.0042) * 0.50;
  iFl += uFlare * exp(-abs(ds.y) / 0.055) * exp(-abs(ds.x) / 0.0050) * 0.14;

  float iSt = 0.0;
  if (uLightMode < 0.5 && uStars > 0.001) {
    vec2 sc = p * 74.0;
    vec2 ci = floor(sc), cf = fract(sc);
    vec2 h  = hash22(ci);
    float present = step(0.38, h.x);
    float bright  = pow(hash12(ci + 7.3), 3.0);
    float tw      = 0.55 + 0.45 * sin(t * 2.1 + hash12(ci + 3.7) * 6.283);
    float dstar   = length(cf - vec2(h.y, fract(h.x * 97.0)));
    iSt = present * bright * tw * exp(-max(above, 0.0) / (H * 1.30)) * smoothstep(0.085, 0.0, dstar);
  }

  /* aurora: a narrow curtain of rays over a broader soft glow. */
  float iAu = 0.0, iAuH = 0.0;
  if (uAurora > 0.001) {
    float dark = 1.0 / (1.0 + iAtmo * 1.1);
    for (int i = 0; i < ${MAX_AURORAS}; i++) {
      float st = uAur[i].y;
      if (st <= 0.002) continue;
      float cx  = uAur[i].x;
      float wid = uAur[i].w;
      float len = uAur[i].z;
      float ray = fbm(vec2(p.x * 55.0 + cx * 50.0 - t * 0.35, above * 2.6 + cx * 7.0));
      float ray2 = 0.45 + 0.55 * sin(p.x * 165.0 + ray * 8.0 + t * 0.6);

      float envS = exp(-pow((p.x - cx) / wid, 2.0));
      if (envS > 0.003) {
        float fall = exp(-max(above, 0.0) / len) * smoothstep(-0.004, 0.014, above);
        iAu += envS * fall * (0.18 + 0.95 * ray) * ray2 * st;
      }
      float envW = exp(-pow((p.x - cx) / (wid * 2.8), 2.0));
      if (envW > 0.002) {
        float hf = exp(-max(above, 0.0) / (len * 1.6)) * smoothstep(-0.004, 0.010, above);
        iAuH += envW * hf * (0.55 + 0.45 * ray) * st;
      }
    }
    iAu  *= uAurora * dark;
    iAuH *= uAurora * dark;
  }

  vec3 col;
  if (uLightMode > 0.5) {
    /* Ink. On a light page the same two colours are a stain rather than a
       light source, so everything is mixed toward the page colour instead of
       added to it. */
    vec3 ink = okMix(tMix);
    float a = clamp(iAtmo * 0.90 + iBand * 0.55 + iAir * 0.60 + iCl * 0.45 + iAu * 0.35 + iAuH * 0.30, 0.0, 1.0);
    col = mix(uBg, ink * 0.95, a * 0.88);
    col = mix(col, okMix(0.30) * 0.85, clamp(iRim * 0.55, 0.0, 1.0));
    col = mix(col, uBg, body);
  } else {
    col = vec3(0.0);
    col += cAtmo * iAtmo * 0.42;
    col += mix(cWarm, cAtmo, 0.30) * iBand * 0.70;
    col += cCool * iWash * 0.12;
    col += cCool * iAir * 0.18;
    col += mix(cWarm, cCool, 0.72) * iCl * 1.10;
    col += mix(vec3(1.0), cWarm, 0.40) * iRim * 0.85;
    col += mix(vec3(1.0), cWarm, 0.30) * iFl * alongAtmo;

    vec3 bodyCol = vec3(0.0035, 0.0035, 0.0052);
    bodyCol += mix(cWarm, cCool, 0.5) * exp(-below / 0.030) * alongRim * 0.055;
    col = mix(col, bodyCol, body);

    col += vec3(1.0, 0.86, 0.70) * iSt * uStars * 2.0 * (1.0 - body);
    col += mix(cCool, cWarm, 0.16 + 0.28 * exp(-max(above, 0.0) / 0.03)) * iAu  * 0.13;
    col += mix(cCool, cWarm, 0.14) * iAuH * 0.55;
  }

  fragColor = vec4(max(col, 0.0) * uEncode, 1.0);
}`;

/**
 * Bright pass.
 *
 * Threshold rather than a straight blur: the rim and the flare are the only
 * things that should glow, and blurring the whole frame would lift the sky.
 */
const BRIGHT = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uThresh, uEncode;
void main() {
  vec3 c = texture(uTex, vUv + uTexel * vec2(-1.0,-1.0)).rgb
         + texture(uTex, vUv + uTexel * vec2( 1.0,-1.0)).rgb
         + texture(uTex, vUv + uTexel * vec2(-1.0, 1.0)).rgb
         + texture(uTex, vUv + uTexel * vec2( 1.0, 1.0)).rgb;
  c *= 0.25 / uEncode;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float k = max(l - uThresh, 0.0) / max(l, 1e-4);
  o = vec4(min(c * k, vec3(12.0)) * uEncode, 1.0);
}`;

/** Nine-tap gaussian, run twice per axis. */
const BLUR = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uTex;
uniform vec2 uDir;
void main() {
  vec3 c = texture(uTex, vUv).rgb * 0.2270270270;
  c += (texture(uTex, vUv + uDir * 1.3846153846).rgb + texture(uTex, vUv - uDir * 1.3846153846).rgb) * 0.3162162162;
  c += (texture(uTex, vUv + uDir * 3.2307692308).rgb + texture(uTex, vUv - uDir * 3.2307692308).rgb) * 0.0702702703;
  o = vec4(c, 1.0);
}`;

/** Box downsample for the second bloom octave. */
const DOWN = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uTex;
uniform vec2 uTexel;
void main() {
  vec3 c = texture(uTex, vUv + uTexel * vec2(-1.0,-1.0)).rgb
         + texture(uTex, vUv + uTexel * vec2( 1.0,-1.0)).rgb
         + texture(uTex, vUv + uTexel * vec2(-1.0, 1.0)).rgb
         + texture(uTex, vUv + uTexel * vec2( 1.0, 1.0)).rgb;
  o = vec4(c * 0.25, 1.0);
}`;

/** Grain, vignette, linear-to-sRGB, and the final add of the bloom. */
const COMPOSITE = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uScene, uA, uB;
uniform vec2  uRes;
uniform float uEncode, uBloom, uGrain, uTime, uAspect, uExposure;

float h12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
void main() {
  vec3 c  = texture(uScene, vUv).rgb / uEncode;
  vec3 b  = (texture(uA, vUv).rgb + texture(uB, vUv).rgb * 0.85) / uEncode;
  c += b * uBloom;
  c *= uExposure;

  vec2 q = vUv - 0.5; q.x *= uAspect;
  c *= 1.0 - 0.20 * dot(q, q);

  /* Grain over the LIT areas only. Film grain is a property of exposure: on
     the black sky there is nothing for it to grain, and applying it uniformly
     puts visible noise in the one region of the frame that should be silent. */
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float g = h12(vUv * uRes + vec2(uTime * 61.0, uTime * 37.0)) - 0.5;
  c += g * uGrain * 0.13 * smoothstep(0.0, 0.30, lum);

  c = max(c, 0.0);
  vec3 s = mix(12.92 * c, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
  o = vec4(s, 1.0);
}`;

/* ------------------------------------------------------------------ */
/* the engine                                                          */
/* ------------------------------------------------------------------ */

type Aurora = {
  /** Position across the frame, 0-1. */
  x: number;
  /** Half-width of the ray curtain. */
  w: number;
  /** How far the rays reach above the limb. */
  len: number;
  /** Current strength, 0-1. */
  st: number;
  /** Target strength, reached over RISE seconds. */
  peak: number;
  /** Seconds alive. */
  t: number;
  /** True once a spawn has claimed this slot. */
  used: boolean;
};

function buildPrograms(gl: WebGL2RenderingContext): Record<string, WebGLProgram> {
  const compile = (type: number, src: string): WebGLShader => {
    const s = gl.createShader(type);
    if (s === null) throw new Error("shader allocation failed");
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error(log ?? "shader compile failed");
    }
    return s;
  };
  const link = (fs: string): WebGLProgram => {
    const p = gl.createProgram();
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const f = compile(gl.FRAGMENT_SHADER, fs);
    gl.attachShader(p, vs);
    gl.attachShader(p, f);
    gl.linkProgram(p);
    gl.deleteShader(vs);
    gl.deleteShader(f);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(p);
      gl.deleteProgram(p);
      throw new Error(log ?? "program link failed");
    }
    return p;
  };
  return {
    scene: link(SCENE),
    bright: link(BRIGHT),
    blur: link(BLUR),
    down: link(DOWN),
    composite: link(COMPOSITE),
  };
}

/**
 * Every uniform resolved BY NAME.
 *
 * `getUniformLocation(program, null)` looks like it returns a map. It does
 * not - it returns a single location, for whichever uniform the
 * implementation happens to list first, and every other `uniform1f` against a
 * null location is a silent no-op. Every uniform in every program comes back
 * 0, the planet's curvature comes back 0, and the scene renders black with no
 * error anywhere. It cost an afternoon once.
 */
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

export default function HorizonBloom(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;

    const gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: "low-power",
    });
    if (gl === null) return;

    /*
     * The context, re-bound to a name TypeScript will keep narrowing.
     *
     * `gl` is a const, so a null check on it narrows it for the rest of this
     * function body - but NOT inside `draw`, which is a hoisted function
     * declaration and so may be called before the check. Every `gl.foo`
     * inside it type-errors as possibly null. The same wall is documented in
     * ascii-field.tsx, and it has the same fix: capture the narrowed value
     * into another const and let the closures read that.
     */
    const context = gl;

    let programs: Record<string, WebGLProgram>;
    try {
      programs = buildPrograms(gl);
    } catch (err) {
      /*
       * A swallowed shader failure is the worst kind, and this one already
       * was: the catch exists so a driver without float textures costs the
       * atmosphere and not the page, but it also caught a genuine GLSL
       * compile error and rendered a silent 300x150 black canvas with nothing
       * in the console. It is logged in development for exactly that reason,
       * and only in development - a production console should not carry a
       * line about a fallback that worked.
       */
      if (process.env.NODE_ENV !== "production") {
        console.warn("[horizon-bloom] disabled:", err);
      }
      return;
    }

    const u: Record<string, Record<string, WebGLUniformLocation | null>> = {
      scene: uniformMap(gl, programs.scene!),
      bright: uniformMap(gl, programs.bright!),
      blur: uniformMap(gl, programs.blur!),
      down: uniformMap(gl, programs.down!),
      composite: uniformMap(gl, programs.composite!),
    };

    // HDR where the driver allows it, and 8-bit otherwise. The scene writes
    // well above 1.0 at the rim and the flare, and the bright pass needs
    // those values intact or the bloom has nothing above threshold to find.
    // RGBA8 would clip them to white and the glow would come out as a hard
    // shape; dividing by four on the way in and back out on the way through
    // is the fallback that keeps most of the range.
    const hdr = !!(gl.getExtension("EXT_color_buffer_half_float") || gl.getExtension("EXT_color_buffer_float"));
    const encode = hdr ? 1 : 0.25;

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    /* ---- offscreen targets ---- */
    type Target = { fb: WebGLFramebuffer; tex: WebGLTexture; w: number; h: number };
    const makeTarget = (w: number, h: number): Target => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(
        gl.TEXTURE_2D, 0,
        hdr ? gl.RGBA16F : gl.RGBA8, w, h, 0,
        gl.RGBA, hdr ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null,
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { fb, tex, w, h };
    };
    const dropTarget = (t: Target | undefined): void => {
      if (t === undefined) return;
      gl.deleteFramebuffer(t.fb);
      gl.deleteTexture(t.tex);
    };

    let targets: Record<string, Target> = {};
    let W = 0;
    let H = 0;

    function allocate(w: number, h: number): void {
      W = Math.max(2, Math.round(w));
      H = Math.max(2, Math.round(h));
      canvas!.width = W;
      canvas!.height = H;
      for (const k of Object.keys(targets)) dropTarget(targets[k]);
      const w2 = Math.max(2, W >> 1), h2 = Math.max(2, H >> 1);
      const w4 = Math.max(2, W >> 2), h4 = Math.max(2, H >> 2);
      targets = {
        scene: makeTarget(W, H),
        b0: makeTarget(w2, h2),
        b0t: makeTarget(w2, h2),
        b1: makeTarget(w4, h4),
        b1t: makeTarget(w4, h4),
      };
    }

    const sizeCanvas = (): void => {
      const r = canvas!.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
      const w = Math.max(1, Math.round(r.width * dpr));
      const h = Math.max(1, Math.round(r.height * dpr));
      if (w !== W || h !== H) allocate(w, h);
    };

    /* ---- palette, read off .nt-root like every other engine here ---- */
    function readPalette() {
      const host = document.querySelector<HTMLElement>(".nt-root") ?? document.documentElement;
      const cs = getComputedStyle(host);
      const bag: Record<string, string> = { "--bg-0": cs.getPropertyValue("--bg-0").trim() };
      // The candidate list is the derivation's, imported rather than restated
      // here. Two lists of one fact is how the two drift.
      for (const n of PALETTE_ACCENT_TOKENS) bag[n] = cs.getPropertyValue(n).trim();
      return horizonPalette(bag);
    }
    let palette = readPalette();

    /* ---- animation state ---- */
    const auroras: Aurora[] = Array.from({ length: MAX_AURORAS }, () => ({
      x: 0.3, w: 0.125, len: 0.13, st: 0, peak: 0, t: 0, used: false,
    }));
    // Two ambient curtains, always on. These are what give the sky its
    // structure without anyone touching anything; the third slot is kept for
    // the automatic rises so an automatic aurora never replaces an ambient
    // one and make the sky visibly change shape.
    let nextAurora = AURORA_EVERY[0] + AURORA_EVERY[1];
    let time = 0;
    let intro = 0;
    let raf = 0;
    let last = 0;
    let running = true;
    let destroyed = false;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function spawnAurora(): void {
      const free = auroras[auroras.length - 1]!;
      free.x = 0.1 + Math.random() * 0.8;
      free.w = 0.085;
      free.len = 0.18;
      free.st = 0;
      free.peak = 0.75;
      free.t = 0;
      free.used = true;
    }

    function reset(): void {
      time = 0;
      intro = 0;
      for (const a of auroras) {
        a.st = 0;
        a.t = 0;
        a.used = false;
        a.peak = 0;
      }
    }

    /* ---- drawing ---- */
    const aurBuf = new Float32Array(MAX_AURORAS * 4);

    function draw(now: number): void {
      if (destroyed) return;
      raf = window.requestAnimationFrame(draw);
      if (!running || targets.scene === undefined) return;

      const dt = Math.min(0.05, (now - last) / 1000 || 1 / 60);
      last = now;

      if (!reduced) {
        time += dt;
        intro = Math.min(1, intro + dt / 2.1);
        nextAurora -= dt;
        if (nextAurora <= 0) {
          nextAurora = AURORA_EVERY[0] + Math.random() * AURORA_EVERY[1];
          spawnAurora();
        }
      }

      // The two ambient curtains track the sun, which drifts.
      const ambient: ReadonlyArray<readonly [number, number, number]> = [
        [-0.18, 0.125, 0.13],
        [0.07, 0.095, 0.10],
      ];
      const sunX01 = TUNING.sunPosition + sunDrift();
      for (let i = 0; i < 2; i++) {
        const a = auroras[i]!;
        const [ox, w, len] = ambient[i]!;
        a.x = Math.min(1.08, Math.max(-0.08, sunX01 + ox));
        a.w = w;
        a.len = len;
        a.st = 1;
      }
      // The third is only alive between spawns.
      const auto = auroras[2]!;
      if (auto.used) {
        const RISE = 0.5, HOLD = 4.0, FALL = 3.0;
        auto.t += dt;
        auto.st =
          auto.t < RISE ? auto.peak * (auto.t / RISE)
          : auto.t < RISE + HOLD ? auto.peak
          : auto.t < RISE + HOLD + FALL ? auto.peak * (1 - (auto.t - RISE - HOLD) / FALL)
          : 0;
        if (auto.t >= RISE + HOLD + FALL) auto.used = false;
      } else {
        auto.st = 0;
      }

      auroras.forEach((a, i) => {
        aurBuf[i * 4 + 0] = (a.x - 0.5) * aspect();
        aurBuf[i * 4 + 1] = a.st;
        aurBuf[i * 4 + 2] = a.len;
        aurBuf[i * 4 + 3] = a.w;
      });

      /* --- scene --- */
      context.bindFramebuffer(context.FRAMEBUFFER, targets.scene.fb);
      context.viewport(0, 0, W, H);
      const s = programs.scene!;
      const us = u.scene!;
      context.useProgram(s);
      context.uniform2f(us.uRes, W, H);
      context.uniform1f(us.uTime, time);
      context.uniform3fv(us.uWarmOk, srgbToOklab(palette.warm));
      context.uniform3fv(us.uCoolOk, srgbToOklab(palette.cool));
      context.uniform3fv(us.uBg, hexToLinear(palette.background));
      for (const [key, name] of UNIFORM_ORDER) {
        const loc = us[key];
        if (loc !== null) context.uniform1f(loc, TUNING[name]);
      }
      context.uniform1f(us.uParallax, TUNING.parallax);
      context.uniform1f(us.uIntro, intro * intro * (3 - 2 * intro));
      context.uniform1f(us.uLightMode, palette.light ? 1 : 0);
      context.uniform1f(us.uEncode, encode);
      context.uniform4fv(us.uAur, aurBuf);
      context.drawArrays(context.TRIANGLES, 0, 3);

      /* --- bloom --- */
      const on = TUNING.bloom * (palette.light ? 0 : 1);

      if (on > 0.002) {
        context.bindFramebuffer(context.FRAMEBUFFER, targets.b0.fb);
        context.viewport(0, 0, targets.b0.w, targets.b0.h);
        context.useProgram(programs.bright!);
        context.activeTexture(context.TEXTURE0);
        context.bindTexture(context.TEXTURE_2D, targets.scene.tex);
        context.uniform1i(u.bright!.uTex, 0);
        context.uniform2f(u.bright!.uTexel, 1 / W, 1 / H);
        context.uniform1f(u.bright!.uThresh, 0.42);
        context.uniform1f(u.bright!.uEncode, encode);
        context.drawArrays(context.TRIANGLES, 0, 3);

        const blur = (src: Target, dst: Target, dx: number, dy: number): void => {
          context.bindFramebuffer(context.FRAMEBUFFER, dst.fb);
          context.viewport(0, 0, dst.w, dst.h);
          context.useProgram(programs.blur!);
          context.activeTexture(context.TEXTURE0);
          context.bindTexture(context.TEXTURE_2D, src.tex);
          context.uniform1i(u.blur!.uTex, 0);
          context.uniform2f(u.blur!.uDir, dx / dst.w, dy / dst.h);
          context.drawArrays(context.TRIANGLES, 0, 3);
        };
        blur(targets.b0!, targets.b0t!, 1, 0);
        blur(targets.b0t!, targets.b0!, 0, 1);

        context.bindFramebuffer(context.FRAMEBUFFER, targets.b1.fb);
        context.viewport(0, 0, targets.b1.w, targets.b1.h);
        context.useProgram(programs.down!);
        context.activeTexture(context.TEXTURE0);
        context.bindTexture(context.TEXTURE_2D, targets.b0!.tex);
        context.uniform1i(u.down!.uTex, 0);
        context.uniform2f(u.down!.uTexel, 1 / targets.b0!.w, 1 / targets.b0!.h);
        context.drawArrays(context.TRIANGLES, 0, 3);

        blur(targets.b1!, targets.b1t!, 1, 0);
        blur(targets.b1t!, targets.b1!, 0, 1);
        blur(targets.b1!, targets.b1t!, 2, 0);
        blur(targets.b1t!, targets.b1!, 0, 2);
      }

      /* --- composite --- */
      context.bindFramebuffer(context.FRAMEBUFFER, null);
      context.viewport(0, 0, W, H);
      context.useProgram(programs.composite!);
      context.activeTexture(context.TEXTURE0);
      context.bindTexture(context.TEXTURE_2D, targets.scene.tex);
      context.uniform1i(u.composite!.uScene, 0);
      context.activeTexture(context.TEXTURE1);
      context.bindTexture(context.TEXTURE_2D, on > 0.002 ? targets.b0!.tex : targets.scene.tex);
      context.uniform1i(u.composite!.uA, 1);
      context.activeTexture(context.TEXTURE2);
      context.bindTexture(context.TEXTURE_2D, on > 0.002 ? targets.b1!.tex : targets.scene.tex);
      context.uniform1i(u.composite!.uB, 2);
      context.uniform2f(u.composite!.uRes, W, H);
      context.uniform1f(u.composite!.uEncode, encode);
      context.uniform1f(u.composite!.uBloom, on * 1.15);
      context.uniform1f(u.composite!.uGrain, TUNING.grain);
      context.uniform1f(u.composite!.uTime, time);
      context.uniform1f(u.composite!.uAspect, aspect());
      context.uniform1f(u.composite!.uExposure, palette.light ? 1 : 1.08);
      context.drawArrays(context.TRIANGLES, 0, 3);
    }

    function aspect(): number {
      return H === 0 ? 1 : W / H;
    }

    /**
     * The sun's wander, in frame widths.
     *
     * This is the CPU's copy of the shader's own `sunX` drift. It has to
     * agree with it: the ambient aurora curtains are positioned in JS and
     * have to stay on the side of the sun the shader has moved to, or the
     * sky slowly drifts them away from the light they are lit by. Same
     * constants, same order, same phases - if the shader's changes, this
     * changes with it.
     */
    function sunDrift(): number {
      const k = TUNING.speed * TUNING.drift;
      return (
        (Math.sin(time * k * 0.13 + 1.7) * 0.055 + Math.sin(time * k * 0.052 + 0.4) * 0.035) *
        TUNING.drift *
        0.5
      );
    }

    /* ---- lifecycle ---- */
    sizeCanvas();
    if (reduced) {
      // Reduced motion gets the risen sun, still. One frame, no loop, no
      // aurora schedule - the scene is composed and correct, it simply does
      // not move.
      raf = window.requestAnimationFrame((t) => {
        last = t;
        time = 8;
        intro = 1;
        draw(t);
        running = false;
      });
    } else {
      raf = window.requestAnimationFrame(draw);
    }

    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(sizeCanvas) : null;
    ro?.observe(canvas);

    const io = typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver((entries) => {
          const visible = entries.some((e) => e.isIntersecting);
          if (visible && !running && !reduced) {
            running = true;
            last = performance.now();
          } else if (!visible) {
            running = false;
          }
        })
      : null;
    io?.observe(canvas);

    const onVisibility = (): void => {
      if (document.hidden) running = false;
      else if (!reduced) {
        running = true;
        last = performance.now();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    /*
     * next-themes writes the palette name onto <html> as a class, so
     * watching that attribute is what repaints the scene in the new theme
     * rather than leaving the colours it booted with. This is the same
     * mechanism ascii-field.tsx uses.
     */
    const themeObserver = typeof MutationObserver !== "undefined"
      ? new MutationObserver(() => {
          palette = readPalette();
        })
      : null;
    themeObserver?.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    return () => {
      destroyed = true;
      window.cancelAnimationFrame(raf);
      ro?.disconnect();
      io?.disconnect();
      themeObserver?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      for (const k of Object.keys(targets)) dropTarget(targets[k]);
      gl.deleteVertexArray(vao);
      for (const k of Object.keys(programs)) gl.deleteProgram(programs[k]);
    };
    // The scene reads its tuning from a module constant, so there is nothing
    // to depend on: it mounts once and runs until it unmounts.
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="nt-horizon-bloom" />;
}

/**
 * Every scalar the tuning block feeds straight into the scene shader.
 *
 * Typed against the NUMERIC keys of TUNING rather than all of them. The block
 * also holds the four booleans, and `TUNING[keyof typeof TUNING]` widens to
 * `number | boolean`, which is exactly the kind of thing that should not be
 * handable to `uniform1f`.
 */
type ScalarTuning = {
  readonly [K in keyof typeof TUNING]: (typeof TUNING)[K] extends number ? K : never;
}[keyof typeof TUNING];

const UNIFORM_ORDER: ReadonlyArray<readonly [string, ScalarTuning]> = [
  ["uHorizon", "horizon"],
  ["uCurv", "curvature"],
  ["uTilt", "tilt"],
  ["uSunPos", "sunPosition"],
  ["uSunrise", "sunrise"],
  ["uSpread", "spread"],
  ["uAtmo", "atmosphere"],
  ["uThickness", "thickness"],
  ["uRim", "rim"],
  ["uFlare", "flare"],
  ["uAirglow", "airglow"],
  ["uClouds", "clouds"],
  ["uStars", "stars"],
  ["uAurora", "aurora"],
  ["uSpeed", "speed"],
  ["uDrift", "drift"],
];
