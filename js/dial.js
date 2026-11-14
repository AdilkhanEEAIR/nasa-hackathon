import { token, num } from './theme.js';

const TAU = Math.PI * 2;

export class VoiceDial {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.levels = new Float32Array(16);
    this.motors = { n: 0, e: 0, s: 0, w: 0 };
    this.haptic = { strong: 0, weak: 0 };
    this.hapticOn = false;
    this.colors = null;
    this.highlight = null;
    this.draw();
  }

  update(levels, motors, colors = null) {
    this.levels.set(levels);
    this.motors = motors;
    this.colors = colors;
    this.draw();
  }

  clear() {
    this.colors = null;
    this.levels.fill(0);
    this.motors = { n: 0, e: 0, s: 0, w: 0 };
    this.draw();
  }

  setHaptics(intensity, available) {
    this.haptic = intensity;
    this.hapticOn = !!available;
    this.draw();
  }

  setHighlight(bearing) {
    this.highlight = bearing;
    this.draw();
  }

  draw() {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = w / 2;
    const r0 = w * 0.2;
    const r1 = w * 0.38;
    const font = token('--font-sans');
    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = token('--dial-guide');
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r0, 0, TAU);
    ctx.stroke();

    const n = this.levels.length;
    ctx.lineCap = 'round';
    ctx.lineWidth = num('--dial-voice-width');
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU - Math.PI / 2;
      const g = this.levels[k];
      const len = r0 + 6 + (r1 - r0 - 6) * Math.max(0.04, g);
      const hot = this.highlight !== null && Math.abs(((k * 22.5 - this.highlight + 540) % 360) - 180) < 12;
      const c = hot ? '--ui-accent' : (this.colors && this.colors[k]) || '--data-lights';
      ctx.strokeStyle = c.startsWith('#') ? c : token(c);
      ctx.globalAlpha = hot ? 1 : 0.22 + 0.78 * g;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (r0 + 6), cy + Math.sin(a) * (r0 + 6));
      ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = token('--dial-letter');
    ctx.font = `600 ${Math.round(w * 0.065)}px ${font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lr = r1 + w * 0.07;
    ctx.fillText('N', cx, cy - lr);
    ctx.fillText('S', cx, cy + lr);
    ctx.fillText('E', cx + lr, cy);
    ctx.fillText('W', cx - lr, cy);
    ctx.font = `${Math.round(w * 0.045)}px ${font}`;
    ctx.fillStyle = token('--dial-caption');
    ctx.fillText('high', cx, cy - r0 * 0.45);
    ctx.fillText('low', cx, cy + r0 * 0.45);

    if (!this.hapticOn) return;
    const top = w + 8;
    const bh = h - top - 24;
    const colW = w / 2;
    [['strong', 'heavy'], ['weak', 'light']].forEach(([key, label], i) => {
      const x = colW * i + colW * 0.38;
      const bw = colW * 0.24;
      const v = Math.min(1, this.haptic[key] || 0);
      ctx.fillStyle = token('--dial-bar-track');
      ctx.fillRect(x, top, bw, bh);
      ctx.fillStyle = token('--data-tactile');
      ctx.fillRect(x, top + bh * (1 - v), bw, bh * v);
      ctx.fillStyle = token('--dial-caption');
      ctx.fillText(label, x + bw / 2, h - 10);
    });
  }
}
