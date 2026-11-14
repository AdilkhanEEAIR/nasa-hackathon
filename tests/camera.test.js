import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  geoToMap, mapToGeo, clampCamera, mapToScreen, screenToMap, zoomAt, panBy, ensureVisible,
  visibleRect, HOME, MAX_SCALE,
} from '../js/camera.js';
import { ringArcs, destination, distanceKm } from '../js/geo.js';

const W = 1280;
const H = 720;
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

test('geo <-> map round-trip and anchors', () => {
  assert.deepEqual(geoToMap(90, -180), { u: 0, v: 0 });
  assert.deepEqual(geoToMap(0, 0), { u: 0.5, v: 0.5 });
  for (const [lat, lon] of [[42.87, 74.59], [-33.9, 18.4], [60, -150]]) {
    const { u, v } = geoToMap(lat, lon);
    const g = mapToGeo(u, v);
    close(g.lat, lat, 1e-9, 'lat');
    close(g.lon, lon, 1e-9, 'lon');
  }
});

test('screen <-> map round-trip at several zooms', () => {
  for (const cam of [HOME, { s: 2, cu: 0.3, cv: 0.4 }, { s: 7.5, cu: 0.71, cv: 0.33 }]) {
    for (const [x, y] of [[0, 0], [640, 360], [1279, 719], [100, 600]]) {
      const m = screenToMap(x, y, cam, W, H);
      const p = mapToScreen(m.u, m.v, cam, W, H);
      close(p.x, x, 1e-9, 'x');
      close(p.y, y, 1e-9, 'y');
    }
  }
});

test('at scale 1 the whole map fills the view exactly', () => {
  assert.deepEqual(mapToScreen(0, 0, HOME, W, H), { x: 0, y: 0 });
  assert.deepEqual(mapToScreen(1, 1, HOME, W, H), { x: W, y: H });
});

test('zoomAt keeps the point under the cursor fixed', () => {
  const sx = 900;
  const sy = 250;
  const before = screenToMap(sx, sy, HOME, W, H);
  const cam = zoomAt(HOME, 3, sx, sy, W, H);
  assert.equal(cam.s, 3);
  const p = mapToScreen(before.u, before.v, cam, W, H);
  close(p.x, sx, 1e-9, 'x');
  close(p.y, sy, 1e-9, 'y');
});

test('scale is limited and the view never leaves the map', () => {
  assert.equal(zoomAt(HOME, 100, 640, 360, W, H).s, MAX_SCALE);
  assert.equal(zoomAt(HOME, 0.01, 640, 360, W, H).s, 1);
  const c = clampCamera({ s: 4, cu: 0.01, cv: 0.99 });
  const r = visibleRect(c);
  assert.ok(r.u0 >= 0 && r.u1 <= 1 && r.v0 >= 0 && r.v1 <= 1, JSON.stringify(r));
  const panned = panBy({ s: 2, cu: 0.5, cv: 0.5 }, 99999, 0, W, H);
  assert.equal(visibleRect(panned).u0, 0);
});

test('drag moves content with the pointer', () => {
  const cam = { s: 2, cu: 0.5, cv: 0.5 };
  const m = screenToMap(600, 300, cam, W, H);
  const moved = panBy(cam, 40, -25, W, H);
  const p = mapToScreen(m.u, m.v, moved, W, H);
  close(p.x, 640, 1e-9, 'x');
  close(p.y, 275, 1e-9, 'y');
});

test('ensureVisible re-centres only when the point is near or past the edge', () => {
  const cam = { s: 4, cu: 0.5, cv: 0.5 };
  assert.equal(ensureVisible(cam, 0.52, 0.49), cam, 'inside: unchanged');
  const far = ensureVisible(cam, 0.8, 0.3);
  close(far.cu, 0.8, 1e-12, 'cu');
  close(far.cv, 0.3, 1e-12, 'cv');
});

test('ring geometry is independent of zoom: same km on the ground at every scale', () => {
  const c = { lat: 42.87, lon: 74.59 };
  const arcs = ringArcs(c, 1500, 16);
  for (const cam of [HOME, { s: 3, cu: geoToMap(c.lat, c.lon).u, cv: geoToMap(c.lat, c.lon).v }]) {
    for (const arc of arcs) {
      for (const p of arc.points) {
        const m = geoToMap(p.lat, p.lon);
        const s = mapToScreen(m.u, m.v, cam, W, H);
        const back = screenToMap(s.x, s.y, cam, W, H);
        const g = mapToGeo(back.u, back.v);
        close(distanceKm(c, g), 1500, 1e-6, 'radius');
      }
    }
  }
  const north = destination(c.lat, c.lon, 0, 111.195);
  close(north.lat - c.lat, 1, 1e-3, 'one degree');
});
