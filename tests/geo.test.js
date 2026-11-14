import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EARTH_RADIUS_KM, normalizeLon, destination, distanceKm, bearingDeg,
  lonLatToPixel, pixelToLonLat, ringArcs, diskPoints,
} from '../js/geo.js';

const KM_PER_DEG = (Math.PI * EARTH_RADIUS_KM) / 180;
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`);

test('normalizeLon wraps into [-180, 180)', () => {
  assert.equal(normalizeLon(0), 0);
  assert.equal(normalizeLon(180), -180);
  assert.equal(normalizeLon(-180), -180);
  assert.equal(normalizeLon(190), -170);
  assert.equal(normalizeLon(-190), 170);
  assert.equal(normalizeLon(725), 5);
});

test('destination: one degree north and east along the equator', () => {
  const n = destination(0, 0, 0, KM_PER_DEG);
  close(n.lat, 1, 1e-9, 'lat');
  close(n.lon, 0, 1e-9, 'lon');
  const e = destination(0, 0, 90, KM_PER_DEG);
  close(e.lat, 0, 1e-9, 'lat');
  close(e.lon, 1, 1e-9, 'lon');
});

test('destination crosses the date line', () => {
  const p = destination(0, 179.5, 90, KM_PER_DEG);
  close(p.lon, -179.5, 1e-9, 'lon');
});

test('distance and bearing invert destination', () => {
  const centers = [{ lat: 22.5, lon: 79 }, { lat: 42.87, lon: 74.59 }, { lat: -33.9, lon: 18.4 }, { lat: 70, lon: -150 }];
  for (const c of centers) {
    for (const b of [0, 45, 90, 135, 200, 315]) {
      for (const d of [10, 500, 1500, 4000]) {
        const p = destination(c.lat, c.lon, b, d);
        close(distanceKm(c, p), d, d * 1e-9 + 1e-6, `distance from ${JSON.stringify(c)} b=${b}`);
        const diff = ((bearingDeg(c, p) - b + 540) % 360) - 180;
        if (Math.abs(c.lat) < 85) close(diff, 0, 1e-6, `bearing b=${b} d=${d}`);
      }
    }
  }
});

test('known distance: Bishkek to Delhi is about 1600 km', () => {
  close(distanceKm({ lat: 42.87, lon: 74.59 }, { lat: 28.61, lon: 77.21 }), 1600, 200, 'km');
});

test('ring arcs: every sample lies on the ring, voice 0 points north', () => {
  const c = { lat: 42.87, lon: 74.59 };
  for (const r of [100, 1500, 3000]) {
    const arcs = ringArcs(c, r, 16);
    assert.equal(arcs.length, 16);
    arcs.forEach((arc, k) => {
      assert.equal(arc.bearing, k * 22.5);
      assert.ok(arc.points.length >= 3 && arc.points.length <= 24);
      for (const p of arc.points) close(distanceKm(c, p), r, 1e-6 * r + 1e-6, 'on ring');
    });
    const north = arcs[0].points[Math.floor(arcs[0].points.length / 2)];
    assert.ok(north.lat > c.lat, 'voice 0 is north of centre');
    const east = arcs[4].points[Math.floor(arcs[4].points.length / 2)];
    assert.ok(normalizeLon(east.lon - c.lon) > 0, 'voice 4 is east of centre');
    const west = arcs[12].points[Math.floor(arcs[12].points.length / 2)];
    assert.ok(normalizeLon(west.lon - c.lon) < 0, 'voice 12 is west of centre');
  }
});

test('ring arcs cover the whole circle without gaps', () => {
  const c = { lat: 20, lon: 80 };
  const arcs = ringArcs(c, 1500, 16, 40);
  const bearings = arcs.flatMap((a) => a.points.map((p) => bearingDeg(c, p))).sort((a, b) => a - b);
  let maxGap = 360 - bearings[bearings.length - 1] + bearings[0];
  for (let i = 1; i < bearings.length; i++) maxGap = Math.max(maxGap, bearings[i] - bearings[i - 1]);
  const gapKm = (maxGap / 360) * 2 * Math.PI * EARTH_RADIUS_KM * Math.sin(1500 / EARTH_RADIUS_KM);
  assert.ok(gapKm <= 41, `largest gap ${gapKm.toFixed(1)} km`);
});

test('disk points stay inside the radius', () => {
  const c = { lat: 50, lon: 10 };
  const pts = diskPoints(c, 1500);
  assert.ok(pts.length > 100);
  for (const p of pts) assert.ok(distanceKm(c, p) <= 1500 + 1e-6);
});

const WEB = { lon0: -180, width: 1920, height: 1080 };

test('pixel mapping: corners, centre and wrap', () => {
  assert.deepEqual(lonLatToPixel(90, -180, WEB), { x: 0, y: 0 });
  assert.deepEqual(lonLatToPixel(0, 0, WEB), { x: 960, y: 540 });
  assert.deepEqual(lonLatToPixel(-90, 0, WEB), { x: 960, y: 1080 });
  assert.equal(lonLatToPixel(0, 180, WEB).x, 0);
  assert.equal(lonLatToPixel(0, -181, WEB).x, 1920 - 1920 / 360);
});

test('pixel mapping round-trips', () => {
  for (const g of [WEB, { lon0: -169, width: 3840, height: 2160 }, { lon0: -180, width: 2048, height: 1024 }]) {
    for (const [lat, lon] of [[0, 0], [42.87, 74.59], [-33.9, 18.4], [60, -150], [-80, 179.9]]) {
      const { x, y } = lonLatToPixel(lat, lon, g);
      const back = pixelToLonLat(x, y, g);
      close(back.lat, lat, 1e-9, 'lat');
      close(normalizeLon(back.lon - lon), 0, 1e-9, 'lon');
    }
  }
});

// Measured positions from docs/DATA_NOTES.md, converted to the 1920x1080 web images.
test('georeference: night-lights roll puts 180 W at x = 0', () => {
  const lonAtX0 = -169.0 - (117 * 360) / 3840;
  close(lonAtX0, -180, 0.1, 'lon at left edge');
});

test('georeference: measured city lights match predicted pixels (within 2.5 px)', () => {
  const measured = [
    // name, lat, lon, night-lights web px (copy-1 px + 117 roll, halved), aerosol web px (halved)
    ['Cape Town', -33.92, 18.42, [(1996 + 117) / 2, 1487 / 2], [2117 / 2, 1488 / 2]],
    ['Perth', -31.95, 115.86, [(3035 + 117) / 2, 1463 / 2], [3155 / 2, 1462 / 2]],
    ['Tokyo', 35.69, 139.69, [(3289 + 117) / 2, 650 / 2], null],
    ['Auckland', -36.85, 174.76, [(3664 + 117) / 2, 1523 / 2], null],
  ];
  for (const [name, lat, lon, nl, ae] of measured) {
    const p = lonLatToPixel(lat, lon, WEB);
    for (const m of [nl, ae]) {
      if (!m) continue;
      close(p.x, m[0], 2.5, `${name} x`);
      close(p.y, m[1], 2.5, `${name} y`);
    }
  }
});
