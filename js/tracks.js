// Per-track rules: how a rendered pixel becomes values, and which instruments play them.
// Pure functions only (no DOM, no audio), so they are unit-tested.

import { LIGHT_FLOOR, ARC_FULL_SCALE } from './fields.js';
import { DEFAULT_LAYERS } from './audio.js';

/** The dominant class of a set of levels, or null if all are zero. */
export function dominant(levels) {
  let best = null;
  let max = 0;
  for (const [k, v] of Object.entries(levels)) {
    if (v > max) { max = v; best = k; }
  }
  return best;
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

export const AEROSOL_COLORS = { smoke: '--data-smoke', dust: '--data-dust', salt: '--data-salt', sulfate: '--data-sulfate' };

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

/**
 * Five fixed temperature bands, each with its own character. Moving up the scale adds
 * harmonics (sine -> triangle -> sawtooth), opens the filter and speeds up the shimmer, so
 * temperature is heard as a change of instrument, not only as brightness. Band centres in
 * deg C; a voice between two centres blends the two neighbouring bands.
 */
export const OCEAN_BANDS = [
  { name: 'ice', centre: 0, label: 'ice-cold' },
  { name: 'cold', centre: 6, label: 'cold' },
  { name: 'mild', centre: 14, label: 'mild' },
  { name: 'warm', centre: 22, label: 'warm' },
  { name: 'hot', centre: 29, label: 'hot' },
];

// Shared by every band: the voice glides (pitch and filter) at a depth set by how dense the
// current lines are on the arc, so busy currents are heard as moving water.
const OCEAN_GLIDE = { rate: 0.35, rateBoost: 2.5, cents: 28, filterCents: 900 };

export const OCEAN_LAYERS = [
  // Ice: a pure sine (one partial), the slowest shimmer.
  { name: 'ice', type: 'sine', octave: 0, cutoffLo: 2000, cutoffHi: 2000, peak: 1.0, tremolo: { rate: 0.7, depth: 0.3 }, glide: OCEAN_GLIDE },
  // Cold: a soft, hollow triangle with few harmonics, dark filter.
  { name: 'cold', type: 'triangle', octave: 0, cutoffLo: 700, cutoffHi: 900, peak: 0.9, tremolo: { rate: 1.6, depth: 0.3 } },
  // Mild: a square wave (odd harmonics), half-open filter, moderate shimmer.
  { name: 'mild', type: 'square', octave: 0, cutoffLo: 1300, cutoffHi: 1800, peak: 0.75, tremolo: { rate: 3, depth: 0.4 } },
  // Warm: a sawtooth (all harmonics), open filter, faster flicker.
  { name: 'warm', type: 'sawtooth', octave: 0, cutoffLo: 3000, cutoffHi: 4000, peak: 1.3, tremolo: { rate: 5, depth: 0.5 } },
  // Hot: a bright sawtooth an octave up, filter wide open, rapid flicker.
  { name: 'hot', type: 'sawtooth', octave: 1, cutoffLo: 6000, cutoffHi: 8000, peak: 1.45, tremolo: { rate: 8.5, depth: 0.6 } },
];

/** Blend weights (0..1, summing to 1) of the five bands for a temperature in deg C. */
export function oceanBandWeights(t) {
  const out = Object.fromEntries(OCEAN_BANDS.map((b) => [b.name, 0]));
  if (t === null || t === undefined) return out;
  const c = OCEAN_BANDS.map((b) => b.centre);
  if (t <= c[0]) { out.ice = 1; return out; }
  if (t >= c[c.length - 1]) { out.hot = 1; return out; }
  for (let i = 0; i < c.length - 1; i++) {
    if (t <= c[i + 1]) {
      const f = (t - c[i]) / (c[i + 1] - c[i]);
      out[OCEAN_BANDS[i].name] = 1 - f;
      out[OCEAN_BANDS[i + 1].name] = f;
      break;
    }
  }
  return out;
}

/** The band a temperature belongs to (nearest centre), for words and legends. */
export function oceanBand(t) {
  if (t === null || t === undefined) return null;
  let best = OCEAN_BANDS[0];
  for (const b of OCEAN_BANDS) if (Math.abs(t - b.centre) < Math.abs(t - best.centre)) best = b;
  return best;
}

// Density of current lines over open water, mapped to motion 0..1 between these fixed limits
// (measured on the frame: 16-px blocks range 0.05..0.8, median 0.39).
export const OCEAN_CALM = 0.25;
export const OCEAN_DENSE = 0.75;
// Share of an arc that must be sea for full loudness.
export const OCEAN_FULL_WATER = 0.6;

/**
 * Ring voice -> sound for the ocean track, all on fixed scales:
 *   loudness   = share of sea on the arc (land is silent);
 *   instrument = temperature band (0..32 deg C, read from the colorbar), blended between bands;
 *   motion     = density of current lines on the sea part of the arc -> glide depth and speed.
 */
export function oceanVoice(v) {
  const cover = v.levels.cover || 0;
  const t = oceanTemp(cover, v.levels.temp || 0);
  if (t === null) return { gains: oceanBandWeights(null), brightness: 0, land: 0, temp: null, motion: 0 };
  const water = Math.max(0, 1 - (v.land || 0));
  const loud = Math.min(1, Math.max(water, cover) / OCEAN_FULL_WATER) ** 0.7;
  const w = oceanBandWeights(t);
  const gains = Object.fromEntries(Object.entries(w).map(([k, x]) => [k, x * loud]));
  const density = cover / Math.max(0.1, water);
  const motion = Math.max(0, Math.min(1, (density - OCEAN_CALM) / (OCEAN_DENSE - OCEAN_CALM)));
  return { gains, brightness: t / OCEAN_RANGE_C, land: 0, temp: t, motion };
}

export function describeTemp(t) {
  if (t === null || t === undefined) return 'no ocean flow here';
  return `sea surface about ${Math.round(t)} degrees Celsius, ${oceanBand(t).label}`;
}

/**
 * Near-surface wind (SVS 5148, GEOS-FP, 29 Oct 2026 09:00 UTC). The lossless grid written by
 * tools/prepare_media.py holds R = speed 0..40 m/s (read from the colorbar by nearest colour),
 * G = 255 where a speed was read, B = 255 where the frame has no data (logos, date box).
 * Calm air below 3.6 m/s is left uncoloured on the map, so it reads as 0; the grey
 * hurricane-force end of the scale cannot be told from the base map, so readings stop at 34.
 */
export const WIND_RANGE_MS = 40;

export function windFields(img, lon0 = -180) {
  const { width, height, data } = img;
  const speed = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < speed.length; i++, p += 4) if (data[p + 1] > 127) speed[i] = data[p];
  return { speed: { width, height, lon0, values: speed } };
}

