import { LIGHT_FLOOR, ARC_FULL_SCALE } from './fields.js';
import { DEFAULT_LAYERS } from './audio.js';

export function dominant(levels) {
  let best = null;
  let max = 0;
  for (const [k, v] of Object.entries(levels)) {
    if (v > max) { max = v; best = k; }
  }
  return best;
}

export const AEROSOL_CLASSES = ['smoke', 'dust', 'salt', 'sulfate'];

export const AEROSOL_LAYERS = [
  { name: 'smoke', source: 'crackle', filter: 'lowpass', octave: 3, q: 0.8, pitchFilter: true, brightMul: 1.5, peak: 2.95 },
  { name: 'dust', source: 'noise', filter: 'bandpass', octave: 4, q: 1.6, pitchFilter: true, brightMul: 0.4, peak: 3.7 },
  { name: 'salt', source: 'surf', filter: 'lowpass', octave: 2, q: 0.5, pitchFilter: true, brightMul: 0.8, peak: 4.2 },
  { name: 'sulfate', type: 'square', octave: 0, cutoffLo: 500, cutoffHi: 1800, peak: 0.65 },
];

export const AEROSOL_COLORS = { smoke: '--data-smoke', dust: '--data-dust', salt: '--data-salt', sulfate: '--data-sulfate' };

export const AEROSOL_NAMES = { smoke: 'smoke and black carbon', dust: 'dust', salt: 'sea salt', sulfate: 'sulfate' };

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

export function oceanTemp(coverMean, tempMean) {
  return coverMean > 0.02 ? (tempMean / coverMean) * OCEAN_RANGE_C : null;
}

export const OCEAN_BANDS = [
  { name: 'ice', centre: 0, label: 'ice-cold' },
  { name: 'cold', centre: 6, label: 'cold' },
  { name: 'mild', centre: 14, label: 'mild' },
  { name: 'warm', centre: 22, label: 'warm' },
  { name: 'hot', centre: 29, label: 'hot' },
];

const OCEAN_GLIDE = { rate: 0.35, rateBoost: 2.5, cents: 28, filterCents: 900 };

export const OCEAN_LAYERS = [
  { name: 'ice', type: 'sine', octave: -1, cutoffLo: 320, cutoffHi: 320, peak: 0.95, smooth: 0.5, glide: OCEAN_GLIDE },
  { name: 'cold', type: 'triangle', octave: -1, cutoffLo: 520, cutoffHi: 650, peak: 0.8, smooth: 0.5 },
  { name: 'mild', type: 'triangle', octave: 0, cutoffLo: 1300, cutoffHi: 1700, peak: 1.0, smooth: 0.45, tremolo: { rate: 0.45, depth: 0.35 } },
  { name: 'warm', type: 'sine', octave: 1, cutoffLo: 5000, cutoffHi: 6000, peak: 0.95, smooth: 0.4, tremolo: { rate: 3.5, depth: 0.25 } },
  { name: 'hot', type: 'triangle', octave: 1, cutoffLo: 6500, cutoffHi: 8000, peak: 0.9, smooth: 0.4, tremolo: { rate: 6, depth: 0.3 } },
  { name: 'tension', type: 'sine', octave: 1, detune: 40, cutoffLo: 6000, cutoffHi: 6000, peak: 0.6, smooth: 0.4 },
];

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

export function oceanBand(t) {
  if (t === null || t === undefined) return null;
  let best = OCEAN_BANDS[0];
  for (const b of OCEAN_BANDS) if (Math.abs(t - b.centre) < Math.abs(t - best.centre)) best = b;
  return best;
}

export const OCEAN_CALM = 0.25;
export const OCEAN_DENSE = 0.75;
export const OCEAN_FULL_WATER = 0.6;

export function oceanVoice(v) {
  const cover = v.levels.cover || 0;
  const t = oceanTemp(cover, v.levels.temp || 0);
  if (t === null) return { gains: oceanBandWeights(null), brightness: 0, land: 0, temp: null, motion: 0 };
  const water = Math.max(0, 1 - (v.land || 0));
  const loud = Math.min(1, Math.max(water, cover) / OCEAN_FULL_WATER) ** 0.7;
  const w = oceanBandWeights(t);
  const gains = Object.fromEntries(Object.entries(w).map(([k, x]) => [k, x * loud]));
  gains.tension = loud * Math.max(0, Math.min(1, (t - HOTTEST_C + 0.5) / 1.5));
  const density = cover / Math.max(0.1, water);
  const motion = Math.max(0, Math.min(1, (density - OCEAN_CALM) / (OCEAN_DENSE - OCEAN_CALM)));
  return { gains, brightness: t / OCEAN_RANGE_C, land: 0, temp: t, motion };
}

