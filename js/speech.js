// Spoken guide (Web Speech API, English). It speaks navigation only: track intros, years,
// places, loading and summaries. Data is never spoken, it is heard as sound.
// It can be turned off (V) for screen-reader users, whose reader already reads the live region.

const KEY = 'earthsonar.voice';

export class Voice {
  constructor() {
    let saved = null;
    try { saved = localStorage.getItem(KEY); } catch { /* storage may be blocked */ }
    this.enabled = saved === null ? true : saved === 'on';
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
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* ignore */ }
    if (!on) this.cancel();
  }

  /** Speaks `text`; by default interrupts what was being said so the newest state wins. */
  say(text, { interrupt = true } = {}) {
    if (!this.enabled || !this.supported || !text) return;
    if (interrupt) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    if (this._voice) u.voice = this._voice;
    u.rate = 1.05;
    speechSynthesis.speak(u);
  }

  cancel() {
    if (this.supported) speechSynthesis.cancel();
  }
}