export const WIND_LAYERS = [
  // Rushing air: band-passed noise on the compass pitch; stronger wind opens it up and lifts it.
  { name: 'gust', source: 'noise', filter: 'bandpass', octave: 0, q: 1.1, pitchFilter: true, brightMul: 5, peak: 3.0 },
  // A narrow whistle that only appears in strong wind (above about 12 m/s).
  { name: 'whistle', source: 'noise', filter: 'bandpass', octave: 2, q: 14, pitchFilter: true, brightMul: 1.5, peak: 7 },
];

// Mean wind on an arc heard at full loudness (calm parts of the arc count as 0 m/s).
export const WIND_FULL_MS = 18;

/** Ring voice -> sound for the wind track: loudness, brightness and whistle all follow speed. */
export function windVoice(v) {
  const ms = (v.levels.speed || 0) * WIND_RANGE_MS;
  const gain = ms > 0 ? Math.min(1, ms / WIND_FULL_MS) ** 0.7 : 0;
  const whistle = Math.max(0, Math.min(1, (ms - 12) / 10));
  return { gains: { gust: gain, whistle: gain * whistle }, brightness: Math.min(1, ms / 25), land: 0, windMs: ms };
}

export function describeWind(ms) {
  if (!(ms > 0.5)) return 'calm, or below 4 metres per second';
  const word = ms < 8 ? 'light' : ms < 14 ? 'fresh' : ms < 20 ? 'strong' : 'gale-force';
  return `${word} wind, about ${Math.round(ms)} metres per second`;
}

/**
 * Air quality (SVS 5533, GEOS-CF, first frame of the July-August 2024 run). One world map cut
 * into vertical strips of ~50 deg longitude, each coloured for a different pollutant (CO,
 * PM2.5, NOx, ozone). Visual class: R = darkness within the strip's own ramp (darker = more of
 * that pollutant in the picture; strips are not comparable with each other), G = strip id
 * (1 CO, 2 PM2.5, 3 NOx, 4 ozone, which stays silent), B = 255 on the label boxes.
 */
export const AIR_KINDS = { 1: 'carbon monoxide', 2: 'fine particles (PM2.5)', 3: 'nitrogen oxides', 4: 'ozone' };

export const AIR_LAYERS = [
  // Hoarse, dirty air: a low sawtooth roughened by fast amplitude wobble (~27 Hz reads as
  // rasp, not as a rhythm); darker strips open the filter.
  { name: 'main', type: 'sawtooth', octave: -1, cutoffLo: 450, cutoffHi: 2600, peak: 1.0, tremolo: { rate: 27, depth: 0.75 } },
];

