import { degreeToFreq, degreeForBearing, panForBearing } from './music.js';

const VOICE_PEAK = 0.16;
const LAND_HUM = 0.025;
const SMOOTH = 0.06;
const DUCK = 0.25;
const PLUCK_ATTACK = { wood: 0.008, drone: 0.25, water: 0.006, glide: 0.12 };

export const DEFAULT_LAYERS = [
  { name: 'main', type: 'triangle', octave: 0, cutoffLo: 600, cutoffHi: 4800, peak: 1.05, tremolo: { rate: 5.5, depth: 0.35 } },
];

export class SonicEngine {
  constructor(voices = 16, layers = DEFAULT_LAYERS) {
    this.nVoices = voices;
    this.layers = layers;
    this.ctx = null;
    this.offline = false;
    this.voices = [];
    this.volume = 0.8;
    this.ducked = false;
    this.trim = 1;
    this.levels = new Float32Array(voices);
  }

  get ready() {
    return !!this.ctx && (this.offline || this.ctx.state === 'running');
  }

  get now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  async unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.attach(new Ctx({ latencyHint: 'interactive' }));
    }
    if (this.ctx.state !== 'running') await this.ctx.resume();
    return this.ready;
  }

  attach(ctx, { offline = false } = {}) {
    this.ctx = ctx;
    this.offline = offline;

    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.2;
    this.master.connect(limiter).connect(ctx.destination);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(2.2, 2.5);
    const wet = ctx.createGain();
    wet.gain.value = 0.22;
    this.reverb.connect(wet).connect(this.master);
    this.bus = ctx.createGain();
    this.bus.connect(this.master);
    this.bus.connect(this.reverb);

    this._buildVoices();
  }

  setLayers(layers) {
    this.layers = layers;
    if (this.ctx) this._buildVoices();
  }

  _buildVoices() {
    for (const v of [...this.voices, this.probe].filter(Boolean)) {
      for (const l of v.layers) { try { l.osc.stop(); } catch { } }
      if (v.glide) { try { v.glide.lfo.stop(); } catch { } }
      v.pan.disconnect();
    }
    this.voices = [];
    for (let k = 0; k < this.nVoices; k++) {
      const bearing = (k * 360) / this.nVoices;
      this.voices.push(this._makeVoice(degreeToFreq(degreeForBearing(bearing)), panForBearing(bearing), bearing));
    }
    this.probe = this._makeVoice(degreeToFreq(7), 0, null);
  }

  _texture(kind) {
    this._textures = this._textures || {};
    if (this._textures[kind]) return this._textures[kind];
    const rate = this.ctx.sampleRate;
    const secs = kind === 'surf' ? 8 : kind === 'crackle' ? 3 : 2;
    const n = Math.floor(secs * rate);
    const buf = this.ctx.createBuffer(1, n, rate);
    const d = buf.getChannelData(0);
    let lp = 0;
    let brown = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'noise') d[i] = w * 0.6;
      else if (kind === 'surf') {
        lp += 0.08 * (w - lp);
        const swell = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n / 2));
        d[i] = lp * 2.2 * (0.15 + 0.85 * swell * swell);
      } else {
        brown = (brown + 0.02 * w) * 0.995;
        d[i] = brown * 1.6;
      }
    }
    if (kind === 'crackle') {
      const count = Math.floor(secs * 30);
      for (let c = 0; c < count; c++) {
        const start = Math.floor(Math.random() * (n - 400));
        const len = 60 + Math.floor(Math.random() * 300);
        const amp = 0.3 + Math.random() * 0.7;
        for (let i = 0; i < len; i++) d[start + i] += amp * (Math.random() * 2 - 1) * (1 - i / len) ** 2;
      }
    }
    this._textures[kind] = buf;
    return buf;
  }

  _makeVoice(base, panValue, bearing) {
    const ctx = this.ctx;
    const pan = ctx.createStereoPanner();
    pan.pan.value = panValue;
    pan.connect(this.bus);
    const t0 = this.offline ? 0 : ctx.currentTime;
    const layers = this.layers.map((spec) => {
      let osc;
      const source = spec.source || 'osc';
      if (source === 'osc') {
        osc = ctx.createOscillator();
        osc.type = spec.type;
        osc.frequency.value = base * 2 ** spec.octave;
        if (spec.detune) osc.detune.value = spec.detune;
      } else {
        osc = ctx.createBufferSource();
        osc.buffer = this._texture(source);
        osc.loop = true;
      }
      const filter = ctx.createBiquadFilter();
      filter.type = spec.filter || 'lowpass';
      filter.frequency.value = spec.pitchFilter ? base * 2 ** spec.octave : spec.cutoffLo;
      filter.Q.value = spec.q ?? 0.7;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      if (spec.tremolo) {
        const am = ctx.createGain();
        am.gain.value = 1 - spec.tremolo.depth / 2;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = spec.tremolo.rate * (0.92 + 0.16 * Math.random());
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = spec.tremolo.depth / 2;
        lfo.connect(lfoGain).connect(am.gain);
        lfo.start(t0);
        osc.connect(filter).connect(am).connect(gain).connect(pan);
      } else {
        osc.connect(filter).connect(gain).connect(pan);
      }
      if (source === 'osc') osc.start(t0);
      else osc.start(t0, Math.random() * osc.buffer.duration);
      return { spec, osc, filter, gain };
    });
    const gspec = this.layers.find((l) => l.glide)?.glide;
    let glide = null;
    if (gspec) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = gspec.rate * (0.85 + 0.3 * Math.random());
      const toPitch = ctx.createGain();
      const toFilter = ctx.createGain();
      toPitch.gain.value = 0;
      toFilter.gain.value = 0;
      lfo.connect(toPitch);
      lfo.connect(toFilter);
      for (const l of layers) {
        if (l.osc.detune) toPitch.connect(l.osc.detune);
        toFilter.connect(l.filter.detune);
      }
      lfo.start(t0);
      glide = { spec: gspec, lfo, toPitch, toFilter, rate: lfo.frequency.value };
    }
    return { bearing, pan, layers, base, glide };
  }

  _drive(v, g, brightness, land, when, motion = 0) {
    if (v.glide) {
      const m = Math.max(0, Math.min(1, motion));
      v.glide.toPitch.gain.setTargetAtTime(m * v.glide.spec.cents, when, 0.2);
      v.glide.toFilter.gain.setTargetAtTime(m * v.glide.spec.filterCents, when, 0.2);
      v.glide.lfo.frequency.setTargetAtTime(v.glide.rate * (1 + m * v.glide.spec.rateBoost), when, 0.3);
    }
    let total = 0;
    for (const x of Object.values(g)) total = Math.max(total, x);
    v.layers.forEach((l, i) => {
      const lg = g[l.spec.name] || 0;
      const hum = i === 0 && total === 0 && land >= 0.5 ? LAND_HUM : 0;
      const target = Math.max(hum, lg * VOICE_PEAK * (l.spec.peak ?? 1) * this.trim);
      let cutoff;
      if (l.spec.pitchFilter) {
        cutoff = v.base * 2 ** l.spec.octave * (1 + brightness * (l.spec.brightMul ?? 0.5));
      } else {
        cutoff = lg > 0 ? l.spec.cutoffLo + (l.spec.cutoffHi - l.spec.cutoffLo) * brightness : 320;
      }
      l.gain.gain.setTargetAtTime(target, when, l.spec.smooth ?? SMOOTH);
      l.filter.frequency.setTargetAtTime(cutoff, when, SMOOTH);
    });
    return total;
  }

  setProbe({ gains, brightness = 0, land = 0, lat = 0, motion = 0 }) {
    if (!this.ready || !this.probe) return;
    const when = this.now;
    const deg = Math.max(0, Math.min(14, Math.round(((lat + 60) / 135) * 14)));
    const base = degreeToFreq(deg);
    this.probe.base = base;
    for (const l of this.probe.layers) {
      if (l.osc.frequency) l.osc.frequency.setTargetAtTime(base * 2 ** l.spec.octave, when, 0.03);
    }
    this._drive(this.probe, gains, brightness, land, when, motion);
    this.probe.pan.pan.setValueAtTime(0, when);
  }

  silenceProbe() {
    if (!this.ready || !this.probe) return;
    for (const l of this.probe.layers) l.gain.gain.setTargetAtTime(0, this.now, 0.06);
  }

  _impulse(seconds, decay) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(seconds * rate);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
    }
    return buf;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(this._masterLevel(), this.now, 0.05);
  }

  _masterLevel() {
    return this.volume * (this.ducked ? DUCK : 1);
  }

  setDucked(on) {
    this.ducked = !!on;
    if (this.master && !this.offline) this.master.gain.setTargetAtTime(this._masterLevel(), this.now, on ? 0.05 : 0.25);
  }

  setVoice(k, { gain, gains, brightness = 0, land = 0, motion = 0 }, when = this.now) {
    const g = gains || { [this.layers[0].name]: gain || 0 };
    let total = 0;
    for (const x of Object.values(g)) total = Math.max(total, x);
    this.levels[k] = total;
    if (!this.ready) return;
    this._drive(this.voices[k], g, brightness, land, when, motion);
  }

  silenceVoices(when = this.now) {
    this.levels.fill(0);
    if (!this.ready) return;
    for (const v of this.voices) for (const l of v.layers) l.gain.gain.setTargetAtTime(0, when, 0.08);
  }

  click(pan, when = this.now, level = 0.12) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * 0.012);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3200;
    bp.Q.value = 2;
    const g = ctx.createGain();
    g.gain.value = level;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    src.connect(bp).connect(g).connect(p).connect(this.master);
    src.start(when);
  }

  strike(pan, freq, level = 0.6, when = this.now) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const out = ctx.createStereoPanner();
    out.pan.value = pan;
    out.connect(this.bus);
    const src = ctx.createBufferSource();
    src.buffer = this._texture('noise');
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(0.5 * level * this.trim, when + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0005, when + 0.06);
    src.connect(hp).connect(g).connect(out);
    src.start(when, Math.random() * 1.5, 0.08);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, when);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.6, when + 0.12);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0, when);
    og.gain.linearRampToValueAtTime(0.35 * level * this.trim, when + 0.004);
    og.gain.exponentialRampToValueAtTime(0.0005, when + 0.14);
    osc.connect(og).connect(out);
    osc.start(when);
    osc.stop(when + 0.16);
  }

  pluck(freq, level = 0.5, voice = 'wood', when = this.now) {
    if (!this.ready) return 0;
    const ctx = this.ctx;
    const latency = (ctx.baseLatency || 0) + (ctx.outputLatency || 0);
    const peak = latency + (when - ctx.currentTime) + (PLUCK_ATTACK[voice] ?? 0.01);
    const out = ctx.createGain();
    out.gain.value = level * this.trim * 0.35;
    out.connect(this.bus);
    if (voice === 'drone') {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 220 + 1400 * level;
      f.connect(out);
      for (const cents of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = freq / 2;
        o.detune.value = cents * level * 2;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, when);
        g.gain.linearRampToValueAtTime(cents < 0 ? 0.7 : 0.7 * level, when + PLUCK_ATTACK.drone);
        g.gain.exponentialRampToValueAtTime(0.0005, when + 1.3);
        o.connect(g).connect(f);
        o.start(when);
        o.stop(when + 1.4);
      }
      return peak;
    }
    if (voice === 'water' || voice === 'glide') {
      const o = ctx.createOscillator();
      o.type = voice === 'water' ? 'sine' : 'triangle';
      const g = ctx.createGain();
      if (voice === 'water') {
        o.frequency.setValueAtTime(freq, when);
        o.frequency.exponentialRampToValueAtTime(freq * 1.8, when + 0.05);
        g.gain.setValueAtTime(0, when);
        g.gain.linearRampToValueAtTime(1, when + PLUCK_ATTACK.water);
        g.gain.exponentialRampToValueAtTime(0.0005, when + 0.2);
      } else {
        o.frequency.setValueAtTime(freq, when);
        o.frequency.exponentialRampToValueAtTime(freq * 0.94, when + 0.9);
        g.gain.setValueAtTime(0, when);
        g.gain.linearRampToValueAtTime(0.8, when + PLUCK_ATTACK.glide);
        g.gain.exponentialRampToValueAtTime(0.0005, when + 1.0);
      }
      o.connect(g).connect(out);
      o.start(when);
      o.stop(when + 1.05);
      return peak;
    }
    const parts = voice === 'wood' ? [[1, 1, 0.45], [4, 0.35, 0.07]] : [[1, 1, 0.5]];
    for (const [mul, amp, decay] of parts) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * mul;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(amp, when + PLUCK_ATTACK.wood);
      g.gain.exponentialRampToValueAtTime(0.0005, when + decay);
      o.connect(g).connect(out);
      o.start(when);
      o.stop(when + decay + 0.05);
    }
    return peak;
  }

  buildNeedle(freqs, kind) {
    this.clearNeedle();
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = this.offline ? 0 : ctx.currentTime;
    const started = [];
    const osc = (type, f, detune = 0) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = detune; started.push(o); return o; };
    const noise = () => { const n = ctx.createBufferSource(); n.buffer = this._texture('noise'); n.loop = true; started.push(n); return n; };
    const lfo = (rate, depth, target) => { const l = osc('sine', rate * (0.85 + 0.3 * Math.random())); const g = ctx.createGain(); g.gain.value = depth; l.connect(g).connect(target); };
    this.needleBands = freqs.map((f) => {
      const out = ctx.createGain();
      out.gain.value = 0;
      out.connect(this.bus);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 600;
      filter.connect(out);
      let peak = 0.12;
      if (kind === 'wood') {
        filter.frequency.value = 2500;
        return { out, filter, peak: 0.5, kind, f, next: 0 };
      } else if (kind === 'breath') {
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 0.9;
        const ng = ctx.createGain(); ng.gain.value = 2.2;
        noise().connect(bp).connect(ng).connect(filter);
        const low = ctx.createGain(); low.gain.value = 0.35; osc('sine', f / 2).connect(low).connect(filter);
        peak = 0.2;
      } else {
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 3; bp.Q.value = 3.5;
        lfo(0.6, 500, bp.detune);
        const ng = ctx.createGain(); ng.gain.value = 3;
        noise().connect(bp).connect(ng).connect(filter);
        const tone = osc('sine', f); lfo(0.4, 30, tone.detune);
        const tg = ctx.createGain(); tg.gain.value = 0.3; tone.connect(tg).connect(filter);
        peak = 0.18;
      }
      return { out, filter, peak, kind };
    });
    for (const n of started) n.start(t0, n.buffer ? Math.random() * n.buffer.duration : undefined);
    this._needleSources = started;
  }

  setNeedleBand(k, level, when = this.now) {
    const b = this.needleBands && this.needleBands[k];
    if (!b || !this.ready) return;
    b.out.gain.setTargetAtTime(level * b.peak * this.trim, when, 0.025);
    if (b.kind === 'wood') {
      if (level > 0 && when >= b.next) {
        this._woodStrike(b, level, when);
        b.next = when + (0.34 - 0.23 * level) * (0.9 + 0.2 * Math.random());
      }
      return;
    }
    b.filter.frequency.setTargetAtTime(500 + 3500 * level, when, 0.025);
  }

  _woodStrike(b, level, when) {
    const ctx = this.ctx;
    const stop = when + 0.3;
    const part = (mult, gain, decay) => {
      const o = ctx.createOscillator();
      o.frequency.value = b.f * mult;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(gain, when + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0005, when + decay);
      o.connect(g).connect(b.filter);
      o.start(when);
      o.stop(stop);
    };
    part(1, 0.8, 0.22);
    part(3.93, 0.3 * (0.5 + level), 0.06);
    const n = ctx.createBufferSource();
    n.buffer = this._texture('noise');
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1800 + b.f; bp.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, when);
    g.gain.exponentialRampToValueAtTime(0.0005, when + 0.012);
    n.connect(bp).connect(g).connect(b.filter);
    n.start(when, Math.random() * 1.5);
    n.stop(when + 0.03);
  }

  clearNeedle() {
    if (this.needleBands) {
      const when = this.now;
      for (const b of this.needleBands) b.out.gain.setTargetAtTime(0, when, 0.04);
      const srcs = this._needleSources || [];
      const bands = this.needleBands;
      setTimeout(() => { for (const n of srcs) { try { n.stop(); } catch { } } for (const b of bands) b.out.disconnect(); }, 300);
    }
    this.needleBands = null;
    this._needleSources = null;
  }

  get outputDelayMs() {
    return this.ctx ? ((this.ctx.baseLatency || 0) + (this.ctx.outputLatency || 0)) * 1000 : 0;
  }

  note(freq, { when = 0, at = null, duration = 0.6, level = 0.3, pan = 0, type = 'sine', bright = 0.5 } = {}) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = at ?? this.now + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 500 + 5000 * bright;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0005, t + duration);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    osc.connect(f).connect(g).connect(p).connect(this.bus);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  centreNote(level, at = this.now, kind = null) {
    if (!(level > 0.001)) {
      this.note(degreeToFreq(0) / 2, { at, duration: 0.5, level: 0.25, bright: 0 });
      return;
    }
    const l = Math.min(1, level);
    if (kind === 'more') {
      this.note(degreeToFreq(7), { at, duration: 0.7, level: 0.2 + 0.25 * l, bright: 1, type: 'triangle' });
      this.note(degreeToFreq(10), { at: at + 0.25, duration: 1.4, level: 0.2 + 0.25 * l, bright: 1, type: 'triangle' });
    } else if (kind === 'less') {
      this.note(degreeToFreq(7), { at, duration: 0.7, level: 0.2 + 0.25 * l, bright: 0.15, type: 'sawtooth' });
      this.note(degreeToFreq(4), { at: at + 0.25, duration: 1.4, level: 0.2 + 0.25 * l, bright: 0.1, type: 'sawtooth' });
    } else {
      this.note(degreeToFreq(9), { at, duration: 1.8, level: 0.12 + 0.35 * l, bright: l, type: 'triangle' });
      this.note(degreeToFreq(14), { at, duration: 1.2, level: 0.05 + 0.15 * l, bright: l });
    }
  }

  stopAll() {
    this.silenceVoices();
  }
}
