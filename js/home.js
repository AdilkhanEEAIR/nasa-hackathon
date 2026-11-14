import { fetchBlob, blobToPixels, channelField } from './loader.js';
import { sampleField } from './fields.js';
import { ringArcs } from './geo.js';
import { token, num, ms } from './theme.js';

export const HOME_PLACES = [
  { name: 'India', lat: 22.5, lon: 79.0, radiusKm: 1500 },
  { name: 'Europe', lat: 48.5, lon: 9.0, radiusKm: 1500 },
  { name: 'East China', lat: 32.0, lon: 114.0, radiusKm: 1500 },
  { name: 'the US East Coast', lat: 39.0, lon: -78.0, radiusKm: 1500 },
];

const SCAN_MS = 6000;
const HOLD_MS = 900;
const FULL = 0.08;

const still = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function startHomeMap({ canvas, placeEl, manifest }) {
  const ctx = canvas.getContext('2d');
  let field = null;
  let index = 0;
  let t0 = performance.now();
  let raf = 0;
  let running = false;
  let lastDraw = 0;
  const prevLevel = new Float32Array(16);
  const lastFlash = new Float64Array(16);
  let flashes = [];
  let trail = [];

  const fit = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    return dpr;
  };
  let dpr = fit();
  new ResizeObserver(() => { dpr = fit(); if (!running) frame(performance.now(), true); }).observe(canvas);

  const project = (p) => ({ x: (((p.lon + 180) % 360 + 360) % 360) / 360 * canvas.width, y: (90 - p.lat) / 180 * canvas.height });

  function line(points, close) {
    let prev = null;
    let first = null;
    ctx.beginPath();
    for (const p of points) {
      const q = project(p);
      if (!prev || Math.abs(q.x - prev.x) > canvas.width / 2) ctx.moveTo(q.x, q.y);
      else ctx.lineTo(q.x, q.y);
      if (!first) first = q;
      prev = q;
    }
    if (close && first && prev && Math.abs(first.x - prev.x) <= canvas.width / 2) ctx.lineTo(first.x, first.y);
    ctx.stroke();
  }

  function frame(now, force = false) {
    if (!force && now - lastDraw < 33) return;
    lastDraw = now;
    const place = HOME_PLACES[index];
    const s = still();
    const t = s ? 0.45 : Math.min(1, (now - t0) / SCAN_MS);
    const r = Math.max(30, place.radiusKm * (1 - t));
    const arcs = ringArcs(place, r, 16);
    const k = dpr;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';

    if (!s) {
      if (!trail.length || now - trail[0].at > 220) {
        trail.unshift({ at: now, points: arcs.flatMap((a) => a.points) });
        trail.length = Math.min(trail.length, num('--overlay-trail-count'));
      }
      ctx.lineWidth = num('--overlay-ring-width') * k;
      ctx.strokeStyle = token('--overlay-trail');
      trail.slice(1).forEach((g, i) => { ctx.globalAlpha = 1 - (i + 1) / (trail.length + 1); line(g.points, true); });
      ctx.globalAlpha = 1;
    }

    ctx.lineWidth = num('--overlay-ring-width') * k;
    ctx.strokeStyle = token('--overlay-ring');
    line(arcs.flatMap((a) => a.points), true);

    const lights = token('--data-lights');
    arcs.forEach((a, i) => {
      if (!field) return;
      let sum = 0;
      for (const p of a.points) sum += sampleField(field, p.lat, p.lon, 1);
      const level = sum / a.points.length;
      const gain = Math.min(1, level / FULL) ** 0.7;
      if (gain > 0.05) {
        ctx.globalAlpha = num('--overlay-arc-alpha-min') + (num('--overlay-arc-alpha-max') - num('--overlay-arc-alpha-min')) * gain;
        ctx.strokeStyle = lights;
        ctx.lineWidth = (num('--overlay-arc-min') + (num('--overlay-arc-max') - num('--overlay-arc-min')) * gain) * k;
        line(a.points, false);
        ctx.globalAlpha = 1;
      }
      if (!s && gain > 0.55 && prevLevel[i] <= 0.55 && now - lastFlash[i] > 400) {
        lastFlash[i] = now;
        const mid = a.points[Math.floor(a.points.length / 2)];
        flashes.push({ ...mid, t0: now });
      }
      prevLevel[i] = gain;
    });

    const dur = ms('--dur-flash');
    flashes = flashes.filter((f) => now - f.t0 < dur);
    ctx.fillStyle = lights;
    for (const f of flashes) {
      const e = 1 - (1 - (now - f.t0) / dur) ** 3;
      const q = project(f);
      ctx.globalAlpha = 0.85 * (1 - e);
      ctx.beginPath();
      ctx.arc(q.x, q.y, (2 + num('--overlay-flash-size') * 0.7 * e) * k, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const c = project(place);
    ctx.strokeStyle = token('--overlay-marker');
    ctx.lineWidth = 1.25 * k;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 3.5 * k, 0, Math.PI * 2);
    ctx.stroke();

    if (!s && now - t0 > SCAN_MS + HOLD_MS) {
      index = (index + 1) % HOME_PLACES.length;
      t0 = now;
      trail = [];
      prevLevel.fill(0);
      placeEl.textContent = HOME_PLACES[index].name;
    }
  }

  const loop = (now) => {
    raf = 0;
    if (!running) return;
    frame(now);
    raf = requestAnimationFrame(loop);
  };

  const api = {
    get place() { return HOME_PLACES[index]; },
    setActive(on) {
      const want = on && !document.hidden && !still();
      if (want && !running) { running = true; t0 = performance.now(); raf = requestAnimationFrame(loop); }
      if (!want) { running = false; cancelAnimationFrame(raf); raf = 0; frame(performance.now(), true); }
    },
  };
  document.addEventListener('visibilitychange', () => api.setActive(document.body.dataset.tab === 'home'));
  placeEl.textContent = HOME_PLACES[index].name;
  frame(performance.now(), true);

  const entry = manifest.nightlights.years['2023'];
  fetchBlob(entry.sound).then(blobToPixels).then((img) => { field = channelField(img, 0); if (!running) frame(performance.now(), true); }).catch(() => {});
  return api;
}
