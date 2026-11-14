import { ringArcs } from './geo.js';
import { sampleField, gainForLevel, ARC_FULL_SCALE } from './fields.js';
import { panForBearing } from './music.js';
import { SonicEngine, DEFAULT_LAYERS } from './audio.js';
import { encodeWav } from './wav.js';

export const VOICES = 16;
export const STEP_HZ = 30;

export function asFieldMap(fields) {
  return fields && fields.values instanceof Uint8Array ? { main: fields } : fields;
}

export function readRing(fields, landField, center, radiusKm, full = ARC_FULL_SCALE) {
  const map = asFieldMap(fields);
  const names = Object.keys(map);
  const arcs = ringArcs(center, Math.max(radiusKm, 1), VOICES);
  return arcs.map((arc) => {
    const levels = Object.fromEntries(names.map((n) => [n, 0]));
    let land = 0;
    for (const p of arc.points) {
      for (const n of names) levels[n] += sampleField(map[n], p.lat, p.lon, 1);
      if (landField) land += sampleField(landField, p.lat, p.lon, 0);
    }
    const gains = {};
    let level = 0;
    let gain = 0;
    for (const n of names) {
      levels[n] /= arc.points.length;
      gains[n] = gainForLevel(levels[n], full);
      level = Math.max(level, levels[n]);
      gain = Math.max(gain, gains[n]);
    }
    land /= arc.points.length;
    return { bearing: arc.bearing, points: arc.points, levels, gains, level, land, gain, full };
  });
}

export function readPoint(fields, lat, lon) {
  const map = asFieldMap(fields);
  return Object.fromEntries(Object.entries(map).map(([n, f]) => [n, sampleField(f, lat, lon, 1)]));
}

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

export const defaultVoice = (v) => ({ gains: v.gains, brightness: Math.min(1, v.level / v.full), land: v.land });

function applyRing(engine, ring, prevLand, coastClicks, when, mapVoice = defaultVoice) {
  const landNow = ring.map((v) => v.land >= 0.5);
  ring.forEach((v, k) => {
    const m = mapVoice(v);
    v.gains = m.gains;
    v.gain = Math.max(0, ...Object.values(m.gains));
    if (m.temp !== undefined) v.temp = m.temp;
    if (m.windMs !== undefined) v.windMs = m.windMs;
    engine.setVoice(k, m, when);
    if (coastClicks && prevLand && prevLand[k] !== landNow[k]) engine.click(panForBearing(v.bearing), when);
  });
  return landNow;
}

