import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readRing, motorLevels, VOICES } from '../js/scan.js';
import { buildField } from '../js/fields.js';
import { destination } from '../js/geo.js';
import { encodeWav } from '../js/wav.js';

// A 1-pixel-per-degree world with one bright square.
function worldWithSpot(lat, lon, size = 4) {
  const w = 360;
  const h = 180;
  const rgba = new Uint8ClampedArray(w * h * 4);
  const cx = Math.floor(lon + 180);
  const cy = Math.floor(90 - lat);
  for (let y = cy - size; y <= cy + size; y++) {
    for (let x = cx - size; x <= cx + size; x++) rgba[(y * w + ((x + w) % w)) * 4] = 255;
  }
  return buildField(rgba, w, h, (r) => r / 255);
}

test('readRing: a bright spot north of the centre is heard by the north voice', () => {
  const center = { lat: 20, lon: 80 };
  const spot = destination(center.lat, center.lon, 0, 1000);
  const field = worldWithSpot(spot.lat, spot.lon);
  const ring = readRing(field, null, center, 1000);
  assert.equal(ring.length, VOICES);
  const loudest = ring.reduce((a, b) => (b.gain > a.gain ? b : a));
  assert.equal(loudest.bearing, 0);
  assert.ok(ring[8].gain === 0, 'south voice is silent');
});

test('readRing: a spot to the east is heard on the east voice, not the west', () => {
  const center = { lat: 0, lon: 0 };
  const spot = destination(0, 0, 90, 800);
  const ring = readRing(worldWithSpot(spot.lat, spot.lon), null, center, 800);
  assert.ok(ring[4].gain > 0);
  assert.equal(ring[12].gain, 0);
});

test('motorLevels: directional energy goes to the matching motor', () => {
  const ring = Array.from({ length: 16 }, (_, k) => ({ bearing: k * 22.5, gain: k === 4 ? 1 : 0 }));
  const m = motorLevels(ring);
  assert.equal(m.e, 1, 'a single loud east voice is felt at full strength');
  assert.equal(m.w, 0);
  assert.ok(m.n < 1e-9 && m.s < 1e-9, 'perpendicular motors stay still');
  const ne = motorLevels(Array.from({ length: 16 }, (_, k) => ({ bearing: k * 22.5, gain: k === 2 ? 1 : 0 })));
  assert.ok(Math.abs(ne.n - ne.e) < 1e-9 && ne.n > 0.6, 'north-east is shared by N and E');
});

test('motorLevels: uniform ring drives all motors equally, silence drives none', () => {
  const full = motorLevels(Array.from({ length: 16 }, (_, k) => ({ bearing: k * 22.5, gain: 0.5 })));
  for (const v of Object.values(full)) assert.ok(Math.abs(v - 0.5) < 1e-9);
  const none = motorLevels(Array.from({ length: 16 }, (_, k) => ({ bearing: k * 22.5, gain: 0 })));
  for (const v of Object.values(none)) assert.equal(v, 0);
});

test('encodeWav: valid 16-bit stereo PCM header and clipped samples', () => {
  const left = new Float32Array([0, 0.5, -0.5, 2]);
  const right = new Float32Array([0, -1, 1, -2]);
  const buf = encodeWav([left, right], 44100);
  const v = new DataView(buf);
  const str = (o, n) => String.fromCharCode(...new Uint8Array(buf, o, n));
  assert.equal(str(0, 4), 'RIFF');
  assert.equal(str(8, 4), 'WAVE');
  assert.equal(str(36, 4), 'data');
  assert.equal(buf.byteLength, 44 + 4 * 2 * 2);
  assert.equal(v.getUint32(4, true), buf.byteLength - 8);
  assert.equal(v.getUint16(22, true), 2);
  assert.equal(v.getUint32(24, true), 44100);
  assert.equal(v.getUint16(34, true), 16);
  assert.equal(v.getInt16(44 + 4 * 1, true), Math.round(0.5 * 0x7fff));   // frame 1 left
  assert.equal(v.getInt16(44 + 4 * 1 + 2, true), -0x8000);               // frame 1 right = -1
  assert.equal(v.getInt16(44 + 4 * 3, true), 0x7fff);                    // clipped +2
  assert.equal(v.getInt16(44 + 4 * 3 + 2, true), -0x8000);               // clipped -2
});
