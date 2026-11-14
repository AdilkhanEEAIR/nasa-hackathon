import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dominant, lightningLevel, strikeRate, LIGHTNING_COVERAGE_LAT,
  oceanTemp, oceanVoice, describeTemp,
} from '../js/tracks.js';
import { readRing } from '../js/scan.js';
import { buildField } from '../js/fields.js';
import { destination } from '../js/geo.js';

test('dominant picks the loudest class, or null for silence', () => {
  assert.equal(dominant({ smoke: 0.2, dust: 0.1, salt: 0 }), 'smoke');
  assert.equal(dominant({ smoke: 0, dust: 0, salt: 0 }), null);
});

test('ocean: temperature from cover/temp means, land silent, warm is brighter', () => {
  assert.equal(oceanTemp(0, 0), null);
  assert.ok(Math.abs(oceanTemp(0.5, 0.5 * (24 / 32)) - 24) < 1e-9);
  const land = oceanVoice({ levels: { cover: 0, temp: 0 } });
  assert.equal(land.gains.sea, 0);
  const cold = oceanVoice({ levels: { cover: 0.5, temp: 0.5 * (2 / 32) } });
  const warm = oceanVoice({ levels: { cover: 0.5, temp: 0.5 * (29 / 32) } });
  assert.equal(cold.gains.sea, warm.gains.sea, 'same amount of ocean, same loudness');
  assert.ok(warm.brightness > cold.brightness, 'warm water sounds brighter');
  assert.match(describeTemp(24.4), /about 24 degrees/);
});

test('lightning: yellow dots count, grey map and lines never do', () => {
  assert.ok(lightningLevel(138, 130, 21) > 0, 'median dot');
  assert.ok(lightningLevel(99, 91, 0) > 0, 'dim dot');
  assert.ok(lightningLevel(209, 203, 57) > 0, 'bright dot');
  for (const g of [6, 20, 40, 72, 120, 200]) assert.equal(lightningLevel(g, g, g), 0, `grey ${g}`);
  assert.ok(lightningLevel(209, 203, 57) >= lightningLevel(99, 91, 0));
});

test('strike rate: silent at zero, rises, capped', () => {
  assert.equal(strikeRate(0), 0);
  assert.ok(strikeRate(0.005) > 0 && strikeRate(0.005) < strikeRate(0.02));
  assert.equal(strikeRate(1), 8);
  assert.equal(LIGHTNING_COVERAGE_LAT, 52);
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