function centreOf(fields, center) {
  const levels = readPoint(fields, center.lat, center.lon);
  let kind = null;
  let level = 0;
  for (const [k, v] of Object.entries(levels)) if (v > level) { level = v; kind = k; }
  return { kind, level, levels };
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

  start({ fields, landField, center, radiusKm, durationS = 8, fullScale = ARC_FULL_SCALE, mapVoice = defaultVoice }) {
    this.mapVoice = mapVoice;
    this.stop(false);
    this.fields = fields;
    this.landField = landField;
    this.center = center;
    this.radiusKm = radiusKm;
    this.durationS = durationS;
    this.fullScale = fullScale;
    this.t0 = performance.now();
    this.prevLand = null;
    this.running = true;
    const tick = () => {
      if (!this.running) return;
      const t = Math.min(1, (performance.now() - this.t0) / (this.durationS * 1000));
      const r = this.radiusKm * (1 - t);
      const ring = readRing(this.fields, this.landField, this.center, r, this.fullScale);
      this.prevLand = applyRing(this.engine, ring, this.prevLand, this.coastClicks, this.engine.now, this.mapVoice);
      if (this.onStep) this.onStep({ t, radiusKm: r, ring });
      if (t >= 1) {
        this.running = false;
        clearInterval(this._timer);
        this.engine.silenceVoices();
        const c = centreOf(this.fields, this.center);
        this.engine.centreNote(c.level, this.engine.now, c.kind);
        if (this.onEnd) this.onEnd({ centreLevel: c.level, centreKind: c.kind, completed: true });
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

export class LiveRingScan {
  constructor(engine, { onStep } = {}) {
    this.engine = engine;
    this.onStep = onStep;
    this.running = false;
    this._timer = 0;
  }

  start({ getFrame, center, radiusKm, durationS = 8, fullScale = 0.05, coverageLat = 90, strikeRate, once = false, onEnd = null }) {
    this.stop();
    Object.assign(this, { getFrame, center, radiusKm, durationS, fullScale, coverageLat, strikeRate, once, onEnd });
    this.strikes = new Float32Array(16);
    this.t0 = performance.now();
    this.running = true;
    this._strikesThisSecond = 0;
    this._secondStart = performance.now();
    const tick = () => {
      if (!this.running) return;
      const now = performance.now();
      const raw = (now - this.t0) / (this.durationS * 1000);
      const t = this.once ? Math.min(1, raw) : raw % 1;
      const eased = this.once ? t * t * (3 - 2 * t) : t;
      const r = Math.max(1, this.radiusKm * (1 - eased));
      if (this.once && t >= 1) {
        const strikes = this.strikes;
        this.stop();
        if (this.onEnd) this.onEnd({ strikes });
        return;
      }
      const frame = this.getFrame();
      if (!frame) return;
      const ring = readRing({ rumble: frame.field }, null, this.center, r, this.fullScale);
      const fresh = frame.fresh ? readRing({ hit: frame.fresh }, null, this.center, r, this.fullScale) : null;
      if (now - this._secondStart > 1000) { this._secondStart = now; this._strikesThisSecond = 0; }
      ring.forEach((v, k) => {
        const covered = v.points.some((p) => Math.abs(p.lat) <= this.coverageLat);
        v.noData = !covered;
        if (!covered) { v.gains = { rumble: 0 }; v.gain = 0; }
        this.engine.setVoice(k, { gains: v.gains, brightness: Math.min(1, v.level / this.fullScale), land: 0 });
        if (!covered || !fresh) return;
        const rate = this.strikeRate(fresh[k].levels.hit);
        if (rate > 0 && Math.random() < rate / STEP_HZ && this._strikesThisSecond < 30) {
          this._strikesThisSecond++;
          v.struck = true;
          this.strikes[k] += 1;
          const base = this.engine.voices[k].base;
          this.engine.strike(panForBearing(v.bearing), base, Math.min(1, 0.4 + rate / 10));
        }
      });
      if (this.onStep) this.onStep({ t, radiusKm: r, ring });
    };
    this._timer = setInterval(tick, 1000 / STEP_HZ);
    tick();
  }

  stop() {
    this.running = false;
    clearInterval(this._timer);
    this.engine.silenceVoices();
  }
}

export async function renderScan({ fields, landField, center, radiusKm, durationS, layers = DEFAULT_LAYERS, coastClicks = true, volume = 0.8, fullScale = ARC_FULL_SCALE, trim = 1, mapVoice = defaultVoice }) {
  const sampleRate = 44100;
  const tail = 2.6;
  const ctx = new OfflineAudioContext(2, Math.ceil((durationS + tail) * sampleRate), sampleRate);
  const engine = new SonicEngine(VOICES, layers);
  engine.volume = volume;
  engine.trim = trim;
  engine.attach(ctx, { offline: true });
  const steps = Math.ceil(durationS * STEP_HZ);
  let prevLand = null;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const ring = readRing(fields, landField, center, radiusKm * (1 - t), fullScale);
    prevLand = applyRing(engine, ring, prevLand, coastClicks, t * durationS, mapVoice);
  }
  engine.silenceVoices(durationS);
  const c = centreOf(fields, center);
  engine.centreNote(c.level, durationS, c.kind);
  return ctx.startRendering();
}

export async function renderScanWav(opts) {
  const buffer = await renderScan(opts);
  return encodeWav([buffer.getChannelData(0), buffer.getChannelData(1)], buffer.sampleRate);
}
