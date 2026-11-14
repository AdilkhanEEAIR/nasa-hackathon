// Per-track rules: how a rendered pixel becomes values, and which instruments play them.
// Pure functions only (no DOM, no audio), so they are unit-tested.

import { lightLevel, LIGHT_FLOOR } from './fields.js';

/**
 * Change map (SVS 5313, frame 400). Hue gives the direction of change, brightness the
 * underlying light. Thresholds measured in docs/DATA_NOTES.md section 1.4:
 *   more light (purple):  B > R + 10 and B > G + 20
 *   less light (orange):  R > B + 30 and G > B + 10
 *   no change: any other lit pixel (near-white)
 * Returns levels 0..1 for each class; at most one class is non-zero per pixel.
 */
export function changeClass(r, g, b) {
  const level = lightLevel(r, g, b);
  const out = { more: 0, less: 0, same: 0 };
  if (level === 0) return out;
  if (b > r + 10 && b > g + 20) out.more = level;
  else if (r > b + 30 && g > b + 10) out.less = level;
  else out.same = level;
  return out;
}

export const CHANGE_LAYERS = [
  // More light: clean, bright, an octave up — it "sparkles".
  { name: 'more', type: 'triangle', octave: 1, cutoffLo: 2500, cutoffHi: 6500, peak: 1 },
  // Less light: buzzy but muffled, an octave down — it "sinks".
  { name: 'less', type: 'sawtooth', octave: -1, cutoffLo: 450, cutoffHi: 1100, peak: 1.15 },
  // No change: soft sine at the compass pitch, quieter so change stands out.
  { name: 'same', type: 'sine', octave: 0, cutoffLo: 1500, cutoffHi: 2500, peak: 0.45 },
];

export const CHANGE_COLORS = { more: '#c99cff', less: '#ffa95e', same: '#e9edf4' };

/** The dominant class of a set of levels, or null if all are zero. */
export function dominant(levels) {
  let best = null;
  let max = 0;
  for (const [k, v] of Object.entries(levels)) {
    if (v > max) { max = v; best = k; }
  }
  return best;
}

/** Words for a change class, kept neutral: what the map shows, not why. */
export function describeChange(kind) {
  if (kind === 'more') return 'more light in 2023 than in 2012';
  if (kind === 'less') return 'less light in 2023 than in 2012';
  if (kind === 'same') return 'lit, little change';
  return 'dark, no lights';
}

/**
 * Aerosols (SVS 5669). Classes come from the lossless sound grid written by
 * tools/prepare_media.py: R = amount, G = class id * 50 (1 smoke/black carbon, 2 dust,
 * 3 sea salt, 4 sulfate). Each class is its own instrument, recognisable without a legend.
 */
export const AEROSOL_CLASSES = ['smoke', 'dust', 'salt', 'sulfate'];

// Peaks are loudness-matched: each instrument at full value renders at about the same RMS as
// the night-lights tone (measured offline), so no phenomenon is louder just because of its timbre.
export const AEROSOL_LAYERS = [
  // Smoke / black carbon: crackling fire over a low rumble.
  { name: 'smoke', source: 'crackle', filter: 'lowpass', octave: 3, q: 0.8, pitchFilter: true, brightMul: 1.5, peak: 2.95 },
  // Dust: a dry, high rustle (band-passed noise).
  { name: 'dust', source: 'noise', filter: 'bandpass', octave: 4, q: 1.6, pitchFilter: true, brightMul: 0.4, peak: 3.7 },
  // Sea salt: soft surf, low and slowly swelling.
  { name: 'salt', source: 'surf', filter: 'lowpass', octave: 2, q: 0.5, pitchFilter: true, brightMul: 0.8, peak: 4.2 },
  // Sulfate: a buzzing tone (square wave) at the compass pitch.
  { name: 'sulfate', type: 'square', octave: 0, cutoffLo: 500, cutoffHi: 1800, peak: 0.65 },
];

export const AEROSOL_COLORS = { smoke: '#ff6a3d', dust: '#c99cff', salt: '#5fb7e0', sulfate: '#6ef04a' };

export const AEROSOL_NAMES = { smoke: 'smoke and black carbon', dust: 'dust', salt: 'sea salt', sulfate: 'sulfate' };

