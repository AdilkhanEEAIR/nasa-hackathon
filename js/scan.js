// The shrinking-ring sonar: a ring starts far from the chosen centre and contracts onto it.
// Each of the 16 voices listens to one arc of the ring, so direction is heard as pitch
// (north high, south low) and stereo position (west left, east right), and the data value on
// that arc is heard as loudness and brightness.

import { ringArcs } from './geo.js';
import { sampleField, gainForLevel, ARC_FULL_SCALE } from './fields.js';
import { panForBearing } from './music.js';
import { SonicEngine } from './audio.js';
import { encodeWav } from './wav.js';

export const VOICES = 16;
export const STEP_HZ = 30;

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

/**
 * Four tactile directions (N, E, S, W) from the 16 voices: each motor follows the strongest
 * voice on its side of the ring, weighted by how squarely it faces that direction. A maximum
 * (not a mean) keeps a single bright city to the east clearly felt instead of diluted.
 * These are the values the controller's vibration motors will receive.
 */
export function motorLevels(ring) {
  const dirs = { n: 0, e: 90, s: 180, w: 270 };
  const out = {};
  for (const [name, deg] of Object.entries(dirs)) {
    let m = 0;
    for (const v of ring) {
      const w = Math.max(0, Math.cos(((v.bearing - deg) * Math.PI) / 180));
      m = Math.max(m, w * v.gain);
    }
    out[name] = m;
  }
  return out;
}

/** Feeds one ring reading to an engine at time `when`; returns the land state for clicks. */
function applyRing(engine, ring, prevLand, coastClicks, when) {
  const landNow = ring.map((v) => v.land >= 0.5);
  ring.forEach((v, k) => {
    engine.setVoice(k, { gain: v.gain, brightness: Math.min(1, v.level / ARC_FULL_SCALE), land: v.land }, when);
    if (coastClicks && prevLand && prevLand[k] !== landNow[k]) engine.click(panForBearing(v.bearing), when);
  });
  return landNow;
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
      const t = Math.min(1, (performance.now() - this.t0) / (this.durationS * 1000));
      const r = this.radiusKm * (1 - t);
      const ring = readRing(this.field, this.landField, this.center, r);
      this.prevLand = applyRing(this.engine, ring, this.prevLand, this.coastClicks, this.engine.now);
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
    this._timer = setInterval(tick, 1000 / STEP_HZ);
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

/**
 * Renders a complete scan offline with the same engine and the same step rate as the live
 * scan, and returns a WAV file as an ArrayBuffer.
 */
export async function renderScanWav({ field, landField, center, radiusKm, durationS, coastClicks = true, volume = 0.8 }) {
  const sampleRate = 44100;
  const tail = 2.4; // let the centre note and the reverb ring out
  const ctx = new OfflineAudioContext(2, Math.ceil((durationS + tail) * sampleRate), sampleRate);
  const engine = new SonicEngine(VOICES);
  engine.volume = volume;
  engine.attach(ctx, { offline: true });
  const steps = Math.ceil(durationS * STEP_HZ);
  let prevLand = null;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const ring = readRing(field, landField, center, radiusKm * (1 - t));
    prevLand = applyRing(engine, ring, prevLand, coastClicks, t * durationS);
  }
  engine.silenceVoices(durationS);
  engine.centreNote(sampleField(field, center.lat, center.lon, 1), durationS);
  const buffer = await ctx.startRendering();
  return encodeWav([buffer.getChannelData(0), buffer.getChannelData(1)], sampleRate);
}
