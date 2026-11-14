// Musical mapping: direction -> pitch and stereo position, value -> pentatonic degree.
// A major pentatonic scale has no semitone clashes, so any set of simultaneous ring voices
// stays consonant no matter what the data does.

export const PENTATONIC = [0, 2, 4, 7, 9];
export const BASE_FREQ = 196; // G3: low enough to stay calm, high enough for laptop speakers

/** Frequency of scale degree `deg` (0 = base, 5 = one octave up, ...). */
export function degreeToFreq(deg, base = BASE_FREQ) {
  const d = Math.max(0, Math.round(deg));
  const octave = Math.floor(d / PENTATONIC.length);
  const semis = 12 * octave + PENTATONIC[d % PENTATONIC.length];
  return base * 2 ** (semis / 12);
}

/**
 * North sounds high, south low, east and west in the middle: the degree follows the
 * north-south component (cos of bearing) of the ring point.
 */
export function degreeForBearing(bearingDeg, degrees = 9) {
  const c = Math.cos((bearingDeg * Math.PI) / 180);
  return Math.round(((c + 1) / 2) * (degrees - 1));
}

/** West in the left ear, east in the right: pan follows the east-west component. */
export function panForBearing(bearingDeg, width = 0.9) {
  const p = Math.sin((bearingDeg * Math.PI) / 180) * width;
  return Math.abs(p) < 1e-9 ? 0 : p;
}

/**
 * Fixed logarithmic scale from a regional brightness index to a degree. It is identical for
 * every year and region, so a higher note always means a brighter rendered map.
 */
// Tuned on the 2012-2023 frames: regional means span about 0.002 (Central Asia) to 0.017
// (Western Europe), so this range spreads real regions over the full 3 octaves.
export const INDEX_FLOOR = 0.001;
export const INDEX_CEIL = 0.03;
export const INDEX_DEGREES = 15;

export function degreeForIndex(index) {
  if (!(index > INDEX_FLOOR)) return 0;
  const t = Math.log(index / INDEX_FLOOR) / Math.log(INDEX_CEIL / INDEX_FLOOR);
  return Math.round(Math.max(0, Math.min(1, t)) * (INDEX_DEGREES - 1));
}
