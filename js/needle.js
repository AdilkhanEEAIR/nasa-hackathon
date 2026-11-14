// Needle mode for rotating-globe visualizations (Visual class: it sonifies the picture, not
// calibrated measurements). A fixed vertical needle runs down the middle of the globe while
// the planet turns under it. Every tick the needle reads its column of pixels from top
// (north, high notes) to bottom (south, low notes) in 16 segments; where a segment shows the
// phenomenon, a short note sounds at that segment's pitch, louder and more often for more of
// it, and a point on the needle flashes. Silence where the needle crosses ocean or space.

import { degreeToFreq } from './music.js';

export const NEEDLE_SEGMENTS = 16;
const SAMPLE_ROWS = 192;          // pixels read along the needle per tick
const MAX_NOTES_PER_S = 24;       // keeps dense continents legible

/**
 * GEDI forest height (SVS 4950) as shown on the globe: brown/dark green = short vegetation,
 * bright green to white = tall. Brightness of non-blue, non-black pixels stands for "taller in
 * the picture". Ocean (blue) and space (black) read 0.
 */
export function forestValue(r, g, b) {
  const m = Math.max(r, g, b);
  if (m < 40) return 0;                       // space, deep shadow
  if (b > r + 15 && b >= g - 5) return 0;     // ocean
  return Math.max(0, Math.min(1, (Math.max(r, g) - 60) / 170));
}

/**
 * DYAMOND CO2 (SVS 5196) as shown on the globe: CO2 plumes are drawn yellow to orange to red
 * over a grey/white land base and a black ocean. "Warmth" of the colour (red minus blue)
 * stands for "more CO2 in the picture"; greys, whites and black read 0.
 */
export function co2Value(r, g, b) {
  if (Math.max(r, g, b) < 30 || g > r + 10) return 0;
  return Math.max(0, Math.min(1, (r - b - 25) / 130));
}

/** Mean value per segment (top = 0) from an RGBA column read top to bottom. */
export function needleSegments(rgba, rows, valueFn, n = NEEDLE_SEGMENTS) {
  const out = new Float32Array(n);
  const per = rows / n;
  for (let k = 0; k < n; k++) {
    let sum = 0;
    let cnt = 0;
    for (let y = Math.floor(k * per); y < Math.floor((k + 1) * per); y++, cnt++) {
      const p = y * 4;
      sum += valueFn(rgba[p], rgba[p + 1], rgba[p + 2]);
    }
    out[k] = cnt ? sum / cnt : 0;
  }
  return out;
}

/** Mean value per segment down one column of a still's value grid (0..255 per pixel). */
export function fieldSegments(field, x, y0, y1, n = NEEDLE_SEGMENTS) {
  const { width, height, values } = field;
  const col = Math.min(width - 1, Math.max(0, Math.round(x * width)));
  const top = Math.round(y0 * height);
  const span = Math.round((y1 - y0) * height);
  const out = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    let sum = 0;
    let cnt = 0;
    for (let y = top + Math.floor((k * span) / n); y < top + Math.floor(((k + 1) * span) / n); y++, cnt++) {
      for (let dx = -1; dx <= 1; dx++) sum += values[y * width + Math.min(width - 1, Math.max(0, col + dx))] / 255;
    }
    out[k] = cnt ? sum / (cnt * 3) : 0;
  }
  return out;
}

/** Pitch for a segment: top of the needle (north) is the highest compass degree. */
export function segmentFreq(k, n = NEEDLE_SEGMENTS) {
  return degreeToFreq(14 - Math.round((k * 14) / (n - 1)));
}

/** Time between notes on one segment: more of the phenomenon, quicker notes (fixed curve). */
export function noteInterval(value) {
  return 650 - 470 * Math.min(1, value);
}

export class NeedleScan {
  constructor(engine, { onStep } = {}) {
    this.engine = engine;
    this.onStep = onStep;
    this.running = false;
    this._timer = 0;
    this._canvas = document.createElement('canvas');
    this._canvas.width = 2;
    this._canvas.height = SAMPLE_ROWS;
    this._ctx = this._canvas.getContext('2d', { willReadFrequently: true });
  }

  /**
   * Two sources:
   *   video  a turning globe; the needle stays at geom.x and the picture moves under it;
   *   field  a still frame's precomputed value grid; the needle sweeps from geom.x0 to
   *          geom.x1 over `durationS` (a still has no motion of its own), then stops.
   * `geom` holds the needle's top and bottom (y0, y1) as fractions of the frame.
   */
  start({ video = null, field = null, geom, valueFn, voice = 'wood', slow = 1, durationS = 8, onEnd = null }) {
    this.stop();
    Object.assign(this, { video, field, geom, valueFn, voice, slow, durationS, onEnd });
    this.last = new Float64Array(NEEDLE_SEGMENTS);
    this.running = true;
    this._noteTimes = [];
    const t0 = performance.now();
    const tick = () => {
      if (!this.running) return;
      let seg;
      let x = geom.x;
      if (field) {
        const t = Math.min(1, (performance.now() - t0) / (durationS * 1000));
        x = geom.x0 + (geom.x1 - geom.x0) * t;
        seg = fieldSegments(field, x, geom.y0, geom.y1);
        if (t >= 1) {
          this.stop();
          if (this.onEnd) this.onEnd();
          return;
        }
      } else {
        if (video.readyState < 2) return;
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        this._ctx.drawImage(video, geom.x * vw - 1, geom.y0 * vh, 2, (geom.y1 - geom.y0) * vh, 0, 0, 2, SAMPLE_ROWS);
        seg = needleSegments(this._ctx.getImageData(0, 0, 1, SAMPLE_ROWS).data, SAMPLE_ROWS, valueFn);
      }
      const now = performance.now();
      this._noteTimes = this._noteTimes.filter((t) => now - t < 1000);
      const struck = [];
      seg.forEach((v, k) => {
        if (v < 0.12 || now - this.last[k] < noteInterval(v) * this.slow || this._noteTimes.length >= MAX_NOTES_PER_S) return;
        this.last[k] = now;
        this._noteTimes.push(now);
        this.engine.pluck(segmentFreq(k), 0.25 + 0.6 * Math.min(1, v), this.voice);
        struck.push(k);
      });
      if (this.onStep) this.onStep({ segments: seg, struck, x });
    };
    this._timer = setInterval(tick, 1000 / 30);
  }

  stop() {
    this.running = false;
    clearInterval(this._timer);
  }
}