export const HOTTEST_C = 30;

export function describeTemp(t) {
  if (t === null || t === undefined) return 'no ocean flow here';
  const label = t >= HOTTEST_C ? 'hottest water' : oceanBand(t).label;
  return `sea surface about ${Math.round(t)} degrees Celsius, ${label}`;
}

export const WIND_RANGE_MS = 40;

export function windFields(img, lon0 = -180) {
  const { width, height, data } = img;
  const speed = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < speed.length; i++, p += 4) if (data[p + 1] > 127) speed[i] = data[p];
  return { speed: { width, height, lon0, values: speed } };
}

export const WIND_LAYERS = [
  { name: 'gust', source: 'noise', filter: 'bandpass', octave: 0, q: 1.1, pitchFilter: true, brightMul: 5, peak: 3.0 },
  { name: 'whistle', source: 'noise', filter: 'bandpass', octave: 2, q: 14, pitchFilter: true, brightMul: 1.5, peak: 7 },
];

export const WIND_FULL_MS = 18;

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

export function lightningLevel(r, g, b) {
  if (r <= 90 || g <= 70 || b >= g - 40) return 0;
  return Math.min(1, (Math.min(r, g) - b - 40) / 120);
}

export const LIGHTNING_COVERAGE_LAT = 52;

export const LIGHTNING_LAYERS = [
  { name: 'rumble', source: 'noise', filter: 'lowpass', octave: -1, q: 0.9, pitchFilter: true, brightMul: 1, peak: 3.2 },
];

export function strikeRate(newLevel, maxRate = 8) {
  if (!(newLevel > 0)) return 0;
  return Math.min(maxRate, maxRate * Math.sqrt(newLevel / 0.02));
}

export { LIGHT_FLOOR };

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
  river: [],
  currents: [],
  ocean: [
    { key: '1', name: 'Gulf Stream', lat: 38, lon: -68, radiusKm: 1200 },
    { key: '2', name: 'Kuroshio', lat: 35, lon: 145, radiusKm: 1200 },
    { key: '3', name: 'Agulhas Current', lat: -38, lon: 24, radiusKm: 1200 },
    { key: '4', name: 'Equatorial Pacific', lat: 0, lon: -120, radiusKm: 1500 },
    { key: '5', name: 'Southern Ocean front', lat: -52, lon: 140, radiusKm: 1200 },
  ],
};

export const TRACK_SOUND = {
  nightlights: { layers: DEFAULT_LAYERS, fullScale: ARC_FULL_SCALE, trim: 1 },
  aerosols: { layers: AEROSOL_LAYERS, fullScale: 0.6, trim: 0.9 },
  ocean: { layers: OCEAN_LAYERS, fullScale: ARC_FULL_SCALE, trim: 0.55, mapVoice: (v) => oceanVoice(v) },
  wind: { layers: WIND_LAYERS, fullScale: ARC_FULL_SCALE, trim: 1.0, mapVoice: (v) => windVoice(v) },
  forest: { layers: DEFAULT_LAYERS, fullScale: ARC_FULL_SCALE, trim: 1.0 },
  co2: { layers: DEFAULT_LAYERS, fullScale: ARC_FULL_SCALE, trim: 1.0 },
  river: { layers: DEFAULT_LAYERS, fullScale: ARC_FULL_SCALE, trim: 1.0 },
  currents: { layers: DEFAULT_LAYERS, fullScale: ARC_FULL_SCALE, trim: 1.0 },
};

export const TRACK_CLASS = { nightlights: 'data', aerosols: 'data', lightning: 'data', ocean: 'data', wind: 'data', forest: 'visual', co2: 'visual', river: 'visual', currents: 'visual' };

export const NEEDLE_TRACKS = new Set(['forest', 'co2', 'river', 'currents']);
