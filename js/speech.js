// Spoken guide (Web Speech API, English). Off by default: it is switched on in the
// Accessibility menu (or with V in the Jukebox) and the choice lives in js/prefs.js.
// What it may say is decided by mayVoiceSpeak() in js/prefs.js. Data is never spoken, it is
// heard as sound; while the guide talks, `onSpeaking` lets the player duck the scan.

export class Voice {
  constructor(enabled = false) {
    this.enabled = enabled;
    this.onSpeaking = null;
    this.supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
    this._voice = null;
    if (this.supported) {
      const pick = () => {
        const voices = speechSynthesis.getVoices();
        this._voice = voices.find((v) => v.lang === 'en-US' && /natural|google|aria|jenny|guy/i.test(v.name))
          || voices.find((v) => v.lang && v.lang.startsWith('en')) || null;
      };
      pick();
      speechSynthesis.addEventListener?.('voiceschanged', pick);
    }
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) this.cancel();
  }

  _utter(text) {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    if (this._voice) u.voice = this._voice;
    u.rate = 1.05;
    u.onstart = () => this.onSpeaking && this.onSpeaking(true);
    const done = () => this.onSpeaking && this.onSpeaking(false);
    u.addEventListener('end', done);
    u.addEventListener('error', done);
    return u;
  }

  /** Speaks `text`; by default interrupts what was being said so the newest state wins. */
  say(text, { interrupt = true } = {}) {
    if (!this.enabled || !this.supported || !text) return;
    if (interrupt) speechSynthesis.cancel();
    speechSynthesis.speak(this._utter(text));
  }

  /** Speaks and resolves when finished (or after a timeout, or at once when voice is off). */
  sayAsync(text, maxMs = 6000) {
    if (!this.enabled || !this.supported || !text) return Promise.resolve();
    return new Promise((resolve) => {
      speechSynthesis.cancel();
      const u = this._utter(text);
      const t = setTimeout(resolve, maxMs);
      u.addEventListener('end', () => { clearTimeout(t); resolve(); });
      u.addEventListener('error', () => { clearTimeout(t); resolve(); });
      speechSynthesis.speak(u);
    });
  }

  cancel() {
    if (this.supported) speechSynthesis.cancel();
    if (this.onSpeaking) this.onSpeaking(false);
  }
}
