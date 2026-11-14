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
  { name: 'less', type: 'sawtooth', octave: -1, cutoffLo: 450, cutoffHi: 1100, peak: 1 },
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

export { LIGHT_FLOOR };
