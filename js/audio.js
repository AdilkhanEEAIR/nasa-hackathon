// Web Audio synthesis. Nothing is pre-recorded: every sound is generated from the values the
// ring reads off the map. The same graph runs live (AudioContext) or offline
// (OfflineAudioContext) so "Save scan as WAV" renders exactly what you hear.
//
// Each of the 16 ring voices has one or more "layers" (instruments). A layer has its own
// waveform, octave and filter, so different categories in a map (more vs less light, dust vs
// smoke) are heard as different instruments while direction stays the same pitch/stereo rule.

import { degreeToFreq, degreeForBearing, panForBearing } from './music.js';

const VOICE_PEAK = 0.16;      // per-voice ceiling; 16 voices then sum safely into the limiter
const LAND_HUM = 0.025;       // quiet bed under unlit land so continents are audible
const SMOOTH = 0.06;          // seconds; gain glides avoid zipper noise between ring steps
const DUCK = 0.25;            // mix level (-12 dB) under the spoken guide

/** Default single instrument (night lights): triangle wave, brightness opens the filter. */
export const DEFAULT_LAYERS = [
  // City lights: a warm triangle tone with a gentle twinkle (tremolo), so it is recognisable
  // next to the plain tones of the other tracks.
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
    this.ducked = false; // lowered while the spoken guide talks, so speech never covers a scan
    // Per-track loudness trim, so dense maps (every voice active) are not louder than sparse ones.
    this.trim = 1;
    this.levels = new Float32Array(voices); // last requested data gain per voice, for visuals
  }

  get ready() {
    return !!this.ctx && (this.offline || this.ctx.state === 'running');
  }

  get now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  /** Must be called from a user gesture: browsers block audio until the user interacts. */
  async unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.attach(new Ctx({ latencyHint: 'interactive' }));
    }
    if (this.ctx.state !== 'running') await this.ctx.resume();
    return this.ready;
  }

  /** Builds the synthesis graph on any BaseAudioContext (live or offline). */
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

    // Small synthetic room so the pentatonic chord blends instead of sounding like test tones.
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

  /** Switches the instrument set (e.g. when the track changes). */
  setLayers(layers) {
    this.layers = layers;
    if (this.ctx) this._buildVoices();
  }

  _buildVoices() {
    for (const v of [...this.voices, this.probe].filter(Boolean)) {
      for (const l of v.layers) { try { l.osc.stop(); } catch { /* already stopped */ } }
      if (v.glide) { try { v.glide.lfo.stop(); } catch { /* already stopped */ } }
      v.pan.disconnect();
    }
    this.voices = [];
    for (let k = 0; k < this.nVoices; k++) {
      const bearing = (k * 360) / this.nVoices;
      this.voices.push(this._makeVoice(degreeToFreq(degreeForBearing(bearing)), panForBearing(bearing), bearing));
    }
    // The explore-mode probe: one centred voice whose pitch follows latitude.
    this.probe = this._makeVoice(degreeToFreq(7), 0, null);
  }

  /**
   * Looping texture buffers for noise-based instruments, built once per context:
   *   noise   - white noise (dust: a dry rustle once band-passed high)
   *   surf    - soft low noise swelling twice every 8 s (sea salt: surf)
   *   crackle - sparse random clicks over a low rumble (smoke and fire)
   */
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
      // ~30 crackles per second: short decaying bursts of random strength.
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
        // Amplitude modulation between (1 - depth) and 1; each voice gets a slightly different
        // rate so the ring twinkles instead of pulsing in unison.
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
      // Random start offsets decorrelate the 16 copies of a noise texture.
      if (source === 'osc') osc.start(t0);
      else osc.start(t0, Math.random() * osc.buffer.duration);
      return { spec, osc, filter, gain };
    });
    // Glide: one slow LFO per voice swings the pitch a little and the filter a lot. Its depth
    // and speed follow a "motion" value (ocean: density of current lines), so moving water is
    // heard as a sliding, swirling tone. The compass pitch stays the centre of the swing.
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

  /** Same loudness/timbre rule as a ring voice, applied to any voice object. */
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
        // Noise instruments: the filter centre carries the compass pitch, so "north is high"
        // holds for them too; a stronger value opens the band a little.
        cutoff = v.base * 2 ** l.spec.octave * (1 + brightness * (l.spec.brightMul ?? 0.5));
      } else {
        cutoff = lg > 0 ? l.spec.cutoffLo + (l.spec.cutoffHi - l.spec.cutoffLo) * brightness : 320;
      }
      l.gain.gain.setTargetAtTime(target, when, SMOOTH);
      l.filter.frequency.setTargetAtTime(cutoff, when, SMOOTH);
    });
    return total;
  }

  /**
   * Explore mode: a sustained tone at the probe point. Pitch follows latitude (north high,
   * same law as the ring), loudness and timbre follow the value exactly like a ring voice.
   */
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
    // The probe is louder than one ring voice: it is the only thing sounding.
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

  /** Ducks the whole mix under the spoken guide, and restores it when speech ends. */
  setDucked(on) {
    this.ducked = !!on;
    if (this.master && !this.offline) this.master.gain.setTargetAtTime(this._masterLevel(), this.now, on ? 0.05 : 0.25);
  }

  /**
   * One ring voice. `gains` maps layer name -> data loudness 0..1 (or pass a single `gain` for
   * the first layer); `brightness` 0..1 opens the filters; `land` 0..1 is the land share
   * under the arc (unlit land gets a quiet hum on the first layer).
   */
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

  /** Short tick marking a coastline crossing, placed in the stereo field of its voice. */
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

  /**
   * One lightning strike: a sharp noise crack plus a short thump at the compass pitch of its
   * direction, so a strike to the north-east is a high crack in the right ear.
   */
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

  /**
   * One short struck note for needle tracks. 'wood' is a marimba-like knock: a sine with a
   * quickly fading partial four times higher and a tiny click, all at the needle pitch.
   */
  pluck(freq, level = 0.5, voice = 'wood', when = this.now) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = level * this.trim * 0.35;
    out.connect(this.bus);
    if (voice === 'drone') {
      // CO2: a low, slowly swelling hum an octave down. More CO2 opens the filter and adds a
      // detuned twin, so the sound thickens rather than simply getting louder.
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
        g.gain.linearRampToValueAtTime(cents < 0 ? 0.7 : 0.7 * level, when + 0.3);
        g.gain.exponentialRampToValueAtTime(0.0005, when + 1.5);
        o.connect(g).connect(f);
        o.start(when);
        o.stop(when + 1.6);
      }
      return;
    }
    const parts = voice === 'wood' ? [[1, 1, 0.35], [4, 0.45, 0.06]] : [[1, 1, 0.5]];
    for (const [mul, amp, decay] of parts) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * mul;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(amp, when + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0005, when + decay);
      o.connect(g).connect(out);
      o.start(when);
      o.stop(when + decay + 0.05);
    }
  }

  /** A plucked note. `when` is seconds from now (live); `at` is an absolute context time. */
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

  /**
   * The ring's final note: the value at the centre point. `kind` lets a track shape it:
   * 'more' rises, 'less' falls, anything else is a single chord. Silence would be ambiguous,
   * so "nothing here" is a soft low thud rather than no sound at all.
   */
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
