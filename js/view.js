// Visual layer for sighted users and demo videos. The sound never depends on it.

import { lonLatToPixel } from './geo.js';

export class MapView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.image = null;
    this.ring = null;
    this.center = null;
  }

  get grid() {
    return { lon0: -180, width: this.canvas.width, height: this.canvas.height };
  }

  setImage(img) {
    this.image = img;
    this.draw();
  }

  setCenter(center) {
    this.center = center;
    this.draw();
  }

  setRing(ring) {
    this.ring = ring;
    this.draw();
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
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (this.image) ctx.drawImage(this.image, 0, 0, canvas.width, canvas.height);

    if (this.ring) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(120, 220, 255, 0.9)';
      this._polyline(this.ring.flatMap((v) => v.points), true);
      // Loud arcs are drawn thicker so a viewer can follow what is being heard.
      for (const v of this.ring) {
        if (v.gain <= 0.05) continue;
        ctx.lineWidth = 2 + 6 * v.gain;
        ctx.strokeStyle = `rgba(255, 230, 140, ${0.4 + 0.6 * v.gain})`;
        this._polyline(v.points, false);
      }
    }

    if (this.center) {
      const c = lonLatToPixel(this.center.lat, this.center.lon, this.grid);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#fff';
      ctx.beginPath();
      ctx.arc(c.x, c.y, 7, 0, Math.PI * 2);
      ctx.moveTo(c.x - 14, c.y);
      ctx.lineTo(c.x + 14, c.y);
      ctx.moveTo(c.x, c.y - 14);
      ctx.lineTo(c.x, c.y + 14);
      ctx.stroke();
    }
  }
}
