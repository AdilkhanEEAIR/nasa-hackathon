// The 28-second demo (js/demo-plan.js): the submission limit is 30 s with English subtitles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_LENGTH_MS, DEMO_STEPS, DEMO_CENTRES } from '../js/demo-plan.js';
import { TRACK_PRESETS } from '../js/tracks.js';

test('the demo lasts exactly 28 seconds, scenes in order', () => {
  assert.equal(DEMO_LENGTH_MS, 28000);
  assert.equal(DEMO_STEPS[0].at, 0);
  assert.equal(DEMO_STEPS.at(-1).at, DEMO_LENGTH_MS);
  assert.equal(DEMO_STEPS.at(-1).scene, 'stop');
  for (let i = 1; i < DEMO_STEPS.length; i++) assert.ok(DEMO_STEPS[i].at > DEMO_STEPS[i - 1].at);
});

test('every subtitle stays long enough to read (2 s, about 3 words per second)', () => {
  for (let i = 0; i < DEMO_STEPS.length - 1; i++) {
    const s = DEMO_STEPS[i];
    const shown = DEMO_STEPS[i + 1].at - s.at;
    const words = s.caption.split(/\s+/).length;
    assert.ok(shown >= 2000, `${s.scene}: ${shown} ms`);
    assert.ok(shown >= (words / 4.5) * 1000, `${s.scene}: ${words} words in ${shown} ms`);
    assert.match(s.caption, /^[\x20-\x7E—–→·]+$/, `${s.scene}: English subtitle`);
  }
});

test('each scan finishes before the next scene starts', () => {
  for (let i = 0; i < DEMO_STEPS.length - 1; i++) {
    const s = DEMO_STEPS[i];
    if (s.scanS) assert.ok(s.at + s.scanS * 1000 <= DEMO_STEPS[i + 1].at, s.scene);
  }
});

test('the demo plays all four tracks', () => {
  const scenes = DEMO_STEPS.map((s) => s.scene).join();
  for (const t of ['india2012', 'india2023', 'aerosols', 'ocean', 'lightning']) assert.ok(scenes.includes(t), t);
  assert.ok(Object.keys(TRACK_PRESETS).every((t) => ['nightlights', 'aerosols', 'lightning', 'ocean'].includes(t)));
  assert.ok(Object.values(DEMO_CENTRES).every((c) => c.radiusKm >= 250 && c.zoom >= 1));
});
