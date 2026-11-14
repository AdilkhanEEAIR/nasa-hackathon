// Visual layer for sighted users and demo videos. The sound never depends on it.
// The map itself is two stacked <img> elements (cross-faded with opacity only); the ring,
// centre and final-note ripple live on a separate overlay canvas.

import { lonLatToPixel } from './geo.js';

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export class MapView {
  constructor({ imgA, imgB, overlay }) {
    this.imgs = [imgA, imgB];
    this.front = 0;
    this.canvas = overlay;
    this.ctx = overlay.getContext('2d');
    this.ring = null;
    this.center = null;
    this.ripple = null;
    this._rippleRaf = 0;
  }

  get grid() {
    return { lon0: -180, width: this.canvas.width, height: this.canvas.height };
  }

  /**
   * Shows a map image. `fade` cross-fades (used while a year sweep plays, so the picture
   * follows the music); direct keyboard changes switch instantly.
   */
  setImage(url, { fade = false, alt = '' } = {}) {
    const cur = this.imgs[this.front];
    if (cur.getAttribute('src') === url) return;
    const next = this.imgs[1 - this.front];
    const instant = !fade || reducedMotion();
    next.classList.toggle('instant', instant);
    cur.classList.toggle('instant', instant);
    next.alt = alt;
    next.src = url;
    const show = () => {
      next.classList.add('front');
      cur.classList.remove('front');
      this.front = 1 - this.front;
    };
    if (next.complete && next.naturalWidth) show();
    else next.addEventListener('load', show, { once: true });
  }

  setCenter(center) {
    this.center = center;
    this.draw();
  }

  setRing(ring) {
    this.ring = ring;
    this.draw();
  }

  /** One expanding ring at the centre when the final note sounds. Plays once, never loops. */
  pulseCentre(level) {
    cancelAnimationFrame(this._rippleRaf);
    const start = performance.now();
    const dur = reducedMotion() ? 700 : 600;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / dur);
      this.ripple = { t, level, still: reducedMotion() };
      this.draw();
      if (t < 1) this._rippleRaf = requestAnimationFrame(tick);
      else { this.ripple = null; this.draw(); }
    };
    this._rippleRaf = requestAnimationFrame(tick);
  }

  /** Converts a click position (CSS pixels) to latitude/longitude. */
  eventToLatLon(ev) {
    const r = this.canvas.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * this.canvas.width;
    const y = ((ev.clientY - r.top) / r.height) * this.canvas.height;
    return { lat: 90 - (y / this.canvas.height) * 180, lon: -180 + (x / this.canvas.width) * 360 };
  }

  _polyline(points, close) {
    const { ctx } = this;
    const w = this.canvas.width;
    let prev = null;
    let first = null;
    ctx.beginPath();
    for (const p of points) {
      const q = lonLatToPixel(p.lat, p.lon, this.grid);
      // Break the line where it wraps across the map edge instead of drawing a stripe.
      if (!prev || Math.abs(q.x - prev.x) > w / 2) ctx.moveTo(q.x, q.y);
      else ctx.lineTo(q.x, q.y);
      if (!first) first = q;
      prev = q;
    }
    if (close && first && prev && Math.abs(first.x - prev.x) <= w / 2) ctx.lineTo(first.x, first.y);
    ctx.stroke();
  }

  draw() {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (this.ring) {
      ctx.lineCap = 'round';
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(124, 216, 255, 0.85)';
      this._polyline(this.ring.flatMap((v) => v.points), true);
      // Loud arcs are drawn thicker and warmer so a viewer can follow what is being heard.
      for (const v of this.ring) {
        if (v.gain <= 0.05) continue;
        ctx.lineWidth = 2 + 7 * v.gain;
        ctx.strokeStyle = v.color || '#ffd56a';
        ctx.globalAlpha = 0.35 + 0.65 * v.gain;
        this._polyline(v.points, false);
      }
      ctx.globalAlpha = 1;
    }

    if (this.center) {
      const c = lonLatToPixel(this.center.lat, this.center.lon, this.grid);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#fff';
      ctx.beginPath();
      ctx.arc(c.x, c.y, 6, 0, Math.PI * 2);
      ctx.moveTo(c.x - 13, c.y);
      ctx.lineTo(c.x - 8, c.y);
      ctx.moveTo(c.x + 8, c.y);
      ctx.lineTo(c.x + 13, c.y);
      ctx.moveTo(c.x, c.y - 13);
      ctx.lineTo(c.x, c.y - 8);
      ctx.moveTo(c.x, c.y + 8);
      ctx.lineTo(c.x, c.y + 13);
      ctx.stroke();

      if (this.ripple) {
        const { t, level, still } = this.ripple;
        // Ease-out (fast start, gentle stop): the note's attack, then its decay.
        const e = 1 - (1 - t) ** 3;
        const radius = still ? 18 : 8 + 34 * e;
        const alpha = still ? 0.9 : 1 - e;
        ctx.lineWidth = 3;
        ctx.strokeStyle = level > 0.001 ? `rgba(255, 213, 106, ${alpha})` : `rgba(183, 192, 207, ${alpha})`;
        ctx.beginPath();
        ctx.arc(c.x, c.y, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }
}
