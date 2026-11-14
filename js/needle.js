import { degreeToFreq } from './music.js';

export const NEEDLE_SEGMENTS = 12;
const SAMPLE_ROWS = 192;

export function forestValue(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max < 13) return 0;
  const sat = (max - min) / max;
  if (sat < 0.18) return 0;
  const d = max - min;
  let hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  hue = (hue * 60 + 360) % 360;
  if (hue < 55 || hue > 115) return 0;
  return Math.min(1, 0.45 + 0.55 * Math.min(1, max / 140));
}

export function co2Value(r, g, b) {
  if (Math.max(r, g, b) < 30 || g > r + 10) return 0;
  return Math.max(0, Math.min(1, (r - b - 25) / 130));
}

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

export function segmentFreq(k, n = NEEDLE_SEGMENTS) {
  return degreeToFreq(14 - Math.round((k * 14) / (n - 1)));
}

export function bandLevel(value) {
  const v = Math.max(0, Math.min(1, value));
  return v < 0.08 ? 0 : ((v - 0.08) / 0.92) ** 0.8;
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
    this._quiet = () => this._silence();
  }

  start({ video = null, field = null, geom, valueFn, voice = 'wood', durationS = 8, onEnd = null }) {
    this.stop();
    Object.assign(this, { video, field, geom, valueFn, voice, durationS, onEnd });
    this.engine.buildNeedle(Array.from({ length: NEEDLE_SEGMENTS }, (_, k) => segmentFreq(k)), voice);
    this.running = true;
    this._lastMediaTime = -1;
    const t0 = performance.now();
    const apply = (seg, x) => {
      seg.forEach((v, k) => this.engine.setNeedleBand(k, bandLevel(v)));
      if (this.onStep) this.onStep({ segments: seg, levels: Array.from(seg, bandLevel), x });
    };
    if (field) {
      const tick = () => {
        if (!this.running) return;
        if (document.hidden) { this._silence(); return; }
        const t = Math.min(1, (performance.now() - t0) / (durationS * 1000));
        const x = geom.x0 + (geom.x1 - geom.x0) * t;
        apply(fieldSegments(field, x, geom.y0, geom.y1), x);
        if (t >= 1) { this.stop(); if (this.onEnd) this.onEnd(); }
      };
      this._timer = setInterval(tick, 1000 / 30);
      tick();
      return;
    }
    const read = (mediaTime) => {
      if (video.paused || video.seeking || video.readyState < 3 || document.hidden) { this._silence(); return; }
      if (mediaTime === this._lastMediaTime) return;
      this._lastMediaTime = mediaTime;
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      this._ctx.drawImage(video, geom.x * vw - 1, geom.y0 * vh, 2, (geom.y1 - geom.y0) * vh, 0, 0, 2, SAMPLE_ROWS);
      apply(needleSegments(this._ctx.getImageData(0, 0, 1, SAMPLE_ROWS).data, SAMPLE_ROWS, valueFn), geom.x);
    };
    let played = 0;
    let lastT = performance.now();
    this._clock = setInterval(() => {
      const now = performance.now();
      if (!video.paused && !video.seeking && video.readyState >= 3 && !document.hidden) played += now - lastT;
      lastT = now;
      if (played >= durationS * 1000) { this.stop(); if (this.onEnd) this.onEnd(); }
    }, 100);
    for (const ev of ['pause', 'waiting', 'seeking', 'stalled']) video.addEventListener(ev, this._quiet);
    document.addEventListener('visibilitychange', this._quiet);
    if (video.requestVideoFrameCallback) {
      const onFrame = (_now, meta) => {
        if (!this.running) return;
        read(meta.mediaTime);
        this._vfc = video.requestVideoFrameCallback(onFrame);
      };
      this._vfc = video.requestVideoFrameCallback(onFrame);
    } else {
      this._timer = setInterval(() => read(video.currentTime), 1000 / 30);
    }
  }

  _silence() {
    if (!this.running) return;
    for (let k = 0; k < NEEDLE_SEGMENTS; k++) this.engine.setNeedleBand(k, 0);
    if (this.onStep) this.onStep({ segments: new Float32Array(NEEDLE_SEGMENTS), levels: new Array(NEEDLE_SEGMENTS).fill(0), x: this.geom && this.geom.x });
  }

  stop() {
    const was = this.running;
    this.running = false;
    clearInterval(this._timer);
    clearInterval(this._clock);
    if (this.video) {
      if (this._vfc && this.video.cancelVideoFrameCallback) this.video.cancelVideoFrameCallback(this._vfc);
      for (const ev of ['pause', 'waiting', 'seeking', 'stalled']) this.video.removeEventListener(ev, this._quiet);
    }
    document.removeEventListener('visibilitychange', this._quiet);
    this._vfc = 0;
    if (was) this.engine.clearNeedle();
  }
}
