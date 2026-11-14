// Needle mode (js/needle.js): a fixed line down a turning globe, read north to south.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forestValue, co2Value, needleSegments, segmentFreq, bandLevel, NEEDLE_SEGMENTS } from '../js/needle.js';

test('forest picture: ocean and space are silent, brighter vegetation reads higher', () => {
  assert.equal(forestValue(5, 5, 8), 0, 'space');
  assert.equal(forestValue(40, 110, 170), 0, 'ocean blue');
  const short = forestValue(100, 110, 40);  // olive green
  const tall = forestValue(215, 235, 190);  // pale green to white
  assert.ok(short > 0 && tall > short);
});

test('CO2 picture: grey land, white desert and dark ocean are silent, warmer plumes read higher', () => {
  assert.equal(co2Value(150, 150, 150), 0, 'grey land');
  assert.equal(co2Value(230, 225, 215), 0, 'white desert');
  assert.equal(co2Value(10, 10, 12), 0, 'ocean');
  assert.ok(co2Value(220, 120, 40) > co2Value(200, 180, 90), 'orange above yellow');
});

test('segments are read top to bottom and the top sounds highest', () => {
  const rows = 32;
  const px = new Uint8ClampedArray(rows * 4);
  for (let y = 0; y < rows / 2; y++) px.set([200, 235, 190, 255], y * 4); // vegetation in the north half
  for (let y = rows / 2; y < rows; y++) px.set([40, 110, 170, 255], y * 4); // ocean in the south half
  const seg = needleSegments(px, rows, forestValue);
  assert.equal(seg.length, NEEDLE_SEGMENTS);
  assert.ok(seg[0] > 0.5 && seg[NEEDLE_SEGMENTS - 1] === 0);
  assert.ok(segmentFreq(0) > segmentFreq(NEEDLE_SEGMENTS - 1), 'north is high');
});

test('band loudness: empty bands are silent, rich bands clearly louder', () => {
  assert.equal(bandLevel(0), 0);
  assert.equal(bandLevel(0.05), 0, 'below the floor: silence');
  assert.ok(bandLevel(1) / bandLevel(0.25) > 3);
  assert.equal(bandLevel(1), 1);
});

test('still-frame sweep reads the precomputed grid column, top to bottom', async () => {
  const { fieldSegments } = await import('../js/needle.js');
  const width = 4; const height = 32;
  const values = new Uint8Array(width * height);
  for (let y = 0; y < 8; y++) for (let x = 0; x < width; x++) values[y * width + x] = 255; // bright top quarter
  const seg = fieldSegments({ width, height, values }, 0.5, 0, 1);
  assert.ok(seg[0] > 0.9 && seg[1] > 0.9 && seg[seg.length - 1] === 0);
});
