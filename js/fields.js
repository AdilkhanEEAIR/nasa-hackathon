import { lonLatToPixel } from './geo.js';

export const LIGHT_FLOOR = 45;

export function lightLevel(r, g, b) {
  const m = Math.max(r, g, b);
  return m <= LIGHT_FLOOR ? 0 : Math.min(1, (m - LIGHT_FLOOR) / (255 - LIGHT_FLOOR));
}

export function buildField(rgba, width, height, valueFn, lon0 = -180) {
  const values = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < values.length; i++, p += 4) {
    values[i] = Math.round(255 * valueFn(rgba[p], rgba[p + 1], rgba[p + 2]));
  }
  return { width, height, lon0, values };
}

export function buildMask(rgba, width, height, lon0 = -180) {
  return buildField(rgba, width, height, (r) => (r >= 128 ? 1 : 0), lon0);
}

export function sampleField(field, lat, lon, r = 1) {
  const { x, y } = lonLatToPixel(lat, lon, field);
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  const { width: w, height: h, values } = field;
  let sum = 0;
  let n = 0;
  for (let dy = -r; dy <= r; dy++) {
    const yy = Math.min(h - 1, Math.max(0, cy + dy));
    for (let dx = -r; dx <= r; dx++) {
      const xx = (((cx + dx) % w) + w) % w;
      sum += values[yy * w + xx];
      n++;
    }
  }
  return sum / n / 255;
}

export function meanOver(field, points, r = 1) {
  if (!points.length) return 0;
  let s = 0;
  for (const p of points) s += sampleField(field, p.lat, p.lon, r);
  return s / points.length;
}

export const ARC_FULL_SCALE = 0.08;

export function gainForLevel(level, full = ARC_FULL_SCALE) {
  if (!(level > 0)) return 0;
  return Math.min(1, level / full) ** 0.7;
}