/** Splits the aerosol sound grid (RGBA pixels) into one value field per class. */
export function aerosolFields(img, lon0 = -180) {
  const { width, height, data } = img;
  const fields = Object.fromEntries(AEROSOL_CLASSES.map((c) => [c, new Uint8Array(width * height)]));
  for (let i = 0, p = 0; i < width * height; i++, p += 4) {
    const cls = Math.round(data[p + 1] / 50);
    if (cls >= 1 && cls <= 4) fields[AEROSOL_CLASSES[cls - 1]][i] = data[p];
  }
  return Object.fromEntries(Object.entries(fields).map(([k, values]) => [k, { width, height, lon0, values }]));
}

export function describeAerosol(kind) {
  return kind ? `mostly ${AEROSOL_NAMES[kind]}` : 'clear of the four aerosol types';
}

/**
 * Ocean temperature (SVS 3912, ECCO2 model, 19 June 2007). The lossless grid written by
 * tools/prepare_media.py holds R = flow line present, G = temperature 0..32 deg C read from the
 * colorbar by hue (brightness of the streaks does not change the value).
 */
export const OCEAN_RANGE_C = 32;

export function oceanFields(img, lon0 = -180) {
  const { width, height, data } = img;
  const cover = new Uint8Array(width * height);
  const temp = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < cover.length; i++, p += 4) {
    if (data[p] > 127) { cover[i] = 255; temp[i] = data[p + 1]; }
  }
  return { cover: { width, height, lon0, values: cover }, temp: { width, height, lon0, values: temp } };
}

/** Mean temperature (deg C) where flow lines exist, from arc/point means of cover and temp. */
export function oceanTemp(coverMean, tempMean) {
  return coverMean > 0.02 ? (tempMean / coverMean) * OCEAN_RANGE_C : null;
}

export const OCEAN_LAYERS = [
  // One instrument whose colour carries temperature: cold water is a dull, dark tone; warm
  // water opens the filter into a bright, rich sawtooth. Land is silent.
  { name: 'sea', type: 'sawtooth', octave: 0, cutoffLo: 220, cutoffHi: 4200, peak: 0.9 },
];

/** Ring voice -> sound for the ocean track: loudness = share of ocean flow on the arc,
 * brightness = its mean temperature on a fixed 0..32 deg C scale. */
export function oceanVoice(v, full = 0.5) {
  const cover = v.levels.cover || 0;
  const t = oceanTemp(cover, v.levels.temp || 0);
  const gain = cover > 0 ? Math.min(1, cover / full) ** 0.7 : 0;
  return { gains: { sea: t === null ? 0 : gain }, brightness: t === null ? 0 : t / OCEAN_RANGE_C, land: 0, temp: t };
}

export function describeTemp(t) {
  if (t === null || t === undefined) return 'no ocean flow here';
  return `sea surface about ${Math.round(t)} degrees Celsius`;
}

/**
 * Lightning (SVS 5011). Dots are yellow (median RGB 138,130,21); the base map, lines and
 * coverage shading are neutral grey (R = G = B), so "yellowness" separates them cleanly
 * (DATA_NOTES 3.3): R > 90, G > 70, B < G - 40.
 */
export function lightningLevel(r, g, b) {
  if (r <= 90 || g <= 70 || b >= g - 40) return 0;
  return Math.min(1, (Math.min(r, g) - b - 40) / 120);
}

/** ISS LIS coverage edge (DATA_NOTES 3.1): beyond this there is no data, not "no lightning". */
export const LIGHTNING_COVERAGE_LAT = 52;

export const LIGHTNING_LAYERS = [
  // Storm density on the arc: a low thunder rumble. Individual new flashes are separate,
  // sharp strikes (see SonicEngine.strike).
  { name: 'rumble', source: 'noise', filter: 'lowpass', octave: -1, q: 0.9, pitchFilter: true, brightMul: 1, peak: 3.2 },
];

/** Strikes per second for one voice from the share of new dots on its arc (fixed curve). */
export function strikeRate(newLevel, maxRate = 8) {
  if (!(newLevel > 0)) return 0;
  return Math.min(maxRate, maxRate * Math.sqrt(newLevel / 0.02));
}

export { LIGHT_FLOOR };
