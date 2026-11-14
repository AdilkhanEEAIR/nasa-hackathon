// Needle mode (js/needle.js): a fixed line down a turning globe, read north to south.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forestValue, needleSegments, segmentFreq, noteInterval, NEEDLE_SEGMENTS } from '../js/needle.js';

test('forest picture: ocean and space are silent, brighter vegetation reads higher', () => {
  assert.equal(forestValue(5, 5, 8), 0, 'space');
  assert.equal(forestValue(40, 110, 170), 0, 'ocean blue');
  const short = forestValue(110, 100, 40);  // brown / olive
  const tall = forestValue(230, 235, 190);  // pale green to white
  assert.ok(short > 0 && tall > short);
});

test('segments are read top to bottom and the top sounds highest', () => {
  const rows = 32;
  const px = new Uint8ClampedArray(rows * 4);
  for (let y = 0; y < rows / 2; y++) px.set([230, 235, 190, 255], y * 4); // vegetation in the north half
  for (let y = rows / 2; y < rows; y++) px.set([40, 110, 170, 255], y * 4); // ocean in the south half
  const seg = needleSegments(px, rows, forestValue);
  assert.equal(seg.length, NEEDLE_SEGMENTS);
  assert.ok(seg[0] > 0.5 && seg[NEEDLE_SEGMENTS - 1] === 0);
  assert.ok(segmentFreq(0) > segmentFreq(NEEDLE_SEGMENTS - 1), 'north is high');
});

test('more of the phenomenon, quicker notes, never more than about 5 per second per segment', () => {
  assert.ok(noteInterval(1) < noteInterval(0.3));
  assert.ok(noteInterval(1) >= 180);
});
