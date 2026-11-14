// "Now sounding" instruments: the 16 ring voices laid out as a compass, and the four tactile
// directions the controller motors will play. Drawn on their own small canvas so updating
// them never touches page layout or the audio thread.

const TAU = Math.PI * 2;

export class VoiceDial {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.levels = new Float32Array(16);
    this.motors = { n: 0, e: 0, s: 0, w: 0 };
    this.highlight = null; // bearing to emphasise during the tutorial
    this.draw();
  }

  /** `colors` (optional) gives each voice the colour of its loudest instrument. */
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
    ctx.clearRect(0, 0, w, h);

    // Guide ring.
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r0, 0, TAU);
    ctx.stroke();

    // 16 voices: bar length and opacity follow the data gain of that direction.
    const n = this.levels.length;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU - Math.PI / 2; // bearing 0 at the top
      const g = this.levels[k];
      const len = r0 + 6 + (r1 - r0 - 6) * Math.max(0.04, g);
      const hot = this.highlight !== null && Math.abs(((k * 22.5 - this.highlight + 540) % 360) - 180) < 12;
      ctx.strokeStyle = hot ? '#7cd8ff' : (this.colors && this.colors[k]) || '#ffd56a';
      ctx.globalAlpha = hot ? 1 : 0.25 + 0.75 * g;
      ctx.lineWidth = 9;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (r0 + 6), cy + Math.sin(a) * (r0 + 6));
      ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Compass letters.
    ctx.fillStyle = '#f2f5fa';
    ctx.font = `600 ${Math.round(w * 0.07)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lr = r1 + w * 0.07;
    ctx.fillText('N', cx, cy - lr);
    ctx.fillText('S', cx, cy + lr);
    ctx.fillText('E', cx + lr, cy);
    ctx.fillText('W', cx - lr, cy);
    ctx.font = `${Math.round(w * 0.045)}px system-ui, sans-serif`;
    ctx.fillStyle = '#b7c0cf';
    ctx.fillText('high', cx, cy - r0 * 0.45);
    ctx.fillText('low', cx, cy + r0 * 0.45);

    // Tactile compass: four motor bars under the dial.
    const top = w + 8;
    const bh = h - top - 24;
    const names = [['n', 'N'], ['e', 'E'], ['s', 'S'], ['w', 'W']];
    const colW = w / 4;
    names.forEach(([key, label], i) => {
      const x = colW * i + colW * 0.3;
      const bw = colW * 0.4;
      const v = Math.min(1, this.motors[key] || 0);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(x, top, bw, bh);
      ctx.fillStyle = '#7cd8ff';
      ctx.fillRect(x, top + bh * (1 - v), bw, bh * v);
      ctx.fillStyle = '#b7c0cf';
      ctx.fillText(label, x + bw / 2, h - 10);
    });
  }
}
