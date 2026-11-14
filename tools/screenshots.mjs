// Takes the README / slide screenshots with headless Chrome: Home, Jukebox during a scan and
// the Demo, on a desktop (1440×900) and a phone (375×812) viewport.
//
//   node tools/screenshots.mjs http://localhost:8766/
//
// Writes docs/screenshots/<view>-<device>.jpg.

import { writeFileSync, mkdirSync } from 'node:fs';
import { launch, sleep } from './cdp.mjs';

const BASE = (process.argv[2] || 'http://localhost:8766/').replace(/#.*$/, '');
const OUT = 'docs/screenshots';
const DEVICES = [
  { name: 'desktop', width: 1440, height: 900, scale: 1, mobile: false },
  { name: 'phone', width: 375, height: 812, scale: 2, mobile: true },
];

async function shot(c, file) {
  const r = await c.send('Page.captureScreenshot', { format: 'jpeg', quality: 86 });
  writeFileSync(`${OUT}/${file}`, Buffer.from(r.result.data, 'base64'));
  const w = await c.eval('document.documentElement.scrollWidth - innerWidth');
  console.log(`${file}${w > 0 ? `  WARNING: ${w}px horizontal overflow` : ''}`);
}

/** Screenshot of a page region: from the player's top-left to the dial's bottom-right. */
async function shotPlayer(c, file) {
  const r = await c.eval(`(() => {
    document.querySelector('.keybar').style.visibility = 'hidden'; // fixed bar would cover the crop
    const a = document.querySelector('.now').getBoundingClientRect();
    const s = document.querySelector('.stage').getBoundingClientRect();
    const d = document.querySelector('.instruments').getBoundingClientRect();
    return { x: a.left - 16, y: a.top - 16, width: d.right - a.left + 32, height: s.bottom - a.top + 32 };
  })()`);
  const shot = await c.send('Page.captureScreenshot', { format: 'jpeg', quality: 86, captureBeyondViewport: true, clip: { ...r, scale: 1 } });
  await c.eval("document.querySelector('.keybar').style.visibility = ''");
  writeFileSync(`${OUT}/${file}`, Buffer.from(shot.result.data, 'base64'));
  console.log(file);
}

const key = (k, extra = '') => `window.dispatchEvent(new KeyboardEvent('keydown', { key: '${k}'${extra} }))`;

async function open(c, hash, ready) {
  await c.send('Page.navigate', { url: 'about:blank' });
  await sleep(200);
  await c.send('Page.navigate', { url: `${BASE}${hash}` });
  if ((await c.until(ready, 60000)) === null) throw new Error(`timeout waiting for ${hash}`);
  await sleep(600);
}

mkdirSync(OUT, { recursive: true });
const { c, close } = await launch(9334);
try {
  await c.send('Page.enable');
  for (const d of DEVICES) {
    await c.send('Emulation.setDeviceMetricsOverride', {
      width: d.width, height: d.height, deviceScaleFactor: d.scale, mobile: d.mobile,
    });

    await open(c, '#home', "document.body.dataset.shell === 'ready' && document.querySelector('.hero__figure img').complete");
    await shot(c, `home-${d.name}.jpg`);

    // Jukebox mid-scan: the ring is about halfway in, so the voice arcs and dial are lit.
    await open(c, '#jukebox', "document.body.dataset.ready === 'true'");
    // Zoom in three steps (the + key) so the ring and its voices are big enough to see.
    await c.eval("for (let i = 0; i < 3; i++) window.dispatchEvent(new KeyboardEvent('keydown', { key: '=' }))");
    await sleep(400);
    await c.eval("document.getElementById('btn-scan').click()");
    await sleep(3200);
    await shot(c, `jukebox-scan-${d.name}.jpg`);
    await c.eval("document.getElementById('btn-stop').click()");

    // Demo: the start screen, then the India scan with its caption.
    await open(c, '#demo', "!document.getElementById('demo-start').disabled");
    await shot(c, `demo-start-${d.name}.jpg`);
    await c.eval("document.getElementById('demo-start').click()");
    await sleep(9800);
    await shot(c, `demo-${d.name}.jpg`);
    await c.eval("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");

    if (d.name !== 'desktop') continue;
    // Slide images: a zoomed scan over Europe, and the aerosols track over West Africa.
    await open(c, '#jukebox', "document.body.dataset.ready === 'true'");
    await c.eval(key('4'));
    await c.eval(`${key('=')}; ${key('=')}`);
    await sleep(500);
    await c.eval("document.getElementById('btn-scan').click()");
    await sleep(3000);
    await shotPlayer(c, 'zoom-europe.jpg');
    await c.eval(key('Escape'));

    await c.eval(key('#', ", code: 'Digit3', shiftKey: true"));
    await c.until("document.getElementById('track-title').textContent.startsWith('Aerosols')", 20000);
    await c.eval("window.earthsonar.state.center = { name: 'West Africa', lat: 14, lon: 0 }");
    await c.eval(`${key('ArrowUp')}; ${key('ArrowDown')}`); // re-centre through the normal path
    await c.eval(`${key('.')}; ${key('.')}; ${key('.')}; ${key('.')}`); // ring 1500 -> 2500 km
    await c.eval(key('0'));
    await c.eval(`${key('=')}; ${key('=')}`);
    await sleep(800);
    await c.eval("document.getElementById('btn-scan').click()");
    await sleep(3200);
    await shotPlayer(c, 'aerosols-scan.jpg');
    await c.eval(key('Escape'));
  }
} finally {
  await close();
}
