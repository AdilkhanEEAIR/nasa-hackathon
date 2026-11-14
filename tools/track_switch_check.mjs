// Browser test for the scan button: for every ordered pair of tracks, start a scan on the first,
// switch to the second mid-scan (Shift+digit on odd pairs, a click in the track list on even
// pairs), then check that nothing is sounding, the button reads "Play scan" (aria-pressed
// false), one press starts the new track's scan and a second press stops it. Then the same
// for leaving to Home and Demo, for Esc and for a scan that ends by itself.
//
//   node tools/track_switch_check.mjs http://localhost:8766/
//   node tools/track_switch_check.mjs https://earthsonar.vercel.app/

import { launch, sleep } from './cdp.mjs';

const BASE = (process.argv[2] || 'http://localhost:8766/').replace(/#.*$/, '');
const { c, close } = await launch(9370);
const errors = [];
c.on((m) => { if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description?.split('\n')[0]); });
await c.send('Runtime.enable');
await c.send('Page.enable');
await c.send('Page.navigate', { url: `${BASE}#jukebox` });
await c.until("document.body.dataset.ready === 'true'", 60000);

const ids = JSON.parse(await c.eval("JSON.stringify([...document.querySelectorAll('#track-list li button')].map((b) => b.dataset.track || b.textContent.trim()))"));
const n = ids.length;
await c.eval(`{ const e = window.earthsonar.engine; window.__rms = () => 0;
  window.__meter = () => { if (window.__an || !e.ctx) return; const a = e.ctx.createAnalyser(); a.fftSize = 2048; e.master.connect(a); const b = new Float32Array(2048);
    window.__an = a; window.__rms = () => { a.getFloatTimeDomainData(b); let s = 0; for (const x of b) s += x * x; return Math.sqrt(s / 2048); }; }; }`);
const state = () => c.eval(`JSON.stringify({ active: window.earthsonar.scanActive(), ring: window.earthsonar.scan.running, lt: window.earthsonar.liveScan.running, needle: window.earthsonar.needle.running,
  label: document.querySelector('#btn-scan .btn-label').textContent, pressed: document.getElementById('btn-scan').getAttribute('aria-pressed'),
  videos: [...document.querySelectorAll('video')].filter((v) => !v.paused).length, track: window.earthsonar.state.track })`).then(JSON.parse);
const press = () => c.eval("document.getElementById('btn-scan').click()");
const shiftDigit = (k) => c.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: '^', code: 'Digit${k}', shiftKey: true }))`);
const clickTrack = (k) => c.eval(`document.querySelectorAll('#track-list li button')[${k - 1}].click()`);
const waitActive = () => c.until('window.earthsonar.scanActive() && (window.earthsonar.scan.running || window.earthsonar.liveScan.running || window.earthsonar.needle.running)', 60000);
const idle = (s) => !s.active && !s.ring && !s.lt && !s.needle && s.label === 'Play scan' && s.pressed === 'false' && s.videos === 0;

let fails = 0;
const check = (name, ok, detail) => { if (!ok) { fails++; console.log(`FAIL ${name}: ${detail}`); } };

await c.eval('window.earthsonar.state.durationS = 30');
for (let a = 1; a <= n; a++) {
  for (let b = 1; b <= n; b++) {
    if (a === b) continue;
    const name = `${ids[a - 1]} -> ${ids[b - 1]}`;
    await shiftDigit(a);
    await c.until(`window.earthsonar.state.track && document.querySelectorAll('#track-list [aria-current="true"], #track-list [aria-pressed="true"]').length >= 0`, 5000);
    await sleep(300);
    await c.eval('window.earthsonar.state.durationS = 30');
    await press();
    await waitActive();
    await c.eval('window.__meter()');
    await sleep(500);
    const keyboard = (a + b) % 2 === 1;
    if (keyboard) await shiftDigit(b); else await clickTrack(b);
    await sleep(400);
    const s1 = await state();
    check(name, idle(s1) && s1.track !== ids[a - 1], `after switch ${JSON.stringify(s1)}`);
    await sleep(1600);
    const rms = await c.eval('window.__rms()');
    check(name, rms < 0.004, `still sounding after switch, RMS ${rms.toFixed(4)}`);
    await c.eval('window.earthsonar.state.durationS = 30');
    await press();
    await waitActive();
    const s2 = await state();
    check(name, s2.active && s2.label === 'Stop scan' && s2.pressed === 'true', `press did not start the new track ${JSON.stringify(s2)}`);
    await sleep(300);
    await press();
    await sleep(300);
    const s3 = await state();
    check(name, idle(s3), `second press did not stop ${JSON.stringify(s3)}`);
    console.log(`${name} (${keyboard ? 'Shift+digit' : 'click'}): ok`);
  }
}

// Leaving the Jukebox, Esc, and a scan that ends by itself.
for (const [label, act] of [
  ['leave to Home', () => c.eval("document.getElementById('tab-home').click()")],
  ['leave to Demo', () => c.eval("document.getElementById('tab-demo').click()")],
  ['Esc', () => c.eval("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))")],
]) {
  for (const k of [1, 3, 6, 8]) {
    await c.eval("document.getElementById('tab-jukebox').click()");
    await sleep(300);
    await shiftDigit(k);
    await sleep(300);
    await press();
    await waitActive();
    await sleep(500);
    await act();
    await sleep(400);
    const s = await state();
    check(`${label} on ${ids[k - 1]}`, idle(s), JSON.stringify(s));
    console.log(`${label} on ${ids[k - 1]}: ${idle(s) ? 'ok' : 'FAIL'}`);
  }
}
await c.eval("document.getElementById('tab-jukebox').click()");
for (const k of [1, 3, 6, 8]) {
  await shiftDigit(k);
  await sleep(300);
  await c.eval('window.earthsonar.state.durationS = 4');
  await press();
  await waitActive();
  await c.until('!window.earthsonar.scanActive()', 30000).catch(() => {});
  await sleep(300);
  const s = await state();
  check(`ends by itself on ${ids[k - 1]}`, idle(s), JSON.stringify(s));
  console.log(`ends by itself on ${ids[k - 1]}: ${idle(s) ? 'ok' : 'FAIL'}`);
}

console.log(`\n${fails ? `${fails} FAILED` : 'all passed'}; page errors: ${errors.length ? errors.join(' | ') : 'none'}`);
await close();
process.exit(fails || errors.length ? 1 : 0);
