export const PENTATONIC = [0, 2, 4, 7, 9];
export const BASE_FREQ = 196;

export function degreeToFreq(deg, base = BASE_FREQ) {
  const d = Math.max(0, Math.round(deg));
  const octave = Math.floor(d / PENTATONIC.length);
  const semis = 12 * octave + PENTATONIC[d % PENTATONIC.length];
  return base * 2 ** (semis / 12);
}

export function degreeForBearing(bearingDeg, degrees = 9) {
  const c = Math.cos((bearingDeg * Math.PI) / 180);
  return Math.round(((c + 1) / 2) * (degrees - 1));
}

export function panForBearing(bearingDeg, width = 0.9) {
  const p = Math.sin((bearingDeg * Math.PI) / 180) * width;
  return Math.abs(p) < 1e-9 ? 0 : p;
}

export const INDEX_FLOOR = 0.001;
export const INDEX_CEIL = 0.03;
export const INDEX_DEGREES = 15;

export function degreeForIndex(index) {
  if (!(index > INDEX_FLOOR)) return 0;
  const t = Math.log(index / INDEX_FLOOR) / Math.log(INDEX_CEIL / INDEX_FLOOR);
  return Math.round(Math.max(0, Math.min(1, t)) * (INDEX_DEGREES - 1));
}
