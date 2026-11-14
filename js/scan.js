// The shrinking-ring sonar: a ring starts far from the chosen centre and contracts onto it.
// Each of the 16 voices listens to one arc of the ring, so direction is heard as pitch
// (north high, south low) and stereo position (west left, east right), and the data value on
// that arc is heard as loudness and brightness.

import { ringArcs } from './geo.js';
import { sampleField, gainForLevel, ARC_FULL_SCALE } from './fields.js';
import { panForBearing } from './music.js';

export const VOICES = 16;

/** Pure part of a scan step: values for every voice at one radius. */
export function readRing(field, landField, center, radiusKm) {
  const arcs = ringArcs(center, Math.max(radiusKm, 1), VOICES);
  return arcs.map((arc) => {
    let level = 0;
    let land = 0;
    for (const p of arc.points) {
      level += sampleField(field, p.lat, p.lon, 1);
      if (landField) land += sampleField(landField, p.lat, p.lon, 0);
    }
    level /= arc.points.length;
    land /= arc.points.length;
    return { bearing: arc.bearing, points: arc.points, level, land, gain: gainForLevel(level) };
  });
}

export class RingScan {
  constructor(engine, { onStep, onEnd } = {}) {
    this.engine = engine;
    this.onStep = onStep;
    this.onEnd = onEnd;
    this.running = false;
    this.coastClicks = true;
    this._timer = 0;
  }

  /** `field` and `landField` are value grids (see fields.js); radius in km, duration in s. */
  start({ field, landField, center, radiusKm, durationS = 8 }) {
    this.stop(false);
    this.field = field;
    this.landField = landField;
    this.center = center;
    this.radiusKm = radiusKm;
    this.durationS = durationS;
    this.t0 = performance.now();
    this.prevLand = null;
    this.running = true;
    // A timer rather than requestAnimationFrame: the sound must keep going when the page is
    // not visible (screen-reader users often have no reason to keep the window in front).
    const tick = () => {
      if (!this.running) return;
      const now = performance.now();
      const t = Math.min(1, (now - this.t0) / (this.durationS * 1000));
      const r = this.radiusKm * (1 - t);
      const ring = readRing(this.field, this.landField, this.center, r);
      ring.forEach((v, k) => {
        this.engine.setVoice(k, { gain: v.gain, brightness: Math.min(1, v.level / ARC_FULL_SCALE), land: v.land });
        const onLand = v.land >= 0.5;
        if (this.coastClicks && this.prevLand && this.prevLand[k] !== onLand) {
          this.engine.click(panForBearing(v.bearing));
        }
      });
      this.prevLand = ring.map((v) => v.land >= 0.5);
      if (this.onStep) this.onStep({ t, radiusKm: r, ring });
      if (t >= 1) {
        this.running = false;
        clearInterval(this._timer);
        this.engine.silenceVoices();
        const centre = sampleField(this.field, this.center.lat, this.center.lon, 1);
        this.engine.centreNote(centre);
        if (this.onEnd) this.onEnd({ centreLevel: centre, completed: true });
      }
    };
    this._timer = setInterval(tick, 33);
    tick();
  }

  stop(notify = true) {
    const was = this.running;
    this.running = false;
    clearInterval(this._timer);
    this.engine.silenceVoices();
    if (was && notify && this.onEnd) this.onEnd({ completed: false });
  }
}
