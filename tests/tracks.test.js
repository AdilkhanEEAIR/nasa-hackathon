import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changeClass, dominant, describeChange, CHANGE_LAYERS } from '../js/tracks.js';
import { readRing } from '../js/scan.js';
import { buildField } from '../js/fields.js';
import { destination } from '../js/geo.js';

// Colours measured on the change map (docs/DATA_NOTES.md 1.4).
test('change classes: measured on-map colours land in the right class', () => {
  const purple = changeClass(96, 77, 123);
  assert.ok(purple.more > 0 && purple.less === 0 && purple.same === 0, JSON.stringify(purple));
  const orange = changeClass(131, 98, 71);
  assert.ok(orange.less > 0 && orange.more === 0, JSON.stringify(orange));
  const white = changeClass(105, 92, 99);
  assert.ok(white.same > 0 && white.more === 0 && white.less === 0, JSON.stringify(white));
  // Colorbar end points.
  assert.ok(changeClass(148, 105, 197).more > 0);
  assert.ok(changeClass(229, 158, 89).less > 0);
  assert.ok(changeClass(252, 252, 252).same > 0);
});

test('change classes: base map (ocean, desert, ice) is silent', () => {
  for (const c of [[1, 0, 2], [26, 21, 15], [15, 9, 4], [33, 33, 33]]) {
    assert.deepEqual(changeClass(...c), { more: 0, less: 0, same: 0 }, `rgb ${c}`);
  }
});

test('dominant and neutral descriptions', () => {
  assert.equal(dominant({ more: 0.2, less: 0.1, same: 0 }), 'more');
  assert.equal(dominant({ more: 0, less: 0, same: 0 }), null);
  assert.match(describeChange('less'), /less light/);
  assert.doesNotMatch(describeChange('less'), /because|war|crisis|conflict/i);
});

test('change layers are three distinct instruments', () => {
  const names = CHANGE_LAYERS.map((l) => l.name);
  assert.deepEqual(names, ['more', 'less', 'same']);
  const sig = new Set(CHANGE_LAYERS.map((l) => `${l.type}/${l.octave}`));
  assert.equal(sig.size, 3);
});

test('readRing with layers: a "less light" spot to the west plays only the less layer', () => {
  const w = 360;
  const h = 180;
  const center = { lat: 10, lon: 10 };
  const spot = destination(center.lat, center.lon, 270, 900);
  const make = (on) => {
    const rgba = new Uint8ClampedArray(w * h * 4);
    if (on) {
      const cx = Math.floor(spot.lon + 180);
      const cy = Math.floor(90 - spot.lat);
      for (let y = cy - 4; y <= cy + 4; y++) for (let x = cx - 4; x <= cx + 4; x++) rgba[(y * w + x) * 4] = 255;
    }
    return buildField(rgba, w, h, (r) => r / 255);
  };
  const ring = readRing({ more: make(false), less: make(true), same: make(false) }, null, center, 900);
  const west = ring[12];
  assert.ok(west.gains.less > 0 && west.gains.more === 0 && west.gains.same === 0);
  assert.equal(west.gain, west.gains.less);
  assert.equal(ring[4].gain, 0, 'east is silent');
});
