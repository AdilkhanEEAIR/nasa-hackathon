// Opens the Jukebox and reloads it N times in a row (normal browser cache, like a person
// pressing F5), checking that every load reaches "ready" and the visible map image is drawn. A load that
// takes longer than the timeout counts as a hang.
//
//   node tools/reload_check.mjs https://earthsonar.vercel.app/ 10

import { launch, sleep } from './cdp.mjs';

const BASE = (process.argv[2] || 'https://earthsonar.vercel.app/').replace(/#.*$/, '');
const N = Number(process.argv[3] || 10);
const TIMEOUT = 30000;

const { c, close } = await launch(9345);
const errors = [];
c.on((m) => {
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description?.split('\n')[0]);
});
let hangs = 0;
try {
  await c.send('Runtime.enable');
  await c.send('Page.enable');
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  const times = [];
  for (let i = 0; i < N; i++) {
    const t0 = Date.now();
    if (i === 0) await c.send('Page.navigate', { url: `${BASE}#jukebox` });
    else await c.send('Page.reload', { ignoreCache: false });
    await sleep(100);
    const ms = await c.until("document.body && document.body.dataset.ready === 'true' && (() => { const f = document.querySelector('.map-img.front'); return f && f.complete && f.naturalWidth > 0; })()", TIMEOUT);
    const ok = ms !== null;
    if (!ok) hangs++;
    times.push(ok ? Date.now() - t0 : null);
    console.log(`load ${String(i + 1).padStart(2)}: ${ok ? `ready in ${((Date.now() - t0) / 1000).toFixed(2)} s` : `HANG (not ready after ${TIMEOUT / 1000} s)`}`);
  }
  const ok = times.filter((t) => t !== null).sort((a, b) => a - b);
  console.log(`\n${N - hangs}/${N} loads ready, ${hangs} hangs; median ${(ok[Math.floor(ok.length / 2)] / 1000).toFixed(2)} s, slowest ${(ok.at(-1) / 1000).toFixed(2)} s; page errors: ${errors.length ? errors.join(' | ') : 'none'}`);
} finally {
  await close();
}
process.exitCode = hangs ? 1 : 0;
