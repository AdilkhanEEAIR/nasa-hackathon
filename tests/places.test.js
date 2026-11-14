import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describePlace, CITIES } from '../js/places.js';

test('gazetteer entries are valid coordinates with unique names', () => {
  const names = new Set();
  for (const c of CITIES) {
    assert.ok(c.lat >= -90 && c.lat <= 90 && c.lon >= -180 && c.lon <= 180, c.name);
    assert.ok(!names.has(c.name), `duplicate ${c.name}`);
    names.add(c.name);
  }
  assert.ok(CITIES.length >= 120);
});

test('describePlace: at, near, and relative to cities', () => {
  assert.equal(describePlace(42.87, 74.59, true), 'Bishkek');
  assert.match(describePlace(42.42, 74.59, true), /^\d+ km south of Bishkek$/);
  assert.match(describePlace(28.9, 77.5, true), /of Delhi$/);
});

test('describePlace: water bodies', () => {
  assert.equal(describePlace(0, -140, false), 'the Pacific Ocean');
  assert.equal(describePlace(-20, 75, false), 'the Indian Ocean');
  assert.equal(describePlace(30, -40, false), 'the Atlantic Ocean');
  assert.equal(describePlace(35, 18, false), 'the Mediterranean Sea');
  assert.match(describePlace(42.4, 77.3, false), /^Lake Issyk-Kul, \d+ km \S+ of Almaty$/);
});
