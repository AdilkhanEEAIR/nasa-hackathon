// Browser haptics, using what people already have:
//   - Android phones: navigator.vibrate (iPhone browsers do not offer vibration);
//   - game controllers on a computer: Gamepad API rumble (vibrationActuator, Chrome and Edge).
// Strength follows the value under the scan, with the same rule that was designed for motors:
// quiet parts stay still, rich parts buzz longer and harder. Nothing vibrates until the user
// switches Haptics on, and every vibration stops on Esc, when a scan stops and when the tab
// is hidden.

/** Values at or below this never vibrate, so faint noise in the picture is not felt. */
export const HAPTIC_FLOOR = 0.15;

const clamp = (v) => Math.max(0, Math.min(1, Number(v) || 0));

/** Phone pulse length in ms for a value 0..1: 0 below the floor, then 10 to 60 ms. */
export function pulseMs(value) {
  const v = clamp(value);
  return v > HAPTIC_FLOOR ? Math.round(10 + 50 * v) : 0;
}

/**
 * Dual-motor controller rule. Low notes come from the south, high notes from the north, so the
 * heavy low-frequency ("strong") motor carries the south and the light high-frequency ("weak")
 * motor carries the north; east and west add half their value to both. Below the floor: 0.
 */
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

  /** Android-style vibration: the API exists and the device is touch-first (not a desktop). */
  get phone() {
    return !!(this.nav && typeof this.nav.vibrate === 'function' && this.coarse());
  }

  /** The first connected controller that can rumble, or null. */
  pad() {
    if (!this.nav || typeof this.nav.getGamepads !== 'function') return null;
    for (const p of this.nav.getGamepads() || []) if (p && p.connected && p.vibrationActuator) return p;
    return null;
  }

  get available() {
    return this.phone || !!this.pad();
  }

  /** Feeds the current N/E/S/W values; returns the intensity shown in the Jukebox. */
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

  /** Stops any vibration now (keeps the switch as it is). */
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

/** One shared instance for the page (the Accessibility menu and the Jukebox use the same). */
export const haptics = new Haptics();
