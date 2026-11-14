// Web Audio synthesis. Nothing is pre-recorded: every sound is generated from the values the
// ring reads off the map. The same graph runs live (AudioContext) or offline
// (OfflineAudioContext) so "Save scan as WAV" renders exactly what you hear.

import { degreeToFreq, degreeForBearing, panForBearing } from './music.js';

const VOICE_PEAK = 0.16;      // per-voice ceiling; 16 voices then sum safely into the limiter
const LAND_HUM = 0.025;       // quiet bed under unlit land so continents are audible
const SMOOTH = 0.06;          // seconds; gain glides avoid zipper noise between ring steps

export class SonicEngine {
  constructor(voices = 16) {
    this.nVoices = voices;
    this.ctx = null;
    this.offline = false;
    this.voices = [];
    this.volume = 0.8;
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
    this.voices = [];

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

    for (let k = 0; k < this.nVoices; k++) {
      const bearing = (k * 360) / this.nVoices;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = degreeToFreq(degreeForBearing(bearing));
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 400;
      filter.Q.value = 0.7;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const pan = ctx.createStereoPanner();
      pan.pan.value = panForBearing(bearing);
      osc.connect(filter).connect(gain).connect(pan).connect(this.bus);
      osc.start(0);
      this.voices.push({ osc, filter, gain, pan, bearing });
    }
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
    if (this.master) this.master.gain.setTargetAtTime(v, this.now, 0.05);
  }

  /**
   * One ring voice. `gain` 0..1 is the data loudness; `brightness` 0..1 opens the filter so
   * stronger values also sound brighter; `land` 0..1 is the share of land under the arc.
   */
  setVoice(k, { gain, brightness, land }, when = this.now) {
    this.levels[k] = gain;
    if (!this.ready) return;
    const v = this.voices[k];
    const hum = land >= 0.5 ? LAND_HUM : 0;
    const g = Math.max(hum, gain * VOICE_PEAK);
    const cutoff = gain > 0 ? 600 + 4200 * brightness : 320;
    v.gain.gain.setTargetAtTime(g, when, SMOOTH);
    v.filter.frequency.setTargetAtTime(cutoff, when, SMOOTH);
  }

  silenceVoices(when = this.now) {
    this.levels.fill(0);
    if (!this.ready) return;
    for (const v of this.voices) v.gain.gain.setTargetAtTime(0, when, 0.08);
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

  /** A plucked note. `when` is relative to now for live use (seconds from now). */
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

  /** The ring's final note: the value at the centre point. Silence would be ambiguous, so
   * "nothing here" is a soft low thud rather than no sound at all. */
  centreNote(level, at = this.now) {
    if (level > 0.001) {
      this.note(degreeToFreq(9), { at, duration: 1.8, level: 0.12 + 0.35 * Math.min(1, level), bright: level, type: 'triangle' });
      this.note(degreeToFreq(14), { at, duration: 1.2, level: 0.05 + 0.15 * Math.min(1, level), bright: level });
    } else {
      this.note(degreeToFreq(0) / 2, { at, duration: 0.5, level: 0.25, bright: 0 });
    }
  }

  stopAll() {
    this.silenceVoices();
  }
}
