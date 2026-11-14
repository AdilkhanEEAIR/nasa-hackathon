import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Haptics, pulseMs, rumble, HAPTIC_FLOOR } from '../js/haptics.js';

test('value to phone pulse: silent at or below the floor, then 10 to 60 ms rising with the value', () => {
  assert.equal(pulseMs(0), 0);
  assert.equal(pulseMs(HAPTIC_FLOOR), 0);
  assert.equal(pulseMs(1), 60);
  assert.equal(pulseMs(5), 60);
  assert.ok(pulseMs(0.8) > pulseMs(0.3) && pulseMs(0.3) >= 10);
});

test('controller rule: heavy motor carries the south, light motor the north, east and west half', () => {
  assert.deepEqual(rumble({ s: 0.9 }), { strong: 0.9, weak: 0 });
  assert.deepEqual(rumble({ n: 0.7 }), { strong: 0, weak: 0.7 });
  assert.deepEqual(rumble({ e: 0.8 }), { strong: 0.4, weak: 0.4 });
  assert.deepEqual(rumble({ n: 0.1, s: 0.1 }), { strong: 0, weak: 0 });
});

function fakeNav({ vibrate = false, pads = [] } = {}) {
  const calls = [];
  const nav = {};
  if (vibrate) nav.vibrate = (ms) => { calls.push(['vibrate', ms]); return true; };
  nav.getGamepads = () => pads;
  return { nav, calls };
}

test('without support nothing is called and nothing throws', () => {
  const { nav, calls } = fakeNav();
  const h = new Haptics({ nav, coarse: () => false });
  h.enabled = true;
  assert.equal(h.available, false);
  h.set({ n: 1, e: 1, s: 1, w: 1 }, 1000);
  h.off();
  assert.deepEqual(calls, []);
  const none = new Haptics({ nav: {}, coarse: () => true });
  none.enabled = true;
  none.set({ s: 1 }, 1000);
  none.off();
  assert.equal(none.available, false);
});

test('a desktop with navigator.vibrate but no touch screen does not count as a phone', () => {
  const { nav } = fakeNav({ vibrate: true });
  assert.equal(new Haptics({ nav, coarse: () => false }).available, false);
});

test('nothing vibrates until the user switches Haptics on', () => {
  const { nav, calls } = fakeNav({ vibrate: true });
  const h = new Haptics({ nav, coarse: () => true });
  h.set({ s: 1 }, 1000);
  assert.deepEqual(calls, []);
  h.enabled = true;
  h.set({ s: 1 }, 2000);
  assert.deepEqual(calls, [['vibrate', 60]]);
  h.off();
  assert.deepEqual(calls.at(-1), ['vibrate', 0]);
});

test('controller rumble uses both motors with the rule values', () => {
  const effects = [];
  const pad = { connected: true, vibrationActuator: { playEffect: (type, p) => { effects.push([type, p]); return Promise.resolve(); }, reset: () => { effects.push(['reset']); return Promise.resolve(); } } };
  const { nav } = fakeNav({ pads: [null, pad] });
  const h = new Haptics({ nav, coarse: () => false });
  assert.equal(h.available, true);
  h.enabled = true;
  h.set({ s: 0.8, n: 0.3 }, 1000);
  assert.equal(effects[0][0], 'dual-rumble');
  assert.equal(effects[0][1].strongMagnitude, 0.8);
  assert.equal(effects[0][1].weakMagnitude, 0.3);
  h.off();
  assert.deepEqual(effects.at(-1), ['reset']);
});
