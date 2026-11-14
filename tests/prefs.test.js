import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPrefs, savePrefs, mayVoiceSpeak, SPOKEN_KINDS, DEFAULT_PREFS } from '../js/prefs.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

test('both options are off by default', () => {
  assert.deepEqual(DEFAULT_PREFS, { voice: false, large: false });
  assert.deepEqual(loadPrefs(memoryStorage()), { voice: false, large: false });
});

test('choices are remembered, and blocked storage never throws', () => {
  const s = memoryStorage();
  savePrefs({ voice: true, large: false }, s);
  assert.deepEqual(loadPrefs(s), { voice: true, large: false });
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.deepEqual(loadPrefs(blocked), { voice: false, large: false });
  assert.doesNotThrow(() => savePrefs({ voice: true, large: true }, blocked));
  const garbage = { getItem: () => '{not json', setItem() {} };
  assert.deepEqual(loadPrefs(garbage), { voice: false, large: false });
});

test('the guide is silent on tab changes and outside the Jukebox, even when on', () => {
  for (const tab of ['home', 'demo', 'jukebox']) {
    for (const kind of [null, undefined, 'tab', 'loading', 'status']) {
      assert.equal(mayVoiceSpeak({ voiceOn: true, tab, kind }), false, `${tab}/${kind}`);
    }
  }
  for (const kind of SPOKEN_KINDS) {
    assert.equal(mayVoiceSpeak({ voiceOn: true, tab: 'home', kind }), false, `home/${kind}`);
    assert.equal(mayVoiceSpeak({ voiceOn: true, tab: 'demo', kind }), false, `demo/${kind}`);
    assert.equal(mayVoiceSpeak({ voiceOn: false, tab: 'jukebox', kind }), false, `off/${kind}`);
    assert.equal(mayVoiceSpeak({ voiceOn: true, tab: 'jukebox', kind }), true, `jukebox/${kind}`);
  }
  assert.deepEqual([...SPOKEN_KINDS].sort(), ['intro', 'result', 'tutorial', 'where']);
});

test('the tab shell cannot speak: no speech API and no announcements in js/site.js', () => {
  const site = read('js/site.js');
  assert.doesNotMatch(site, /from '\.\/speech\.js'|speechSynthesis|SpeechSynthesisUtterance|\.say\(|announce\(/);
});

test('every spoken line in the player names an allowed kind', () => {
  const app = read('js/app.js');
  const kinds = [...app.matchAll(/say: '([a-z]+)'/g)].map((m) => m[1]);
  assert.ok(kinds.length >= 8);
  for (const k of kinds) assert.ok(SPOKEN_KINDS.includes(k), k);
  assert.doesNotMatch(app, /speak: true/, 'the old always-speak flag is gone');
  assert.equal((app.match(/voice\.say\(/g) || []).length, 1, 'one guarded call site');
});

test('the Accessibility switch is the first focusable element and has a clear name', () => {
  const html = read('index.html');
  const body = html.slice(html.indexOf('<body'));
  const first = /<(a|button|input|select|textarea)\b[^>]*>/.exec(body);
  assert.match(first[0], /id="a11y-toggle"/);
  assert.match(first[0], /aria-keyshortcuts="Alt\+A"/);
  assert.match(body, /Accessibility<span class="sr-only"> options: voice guide, large text and high contrast/);
});

test('the tab shell wires the Accessibility menu exactly once', () => {
  const site = read('js/site.js');
  assert.equal((site.match(/function wireAccessibility\(/g) || []).length, 1);
  assert.equal((site.match(/^wireAccessibility\(\);/gm) || []).length, 1);
});
