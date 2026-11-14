// Visual layer for sighted users and demo videos. The sound never depends on it.
// The map is two stacked <img> elements inside a "world" layer that zooms and pans with a
// single CSS transform (compositor-only). The ring, centre and final-note ripple are drawn
// on a separate overlay canvas through the same camera, so every layer stays geographically
// aligned at any zoom.

import { geoToMap, mapToGeo, mapToScreen, screenToMap, zoomAt, panBy, clampCamera, ensureVisible, HOME } from './camera.js';
import { token, num, ms } from './theme.js';

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export class MapView {
  constructor({ world, imgA, imgB, overlay, onClick, onCamera }) {
    this.world = world;
    this.imgs = [imgA, imgB];
    this.front = 0;
    this.canvas = overlay;
    this.ctx = overlay.getContext('2d');
    this.ring = null;
    this.center = null;
    this.ripple = null;
    this.trail = [];       // a few earlier rings, drawn fading behind the current one
    this.flashes = [];     // short blooms where a voice has just become loud
    this._lastFlash = new Float64Array(32);
    this._prevGain = new Float32Array(32);
    this._ringSteps = 0;
    this._flashRaf = 0;
    this.cam = { ...HOME };
    this.onClick = onClick;
    this.onCamera = onCamera;
    this._rippleRaf = 0;
    this._fitCanvas();
    new ResizeObserver(() => { this._fitCanvas(); this.draw(); }).observe(overlay);
    this._wireGestures();
    this._applyCamera();
  }

  /** Overlay canvas at device resolution so lines stay crisp when the map is zoomed. */
  _fitCanvas() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.dpr = dpr;
  }

  get W() { return this.canvas.width; }
  get H() { return this.canvas.height; }

  // ------------------------------------------------------------ camera

  setCamera(cam, { notify = true } = {}) {
    this.cam = clampCamera(cam);
    this._applyCamera();
    this.draw();
    if (notify && this.onCamera) this.onCamera(this.cam);
  }

  _applyCamera() {
    const { s, cu, cv } = this.cam;
    // translate() percentages are of the world layer's own size (= the stage), then scale.
    this.world.style.transform = `translate(${(0.5 - cu * s) * 100}%, ${(0.5 - cv * s) * 100}%) scale(${s})`;
  }

  /** Zoom around the ring centre (keyboard), keeping it in frame. */
  zoomBy(factor) {
    const target = this.center ? geoToMap(this.center.lat, this.center.lon) : { u: this.cam.cu, v: this.cam.cv };
    const p = mapToScreen(target.u, target.v, this.cam, this.W, this.H);
    this.setCamera(zoomAt(this.cam, factor, p.x, p.y, this.W, this.H));
  }

  resetCamera() {
    this.setCamera({ ...HOME });
  }

  /** Centres a geographic point at a given zoom (the demo uses it to frame each region). */
  focus(lat, lon, s) {
    const m = geoToMap(lat, lon);
    this.setCamera({ s, cu: m.u, cv: m.v });
  }

  /** Keeps a geographic point in frame (used when the ring centre moves). */
  follow(lat, lon) {
    const m = geoToMap(lat, lon);
    const next = ensureVisible(this.cam, m.u, m.v);
    if (next !== this.cam) this.setCamera(next);
  }

  _canvasPoint(ev) {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((ev.clientX - r.left) / r.width) * this.W, y: ((ev.clientY - r.top) / r.height) * this.H };
  }

  _wireGestures() {
    const el = this.canvas;
    el.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const p = this._canvasPoint(ev);
      // Exponential mapping: equal wheel steps feel like equal zoom steps at any scale.
      this.setCamera(zoomAt(this.cam, Math.exp(-ev.deltaY * 0.0015), p.x, p.y, this.W, this.H));
    }, { passive: false });

    const pointers = new Map();
    let moved = 0;
    let pinch = null;
    el.addEventListener('pointerdown', (ev) => {
      el.setPointerCapture(ev.pointerId);
      pointers.set(ev.pointerId, this._canvasPoint(ev));
      moved = 0;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      }
    });
    el.addEventListener('pointermove', (ev) => {
      if (!pointers.has(ev.pointerId)) return;
      const prev = pointers.get(ev.pointerId);
      const cur = this._canvasPoint(ev);
      pointers.set(ev.pointerId, cur);
      if (pointers.size === 1) {
        moved += Math.hypot(cur.x - prev.x, cur.y - prev.y);
        if (moved > 4 * this.dpr) this.setCamera(panBy(this.cam, cur.x - prev.x, cur.y - prev.y, this.W, this.H));
      } else if (pointers.size === 2 && pinch) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        let cam = zoomAt(this.cam, dist / pinch.dist, mid.x, mid.y, this.W, this.H);
        cam = panBy(cam, mid.x - pinch.mid.x, mid.y - pinch.mid.y, this.W, this.H);
        pinch = { dist, mid };
        moved = Infinity;
        this.setCamera(cam);
      }
    });
    const end = (ev) => {
      if (!pointers.has(ev.pointerId)) return;
      const p = pointers.get(ev.pointerId);
      pointers.delete(ev.pointerId);
      if (pointers.size < 2) pinch = null;
      // A press that did not move is a click: it sets the ring centre.
      if (pointers.size === 0 && moved <= 4 * this.dpr && ev.type === 'pointerup' && this.onClick) {
        const m = screenToMap(p.x, p.y, this.cam, this.W, this.H);
        this.onClick(mapToGeo(m.u, m.v));
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  // ------------------------------------------------------------ images

  /**
   * Shows a map image. `fade` cross-fades (used while a year sweep plays, so the picture
   * follows the music); direct keyboard changes switch instantly.
   */
  setImage(url, { fade = false } = {}) {
    const cur = this.imgs[this.front];
    if (cur.getAttribute('src') === url) return;
    const next = this.imgs[1 - this.front];
    const instant = !fade || reducedMotion();
    next.classList.toggle('instant', instant);
    cur.classList.toggle('instant', instant);
    next.src = url;
    const show = () => {
      next.classList.add('front');
      cur.classList.remove('front');
      this.front = 1 - this.front;
    };
    if (next.complete && next.naturalWidth) show();
    else next.addEventListener('load', show, { once: true });
  }

  get currentImage() {
    return this.imgs[this.front].getAttribute('src');
  }

  // ------------------------------------------------------------ overlay

  setCenter(center) {
    this.center = center;
    this.draw();
  }

  /**
   * The ring as it is heard. Behind it, a short trail of earlier rings fades out; where a
   * voice turns loud (crosses 0.55 from below) a note flash blooms and decays. Flashes are
   * limited to one per voice every 400 ms (under 3 per second anywhere, the photosensitivity
   * limit) and are skipped entirely with prefers-reduced-motion.
   */
  setRing(ring) {
    const still = reducedMotion();
    if (!ring) {
      this.trail = [];
      this._prevGain.fill(0);
    } else if (!still) {
      // Keep every fourth step: evenly spaced ghosts rather than a smear.
      if (this.ring && this._ringSteps++ % 4 === 0) {
        this.trail.unshift(this.ring.flatMap((v) => v.points));
        this.trail.length = Math.min(this.trail.length, num('--overlay-trail-count'));
      }
      const now = performance.now();
      ring.forEach((v, k) => {
        if (v.gain > 0.55 && this._prevGain[k] <= 0.55 && now - this._lastFlash[k] > 400) {
          this._lastFlash[k] = now;
          const mid = v.points[Math.floor(v.points.length / 2)];
          this.flashes.push({ lat: mid.lat, lon: mid.lon, color: v.color, t0: now });
        }
        this._prevGain[k] = v.gain;
      });
    }
    this.ring = ring;
    this.draw();
    if (this.flashes.length) this._animateFlashes();
  }

  /** Lets flashes finish fading after the ring has stopped moving. */
  _animateFlashes() {
    if (this._flashRaf) return;
    const tick = () => {
      this._flashRaf = 0;
      this.draw();
      if (this.flashes.length) this._flashRaf = requestAnimationFrame(tick);
    };
    this._flashRaf = requestAnimationFrame(tick);
  }

  /** Optional visual layer: country borders and city names (Natural Earth). Never sonified. */
  setLabels(layer) {
    this.labels = layer;
    this.draw();
  }

  _drawLabels() {
    const { ctx } = this;
    const k = this.dpr;
    const { borders, cities } = this.labels;
    ctx.lineWidth = 1 * k;
    ctx.strokeStyle = token('--overlay-border');
    for (const line of borders) this._polyline(line.map(([lon, lat]) => ({ lat, lon })), false);
    // More names as you zoom in, largest cities first, so the map never turns into a wall of text.
    const limit = Math.round(25 * this.cam.s * this.cam.s);
    ctx.font = `${Math.round(num('--overlay-label-size') * k)}px ${token('--font-sans')}`;
    ctx.textBaseline = 'middle';
    for (const c of cities.slice(0, limit)) {
      const p = this._project(c);
      if (p.x < 0 || p.y < 0 || p.x > this.W || p.y > this.H) continue;
      ctx.fillStyle = token('--overlay-label');
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2 * k, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = token('--overlay-label-halo');
      ctx.fillText(c.name, p.x + 5 * k + 1, p.y + 1);
      ctx.fillStyle = token('--overlay-label');
      ctx.fillText(c.name, p.x + 5 * k, p.y);
    }
  }

  /** One expanding ring at the centre when the final note sounds. Plays once, never loops. */
  pulseCentre(level) {
    cancelAnimationFrame(this._rippleRaf);
    const start = performance.now();
    const dur = ms('--dur-ripple');
    const tick = (now) => {
      const t = Math.min(1, (now - start) / dur);
      this.ripple = { t, level, still: reducedMotion() };
      this.draw();
      if (t < 1) this._rippleRaf = requestAnimationFrame(tick);
      else { this.ripple = null; this.draw(); }
    };
    this._rippleRaf = requestAnimationFrame(tick);
  }

  _project(p) {
    const m = geoToMap(p.lat, p.lon);
    const s = mapToScreen(m.u, m.v, this.cam, this.W, this.H);
    return { x: s.x, y: s.y, u: m.u };
  }

  _polyline(points, close) {
    const { ctx } = this;
    let prev = null;
    let first = null;
    ctx.beginPath();
    for (const p of points) {
      const q = this._project(p);
      // Break the line where it wraps across the date line instead of drawing a stripe.
      if (!prev || Math.abs(q.u - prev.u) > 0.5) ctx.moveTo(q.x, q.y);
      else ctx.lineTo(q.x, q.y);
      if (!first) first = q;
      prev = q;
    }
    if (close && first && prev && Math.abs(first.u - prev.u) <= 0.5) ctx.lineTo(first.x, first.y);
    ctx.stroke();
  }

  draw() {
    const { ctx } = this;
    const k = this.dpr;
    ctx.clearRect(0, 0, this.W, this.H);

    if (this.labels) this._drawLabels();

    if (this.ring && this.trail.length) {
      ctx.lineWidth = num('--overlay-ring-width') * k;
      ctx.strokeStyle = token('--overlay-trail');
      this.trail.forEach((points, i) => {
        ctx.globalAlpha = 1 - i / (this.trail.length + 1);
        this._polyline(points, true);
      });
      ctx.globalAlpha = 1;
    }

    if (this.ring) {
      // Thin and translucent: the NASA map stays the main thing on screen.
      ctx.lineCap = 'round';
      ctx.lineWidth = num('--overlay-ring-width') * k;
      ctx.strokeStyle = token('--overlay-ring');
      this._polyline(this.ring.flatMap((v) => v.points), true);
      // Loud arcs are drawn a little thicker in their instrument's colour, so a viewer can
      // follow what is being heard.
      const wMin = num('--overlay-arc-min');
      const wMax = num('--overlay-arc-max');
      const aMin = num('--overlay-arc-alpha-min');
      const aMax = num('--overlay-arc-alpha-max');
      for (const v of this.ring) {
        if (v.gain <= 0.05) continue;
        ctx.lineWidth = (wMin + (wMax - wMin) * v.gain) * k;
        ctx.strokeStyle = v.color && v.color.startsWith('#') ? v.color : token(v.color || '--data-lights');
        ctx.globalAlpha = aMin + (aMax - aMin) * v.gain;
        this._polyline(v.points, false);
      }
      ctx.globalAlpha = 1;
    }

    if (this.flashes.length) {
      const now = performance.now();
      const dur = ms('--dur-flash');
      const size = num('--overlay-flash-size');
      this.flashes = this.flashes.filter((f) => now - f.t0 < dur);
      for (const f of this.flashes) {
        // Ease-out: a quick bloom, then a long fade, like a plucked note.
        const t = (now - f.t0) / dur;
        const e = 1 - (1 - t) ** 3;
        const q = this._project(f);
        ctx.globalAlpha = 0.85 * (1 - e);
        ctx.fillStyle = f.color && f.color.startsWith('#') ? f.color : token(f.color || '--data-lights');
        ctx.beginPath();
        ctx.arc(q.x, q.y, (3 + size * e) * k, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    if (this.center) {
      const c = this._project(this.center);
      ctx.lineWidth = 1.5 * k;
      ctx.strokeStyle = token('--overlay-marker');
      ctx.beginPath();
      ctx.arc(c.x, c.y, 6 * k, 0, Math.PI * 2);
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        ctx.moveTo(c.x + dx * 8 * k, c.y + dy * 8 * k);
        ctx.lineTo(c.x + dx * 13 * k, c.y + dy * 13 * k);
      }
      ctx.stroke();

      if (this.ripple) {
        const { t, level, still } = this.ripple;
        // Ease-out (fast start, gentle stop): the note's attack, then its decay.
        const e = 1 - (1 - t) ** 3;
        const radius = (still ? 18 : 8 + 34 * e) * k;
        ctx.lineWidth = 2 * k;
        ctx.globalAlpha = still ? 0.9 : 1 - e;
        ctx.strokeStyle = token(level > 0.001 ? '--data-lights' : '--ui-text-muted');
        ctx.beginPath();
        ctx.arc(c.x, c.y, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }
}
