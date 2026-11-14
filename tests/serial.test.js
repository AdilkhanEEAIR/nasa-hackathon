// Protocol tests: every example and rule in docs/PROTOCOL.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLine, formatMotors, splitLines } from '../js/serial.js';

test('board messages from the protocol example parse', () => {
  assert.deepEqual(parseLine('H,EarthSonar,1'), { type: 'hello', name: 'EarthSonar', version: 1 });
  assert.deepEqual(parseLine('J,0,57'), { type: 'joy', x: 0, y: 57 });
  assert.deepEqual(parseLine('J,-100,100\r'), { type: 'joy', x: -100, y: 100 });
  assert.deepEqual(parseLine('P,412'), { type: 'pot', value: 412 });
  assert.deepEqual(parseLine('B,1,1'), { type: 'button', id: 1, pressed: true });
  assert.deepEqual(parseLine('B,2,0'), { type: 'button', id: 2, pressed: false });
});

test('malformed lines are ignored, values are clamped', () => {
  for (const bad of ['', 'J,1', 'M,300,x', 'J,a,b', 'B,3,1', 'B,1,2', 'P', 'X,1,2', 'J,1,2,3', 'P,'.padEnd(40, '9')]) {
    assert.equal(parseLine(bad), null, JSON.stringify(bad));
  }
  assert.deepEqual(parseLine('J,250,-999'), { type: 'joy', x: 100, y: -100 });
  assert.deepEqual(parseLine('P,5000'), { type: 'pot', value: 1000 });
});

test('motor lines are full-state, clamped bytes, newline-terminated', () => {
  assert.equal(formatMotors({ n: 0, e: 0.7, s: 0, w: 0.15 }), 'M,0,179,0,38\n');
  assert.equal(formatMotors({ n: 2, e: -1, s: NaN, w: 1 }), 'M,255,0,0,255\n');
  assert.match(formatMotors({}), /^M,0,0,0,0\n$/);
});

test('stream splitting keeps partial lines and survives garbage', () => {
  let r = splitLines('', 'J,0,5');
  assert.deepEqual(r.lines, []);
  r = splitLines(r.rest, '7\nP,41');
  assert.deepEqual(r.lines, ['J,0,57']);
  r = splitLines(r.rest, '2\nB,1,1\n');
  assert.deepEqual(r.lines, ['P,412', 'B,1,1']);
  assert.equal(r.rest, '');
  // An endless line without a newline must not grow without bound.
  r = splitLines('', 'x'.repeat(10000));
  assert.ok(r.rest.length <= 64);
});
