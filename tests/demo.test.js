// The 28-second demo (js/demo-plan.js) for a recording under the 30-second limit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_LENGTH_MS, DEMO_SCENES, DEMO_CAPTIONS, DEMO_CARDS } from '../js/demo-plan.js';
import { BRAND } from '../js/brand.js';

test('the demo lasts exactly 28 seconds, scenes in order', () => {
  assert.equal(DEMO_LENGTH_MS, 28000);
  assert.equal(DEMO_SCENES[0].at, 0);
  assert.equal(DEMO_SCENES.at(-1).at, DEMO_LENGTH_MS);
  assert.equal(DEMO_SCENES.at(-1).scene, 'stop');
  for (let i = 1; i < DEMO_SCENES.length; i++) assert.ok(DEMO_SCENES[i].at > DEMO_SCENES[i - 1].at);
  assert.deepEqual(DEMO_SCENES.map((s) => s.scene), ['title', 'nightlights', 'aerosols', 'lightning', 'end', 'stop']);
});

test('the first note sounds within 2 s; each scan ends before the next scene; no long silence', () => {
  const scans = DEMO_SCENES.filter((s) => s.scanS);
  assert.ok(scans[0].soundAt <= 2000);
  for (let i = 0; i < scans.length; i++) {
    const end = scans[i].soundAt + scans[i].scanS * 1000;
    const next = i + 1 < scans.length ? scans[i + 1].soundAt : DEMO_SCENES.find((s) => s.scene === 'end').at;
    assert.ok(end <= next, `${scans[i].scene} overlaps`);
    assert.ok(next - end <= 1000, `${scans[i].scene}: ${next - end} ms gap (the final chord covers up to ~1 s)`);
  }
});

test('subtitles: English, at most 8 words, at least 2.5 s on screen', () => {
  for (let i = 0; i < DEMO_CAPTIONS.length - 1; i++) {
    const c = DEMO_CAPTIONS[i];
    if (!c.text) continue;
    assert.ok(c.text.split(/\s+/).length <= 8, c.text);
    assert.ok(DEMO_CAPTIONS[i + 1].at - c.at >= 2500, c.text);
    assert.match(c.text, /^[\x20-\x7E]+$/, `${c.text}: English`);
  }
});

test('title and end cards carry the name, address, event and audience', () => {
  assert.equal(DEMO_CARDS.title.name, BRAND.name);
  assert.ok(DEMO_CARDS.end.line.includes('earthsonar.vercel.app'));
  assert.ok(DEMO_CARDS.end.small.includes('NASA Space Apps Challenge 2026 · The Earth Information Jukebox'));
  assert.ok(DEMO_CARDS.end.small.includes('Built for blind and low-vision users'));
});