/** The pollutant strip at a pixel column of the air-quality frame. */
export function airKindAt(lon, strips) {
  const x = ((((lon + 180) % 360) + 360) % 360) / 360 * strips.edges[strips.edges.length - 1];
  for (let i = 0; i < strips.kinds.length; i++) if (x < strips.edges[i + 1]) return strips.kinds[i];
  return strips.kinds[strips.kinds.length - 1];
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

/**
 * Centre presets per track (keys 1-5). Each set sits where its own data has contrast: lit
 * cities for night lights, plumes for aerosols, storm hot spots for lightning and strong
 * temperature fronts for the ocean (the shared land presets left half of an ocean ring silent).
 */
export const TRACK_PRESETS = {
  nightlights: [
    { key: '1', name: 'India', lat: 22.5, lon: 79.0, radiusKm: 1500 },
    { key: '2', name: 'China', lat: 32.0, lon: 110.0, radiusKm: 2000 },
    { key: '3', name: 'Bishkek', lat: 42.87, lon: 74.59, radiusKm: 1500 },
    { key: '4', name: 'Europe', lat: 48.5, lon: 9.0, radiusKm: 1500 },
  ],
  aerosols: [
    { key: '1', name: 'Sahara dust', lat: 18, lon: 2, radiusKm: 1500 },
    { key: '2', name: 'Central Africa fires', lat: -9, lon: 22, radiusKm: 1500 },
    { key: '3', name: 'East China', lat: 32, lon: 114, radiusKm: 1500 },
    { key: '4', name: 'Indian Ocean sea salt', lat: -15, lon: 65, radiusKm: 1500 },
  ],
  lightning: [
    { key: '1', name: 'Congo Basin', lat: 0, lon: 22, radiusKm: 2000 },
    { key: '2', name: 'Lake Maracaibo', lat: 9.8, lon: -71.6, radiusKm: 1200 },
    { key: '3', name: 'Florida', lat: 28, lon: -82, radiusKm: 1200 },
    { key: '4', name: 'Bangladesh', lat: 24, lon: 90, radiusKm: 1500 },
  ],
  wind: [
    { key: '1', name: 'North Atlantic storm', lat: 60, lon: -36, radiusKm: 1200 },
    { key: '2', name: 'West Pacific typhoon', lat: 17, lon: 152, radiusKm: 1000 },
    { key: '3', name: 'Southern Ocean westerlies', lat: -52, lon: 22, radiusKm: 1500 },
    { key: '4', name: 'Equatorial calm', lat: 2, lon: -25, radiusKm: 1500 },
  ],
  forest: [],
  co2: [],
  air: [
    { key: '1', name: 'Central Africa fires (CO strip)', lat: -8, lon: 33, radiusKm: 1100 },
    { key: '2', name: 'South Asia haze (PM2.5 strip)', lat: 27, lon: 90, radiusKm: 1000 },
    { key: '3', name: 'Canadian fire smoke (PM2.5 strip)', lat: 60, lon: -110, radiusKm: 1000 },
    { key: '4', name: 'Japan (NOx strip)', lat: 36, lon: 139, radiusKm: 900 },
  ],
  ocean: [
    { key: '1', name: 'Gulf Stream', lat: 38, lon: -68, radiusKm: 1200 },
    { key: '2', name: 'Kuroshio', lat: 35, lon: 145, radiusKm: 1200 },
    { key: '3', name: 'Agulhas Current', lat: -38, lon: 24, radiusKm: 1200 },
    { key: '4', name: 'Equatorial Pacific', lat: 0, lon: -120, radiusKm: 1500 },
    { key: '5', name: 'Southern Ocean front', lat: -52, lon: 140, radiusKm: 1200 },
  ],
};

/**
 * Sound settings per track, shared by the player (js/app.js) and the offline sound report
 * (tools/sound_report.mjs): instruments, the arc level heard at full loudness, the loudness
 * trim and, where needed, how arc values become a voice.
 */
export const TRACK_SOUND = {
  nightlights: { layers: DEFAULT_LAYERS, fullScale: ARC_FULL_SCALE, trim: 1 },
  aerosols: { layers: AEROSOL_LAYERS, fullScale: 0.6, trim: 0.9 },
  // Open ocean fills every voice at once: measured RMS 0.13-0.18 before trim, ~0.09 after.
  ocean: { layers: OCEAN_LAYERS, fullScale: ARC_FULL_SCALE, trim: 0.55, mapVoice: (v) => oceanVoice(v) },
  wind: { layers: WIND_LAYERS, fullScale: ARC_FULL_SCALE, trim: 1.0, mapVoice: (v) => windVoice(v) },
  forest: { layers: DEFAULT_LAYERS, fullScale: ARC_FULL_SCALE, trim: 1.0 },
  co2: { layers: DEFAULT_LAYERS, fullScale: ARC_FULL_SCALE, trim: 1.0 },
  air: { layers: AIR_LAYERS, fullScale: 0.6, trim: 0.65 },
};

/**
 * Two classes of track, shown in the list and said in each intro:
 *   data   - values are read back from the visualization's own colour scale (Data-true);
 *   visual - the picture itself is sonified (brightness, hue, motion), not calibrated
 *            measurements.
 */
export const TRACK_CLASS = { nightlights: 'data', aerosols: 'data', lightning: 'data', ocean: 'data', wind: 'data', forest: 'visual', co2: 'visual', air: 'visual' };

/** Needle tracks play a rotating globe: no map centre, no presets, no ring. */
export const NEEDLE_TRACKS = new Set(['forest', 'co2']);
