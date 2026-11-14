// EarthSonar controller link over Web Serial (Chrome / Edge on a computer).
// Protocol: docs/PROTOCOL.md - 115200 baud, ASCII lines, full-state messages, garbage ignored.

/** Parses one line from the board; returns null for anything malformed (protocol rule 3). */
export function parseLine(raw) {
  const line = String(raw).replace(/\r$/, '').trim();
  if (!line || line.length > 31) return null;
  const f = line.split(',');
  const ints = (arr) => (arr.every((s) => /^-?\d+$/.test(s)) ? arr.map(Number) : null);
  switch (f[0]) {
    case 'H':
      return f.length === 3 ? { type: 'hello', name: f[1], version: Number(f[2]) } : null;
    case 'J': {
      if (f.length !== 3) return null;
      const v = ints(f.slice(1));
      if (!v) return null;
      const clamp = (x) => Math.max(-100, Math.min(100, x));
      return { type: 'joy', x: clamp(v[0]), y: clamp(v[1]) };
    }
    case 'P': {
      if (f.length !== 2) return null;
      const v = ints(f.slice(1));
      return v ? { type: 'pot', value: Math.max(0, Math.min(1000, v[0])) } : null;
    }
    case 'B': {
      if (f.length !== 3) return null;
      const v = ints(f.slice(1));
      if (!v || ![1, 2].includes(v[0]) || ![0, 1].includes(v[1])) return null;
      return { type: 'button', id: v[0], pressed: v[1] === 1 };
    }
    default:
      return null;
  }
}

/** "M,n,e,s,w\n" with each motor 0..255 from levels 0..1. */
export function formatMotors({ n = 0, e = 0, s = 0, w = 0 }) {
  const b = (x) => Math.max(0, Math.min(255, Math.round((Number.isFinite(x) ? x : 0) * 255)));
  return `M,${b(n)},${b(e)},${b(s)},${b(w)}\n`;
}

/** Splits a text stream into complete lines, keeping the unfinished tail. */
export function splitLines(buffer, chunk) {
  const parts = (buffer + chunk).split('\n');
  return { lines: parts.slice(0, -1), rest: parts[parts.length - 1].slice(-64) };
}

export class Controller {
  constructor({ onMessage, onStatus } = {}) {
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.port = null;
    this.writer = null;
    this._lastMotors = '';
    this._lastSent = 0;
  }

  static get supported() {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  get connected() {
    return !!this.port;
  }

  /** Must be called from a user gesture (the browser shows its port picker). */
  async connect() {
    this.port = await navigator.serial.requestPort();
    await this.port.open({ baudRate: 115200 });
    const enc = new TextEncoderStream();
    enc.readable.pipeTo(this.port.writable).catch(() => {});
    this.writer = enc.writable.getWriter();
    this._readLoop();
    await this.send('?\n');
    if (this.onStatus) this.onStatus('connected');
    navigator.serial.addEventListener?.('disconnect', (ev) => { if (ev.target === this.port) this._closed(); });
  }

  async _readLoop() {
    const dec = new TextDecoderStream();
    this.port.readable.pipeTo(dec.writable).catch(() => {});
    const reader = dec.readable.getReader();
    let rest = '';
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const split = splitLines(rest, value);
        rest = split.rest;
        for (const l of split.lines) {
          const msg = parseLine(l);
          if (msg && this.onMessage) this.onMessage(msg);
        }
      }
    } catch { /* port lost */ }
    this._closed();
  }

  _closed() {
    if (!this.port) return;
    this.port = null;
    this.writer = null;
    if (this.onStatus) this.onStatus('disconnected');
  }

  async send(text) {
    if (!this.writer) return;
    try { await this.writer.write(text); } catch { this._closed(); }
  }

  /**
   * Sends motor levels at most 25 times a second. Identical frames are still re-sent every
   * 200 ms so the board's 500 ms safety timeout never cuts a steady vibration.
   */
  motors(levels) {
    const line = formatMotors(levels);
    const now = performance.now();
    if (now - this._lastSent < 40) return;
    if (line === this._lastMotors && now - this._lastSent < 200) return;
    this._lastMotors = line;
    this._lastSent = now;
    this.send(line);
  }

  stopMotors() {
    this._lastMotors = '';
    this.send('S\n');
  }
}
