// Turning rendered frames into value fields, and sampling those fields by latitude/longitude.
// Every threshold here is fixed and shared by all frames of a dataset (no per-frame
// normalisation), so the same sound always means the same pixel value.

import { lonLatToPixel } from './geo.js';

/**
 * Night-lights brightness of one pixel, 0..1. Base-map surfaces never exceed max channel 34
 * (ice), lights start above that; 45 leaves a margin for compression noise.
 */
export const LIGHT_FLOOR = 45;

export function lightLevel(r, g, b) {
  const m = Math.max(r, g, b);
  return m <= LIGHT_FLOOR ? 0 : Math.min(1, (m - LIGHT_FLOOR) / (255 - LIGHT_FLOOR));
}

/** Builds a Uint8 field (0..255) from RGBA pixels with a per-pixel value function (0..1). */
export function buildField(rgba, width, height, valueFn, lon0 = -180) {
  const values = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < values.length; i++, p += 4) {
    values[i] = Math.round(255 * valueFn(rgba[p], rgba[p + 1], rgba[p + 2]));
  }
  return { width, height, lon0, values };
}

/** Land mask field from a black/white PNG (white = land). */
export function buildMask(rgba, width, height, lon0 = -180) {
  return buildField(rgba, width, height, (r) => (r >= 128 ? 1 : 0), lon0);
}

/**
 * Mean field value (0..1) in a (2r+1)^2 pixel box around a geographic point. Columns wrap
 * around the date line; rows clamp at the poles.
 */
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

/** Mean of a field over a list of points. */
export function meanOver(field, points, r = 1) {
  if (!points.length) return 0;
  let s = 0;
  for (const p of points) s += sampleField(field, p.lat, p.lon, r);
  return s / points.length;
}

/**
 * Loudness of a ring voice from the mean light level on its arc. Lights cover only a few
 * percent of land pixels, so the curve rises quickly; the constant is fixed for all years.
 */
// Measured arc means on the preset regions: median ~0.005, 90th percentile 0.006-0.07.
export const ARC_FULL_SCALE = 0.08;

export function gainForLevel(level) {
  if (!(level > 0)) return 0;
  return Math.min(1, level / ARC_FULL_SCALE) ** 0.7;
}
