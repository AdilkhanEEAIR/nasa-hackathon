export const HAPTIC_FLOOR = 0.15;

const clamp = (v) => Math.max(0, Math.min(1, Number(v) || 0));

export function pulseMs(value) {
  const v = clamp(value);
  return v > HAPTIC_FLOOR ? Math.round(10 + 50 * v) : 0;
}

export function rumble({ n = 0, e = 0, s = 0, w = 0 } = {}) {
  const side = 0.5 * Math.max(clamp(e), clamp(w));
  const cut = (v) => (v > HAPTIC_FLOOR ? v : 0);
  return { strong: cut(Math.max(clamp(s), side)), weak: cut(Math.max(clamp(n), side)) };
}

export class Haptics {
  constructor({ nav = globalThis.navigator, coarse = () => globalThis.matchMedia && globalThis.matchMedia('(pointer: coarse)').matches } = {}) {
    this.nav = nav;
    this.coarse = coarse;
    this.enabled = false;
    this.intensity = { strong: 0, weak: 0 };
    this._lastPulse = 0;
    this._lastRumble = 0;
  }

  get phone() {
    return !!(this.nav && typeof this.nav.vibrate === 'function' && this.coarse());
  }

  pad() {
    if (!this.nav || typeof this.nav.getGamepads !== 'function') return null;
    for (const p of this.nav.getGamepads() || []) if (p && p.connected && p.vibrationActuator) return p;
    return null;
  }

  get available() {
    return this.phone || !!this.pad();
  }

  set(levels, now = performance.now()) {
    const r = rumble(levels);
    this.intensity = r;
    if (!this.enabled) return r;
    if (this.phone && now - this._lastPulse > 250) {
      const ms = pulseMs(Math.max(r.strong, r.weak));
      if (ms) { this._lastPulse = now; this.nav.vibrate(ms); }
    }
    const pad = this.pad();
    if (pad && now - this._lastRumble > 100) {
      this._lastRumble = now;
      pad.vibrationActuator.playEffect('dual-rumble', { duration: 140, strongMagnitude: r.strong, weakMagnitude: r.weak }).catch(() => {});
    }
    return r;
  }

  off() {
    this.intensity = { strong: 0, weak: 0 };
    if (this.phone) this.nav.vibrate(0);
    const pad = this.pad();
    if (pad) {
      const a = pad.vibrationActuator;
      (a.reset ? a.reset() : a.playEffect('dual-rumble', { duration: 0, strongMagnitude: 0, weakMagnitude: 0 })).catch(() => {});
    }
  }
}

export const haptics = new Haptics();
