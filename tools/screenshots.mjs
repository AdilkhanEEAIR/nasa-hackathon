import { writeFileSync, mkdirSync } from 'node:fs';
import { launch, sleep } from './cdp.mjs';

const BASE = (process.argv[2] || 'http://localhost:8766/').replace(/#.*$/, '');
const OUT = 'docs/screenshots';
const DESKTOP = { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false };
const PHONE = { width: 375, height: 812, deviceScaleFactor: 2, mobile: true };

function save(file, data) {
  writeFileSync(`${OUT}/${file}`, Buffer.from(data, 'base64'));
  console.log(file);
}

async function shot(c, file, clip = null) {
  const params = { format: 'jpeg', quality: 86 };
  if (clip) Object.assign(params, { captureBeyondViewport: true, clip: { ...clip, scale: 1 } });
  save(file, (await c.send('Page.captureScreenshot', params)).result.data);
}

async function shotPlayer(c, file) {
  const clip = await c.eval(`(() => {
    document.querySelector('.keybar').style.visibility = 'hidden';
    const a = document.querySelector('.now').getBoundingClientRect();
    const s = document.querySelector('.stage').getBoundingClientRect();
    const d = document.querySelector('.instruments').getBoundingClientRect();
    return { x: a.left - 16, y: a.top - 16 + scrollY, width: d.right - a.left + 32, height: s.bottom - a.top + 32 };
  })()`);
  await shot(c, file, clip);
  await c.eval("document.querySelector('.keybar').style.visibility = ''");
}

const key = (k, extra = '') => `window.dispatchEvent(new KeyboardEvent('keydown', { key: '${k}'${extra} }))`;

async function open(c, hash, ready) {
  await c.send('Page.navigate', { url: 'about:blank' });
  await sleep(200);
  await c.send('Page.navigate', { url: `${BASE}${hash}` });
  if ((await c.until(ready, 60000)) === null) throw new Error(`timeout waiting for ${hash}`);
  await sleep(800);
}

const HOME_READY = "document.body.dataset.shell === 'ready' && document.querySelector('.hero__figure img').complete && document.querySelector('.hero__figure img').naturalWidth > 0";
const PLAYER_READY = "document.body.dataset.ready === 'true'";

async function europeScan(c) {
  await c.eval(key('4'));
  await c.eval("{ const y = document.getElementById('year'); y.value = '2023'; y.dispatchEvent(new Event('change')); }");
  await sleep(1200);
  await c.eval("document.getElementById('btn-scan').click()");
  await c.until('window.earthsonar.scan.running', 20000);
  await sleep(3000);
}

mkdirSync(OUT, { recursive: true });
const { c, close } = await launch(9334);
try {
  await c.send('Page.enable');
  await c.send('Emulation.setDeviceMetricsOverride', DESKTOP);

  await open(c, '#home', HOME_READY);
  await shot(c, 'home-desktop.jpg');

  await c.eval("document.getElementById('a11y-toggle').click()");
  await sleep(400);
  await shot(c, 'accessibility-menu.jpg', { x: 540, y: 0, width: 900, height: 560 });

  await open(c, '#jukebox', PLAYER_READY);
  await c.eval(`${key('=')}; ${key('=')}`);
  await europeScan(c);
  await shotPlayer(c, 'jukebox-ring-scan.jpg');
  await c.eval(key('Escape'));

  await c.eval(key('0'));
  await c.eval(key('^', ", code: 'Digit6', shiftKey: true"));
  await c.until("document.getElementById('needle-video').readyState >= 2", 60000);
  await c.eval("document.getElementById('needle-video').currentTime = 21.5");
  await sleep(1500);
  await c.eval("document.getElementById('btn-scan').click()");
  await c.until('window.earthsonar.needle.running', 30000);
  await sleep(1800);
  await shotPlayer(c, 'needle-forest.jpg');
  await c.eval(key('Escape'));

  await c.send('Emulation.setDeviceMetricsOverride', PHONE);
  await open(c, '#home', HOME_READY);
  await shot(c, 'home-phone.jpg');
  await open(c, '#jukebox', PLAYER_READY);
  await europeScan(c);
  await c.eval("document.querySelector('.stage').scrollIntoView({ block: 'center' })");
  await sleep(300);
  await shot(c, 'jukebox-phone.jpg');
  await c.eval(key('Escape'));
} finally {
  await close();
}
