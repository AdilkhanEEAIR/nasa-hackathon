import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PENTATONIC, BASE_FREQ, degreeToFreq, degreeForBearing, panForBearing, degreeForIndex,
  INDEX_FLOOR, INDEX_CEIL, INDEX_DEGREES,
} from '../js/music.js';
import { lightLevel, gainForLevel, buildField, sampleField, meanOver } from '../js/fields.js';

test('degrees map onto the major pentatonic scale', () => {
  assert.equal(degreeToFreq(0), BASE_FREQ);
  assert.ok(Math.abs(degreeToFreq(5) - 2 * BASE_FREQ) < 1e-9, 'degree 5 is one octave up');
  for (let d = 0; d < 15; d++) {
    const semis = Math.round(12 * Math.log2(degreeToFreq(d) / BASE_FREQ));
    assert.ok(PENTATONIC.includes(((semis % 12) + 12) % 12), `degree ${d} -> ${semis} semitones`);
    if (d > 0) assert.ok(degreeToFreq(d) > degreeToFreq(d - 1), 'strictly rising');
  }
});

test('compass: north is highest, south lowest, east/west in the middle', () => {
  assert.equal(degreeForBearing(0), 8);
  assert.equal(degreeForBearing(180), 0);
  assert.equal(degreeForBearing(90), 4);
  assert.equal(degreeForBearing(270), 4);
  assert.equal(degreeForBearing(45), degreeForBearing(315), 'mirror bearings share a pitch');
  for (let b = 0; b < 180; b += 22.5) {
    assert.ok(degreeForBearing(b) >= degreeForBearing(b + 22.5), `pitch falls from north to south at ${b}`);
  }
});

test('compass: east is right, west is left, north and south centred', () => {
  assert.ok(panForBearing(90) > 0.89);
  assert.ok(panForBearing(270) < -0.89);
  assert.equal(panForBearing(0), 0);
  assert.equal(panForBearing(180), 0);
  for (let b = 0; b < 360; b += 22.5) assert.ok(Math.abs(panForBearing(b)) <= 0.9 + 1e-12);
});

test('regional index scale is fixed, monotonic and bounded', () => {
  assert.equal(degreeForIndex(0), 0);
  assert.equal(degreeForIndex(INDEX_FLOOR), 0);
  assert.equal(degreeForIndex(INDEX_CEIL), INDEX_DEGREES - 1);
  assert.equal(degreeForIndex(1), INDEX_DEGREES - 1);
  let prev = -1;
  for (let v = 0.001; v < 0.2; v *= 1.2) {
    const d = degreeForIndex(v);
    assert.ok(d >= prev);
    prev = d;
  }
});

test('light level: base map is silent, lights scale to 1', () => {
  assert.equal(lightLevel(1, 0, 2), 0, 'ocean');
  assert.equal(lightLevel(26, 21, 15), 0, 'desert');
  assert.equal(lightLevel(33, 33, 33), 0, 'ice');
  assert.ok(lightLevel(120, 100, 60) > 0, 'city');
  assert.equal(lightLevel(255, 255, 255), 1);
  assert.ok(lightLevel(200, 150, 90) > lightLevel(120, 100, 60));
});

test('gain curve: zero stays silent, monotonic, capped at 1', () => {
  assert.equal(gainForLevel(0), 0);
  assert.equal(gainForLevel(NaN), 0);
  assert.equal(gainForLevel(1), 1);
  let prev = 0;
  for (let l = 0.001; l <= 0.2; l += 0.005) {
    const g = gainForLevel(l);
    assert.ok(g >= prev && g <= 1);
    prev = g;
  }
});

test('field sampling uses geography and wraps at the date line', () => {
  const w = 360;
  const h = 180;
  const rgba = new Uint8ClampedArray(w * h * 4);
  // One bright column at lon 179.5 (last column) and one bright pixel at (10 N, 20 E).
  for (let y = 0; y < h; y++) rgba[(y * w + (w - 1)) * 4] = 255;
  rgba[((90 - 10 - 1) * w + (180 + 20)) * 4] = 255;
  const f = buildField(rgba, w, h, (r) => r / 255);
  // Row 79 spans 11..10 N, column 200 spans 20..21 E.
  assert.equal(sampleField(f, 10.5, 20.5, 0), 1);
  assert.equal(sampleField(f, 0.5, 0.5, 0), 0);
  // A 3x3 box centred on lon -179.5 must see the bright column at +179.5 across the seam.
  assert.ok(Math.abs(sampleField(f, 0.5, -179.5, 1) - 3 / 9) < 1e-9);
  assert.equal(meanOver(f, [{ lat: 10.5, lon: 20.5 }, { lat: 0.5, lon: 0.5 }], 0), 0.5);
});
