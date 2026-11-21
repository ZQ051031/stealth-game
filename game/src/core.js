// Lampblack: shared constants, tuning and small helpers. Every script hangs off one global, LB,
// so the game runs from plain <script> tags (it even opens straight from disk, file://).
'use strict';
var LB = {};

LB.TILE = 32;
LB.COLS = 40;
LB.ROWS = 21;
/** The HUD strip above the level; the level fills the rest of the 1280x720 logical screen. */
LB.HUD = 48;
LB.W = 1280;
LB.H = 720;
LB.STEP = 1 / 60;

/** Every tuning number of the rules, in one place. Distances are pixels, times seconds, angles radians. */
LB.TUNE = {
  radius: 10,
  walk: 128,
  sneak: 64,
  stride: 26,
  noiseWalk: 70,
  noiseGravelWalk: 175,
  noiseGravelSneak: 58,
  pebbleRange: 300,
  pebbleSpeed: 460,
  pebbleNoise: 235,
  pebbleCooldown: 0.45,
  pickupRadius: 18,
  guard: {
    patrol: 56,
    investigate: 88,
    turn: 3.4,
    range: 215,
    half: 0.66,
    feel: 30,
    shadowRange: 0.36,
    react: 0.55,
    search: 3.6,
  },
  eye: { range: 260, half: 0.4, sweep: 0.55, pause: 1.1 },
  detect: { base: 0.72, near: 2.5, still: 0.7, sneak: 0.85, eye: 0.75, decay: 0.34, suspicious: 0.22, lose: 0.9 },
};

/** Tile kinds by map character: solid blocks walking, opaque blocks lantern light. */
LB.KIND = {
  '#': { solid: true, opaque: true, name: 'wall' },
  C: { solid: true, opaque: true, name: 'crate' },
  B: { solid: true, opaque: true, name: 'shelf' },
  O: { solid: true, opaque: true, name: 'pillar' },
  h: { solid: true, opaque: true, name: 'hedge' },
  w: { solid: true, opaque: false, name: 'water' },
  '~': { solid: false, opaque: false, name: 'shadow' },
  ':': { solid: false, opaque: false, name: 'gravel' },
  X: { solid: false, opaque: false, name: 'exit' },
  '.': { solid: false, opaque: false, name: 'floor' },
};

LB.clamp = function (v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
};
LB.lerp = function (a, b, t) {
  return a + (b - a) * t;
};
/** The signed smallest turn from angle a to angle b, in (-PI, PI]. */
LB.angleDiff = function (a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
};
LB.deg = function (d) {
  return (d * Math.PI) / 180;
};
/** Mulberry32: a small seeded generator, so textures and screenshot scenes repeat exactly. */
LB.rng = function (seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
LB.FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';
LB.SERIF = 'Georgia, "Times New Roman", serif';

/** Saved progress: unlocked level, best stars and times. Storage may be off; then it lasts this visit. */
LB.save = (function () {
  const KEY = 'lampblack.v1';
  let data = { unlocked: 1, stars: [], best: [], muted: false };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) data = Object.assign(data, JSON.parse(raw));
  } catch (e) {
    /* private window: keep defaults */
  }
  return {
    data: data,
    write: function () {
      try {
        window.localStorage.setItem(KEY, JSON.stringify(data));
      } catch (e) {
        /* ignore */
      }
    },
  };
})();
