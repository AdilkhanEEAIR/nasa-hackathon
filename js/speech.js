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

  say(text, { interrupt = true } = {}) {
    if (!this.enabled || !this.supported || !text) return;
    if (interrupt) speechSynthesis.cancel();
    speechSynthesis.speak(this._utter(text));
  }

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
