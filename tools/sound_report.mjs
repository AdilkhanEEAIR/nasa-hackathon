// Renders ring scans offline in headless Chrome, with the site's own synthesis code, and
// measures how they differ: we cannot listen in CI, so differences are shown as numbers.
//
//   node tools/sound_report.mjs http://localhost:8766/ [out.json]
//
// For every case (track + place) it reports:
//   voices    share of the 16 ring voices that sound at all, averaged over the scan
//   tempC     mean temperature heard by the voices (ocean only)
//   rms       loudness of the whole render
//   centroid  spectral centroid in Hz: how bright the timbre is
//   hiShare   share of spectral energy above 1.5 kHz: how many strong harmonics
//   flicker   dominant envelope fluctuation, 1-16 Hz: how fast the sound shimmers or pulses
//   modDepth  envelope fluctuation depth (std / mean after removing the slow ring swell)
//   wobble    spread of the instantaneous spectral centroid (Hz): audible sliding/gliding
//   tonal     share of spectral energy in the 40 strongest bins: high = clear tones, low = noise

import { writeFileSync } from 'node:fs';
import { launch } from './cdp.mjs';

const BASE = (process.argv[2] || 'http://localhost:8766/').replace(/#.*$/, '');
const OUT = process.argv[3] || null;

const PAGE_CODE = String.raw`
(async () => {
  const { fetchBlob, blobToPixels, channelField } = await import('./js/loader.js');
  const { buildMask } = await import('./js/fields.js');
  const { readRing, renderScan } = await import('./js/scan.js');
  const T = await import('./js/tracks.js');
  const manifest = await (await fetch('manifest.json')).json();
  const grid = async (u) => blobToPixels(await fetchBlob(u));
  const maskImg = await grid(manifest.landMask.file);
  const land = buildMask(maskImg.data, maskImg.width, maskImg.height);
  const fields = {
    nightlights: channelField(await grid(manifest.nightlights.years['2023'].sound), 0),
    nightlights2012: channelField(await grid(manifest.nightlights.years['2012'].sound), 0),
    aerosols: T.aerosolFields(await grid(manifest.aerosols.sound)),
    ocean: T.oceanFields(await grid(manifest.ocean.sound)),
    wind: T.windFields(await grid(manifest.wind.sound)),
  };

  // ---- analysis helpers
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const a = (-2 * Math.PI) / len;
      for (let i = 0; i < n; i += len) {
        for (let k = 0; k < len / 2; k++) {
          const c = Math.cos(a * k), s = Math.sin(a * k);
          const xr = re[i + k + len / 2] * c - im[i + k + len / 2] * s;
          const xi = re[i + k + len / 2] * s + im[i + k + len / 2] * c;
          re[i + k + len / 2] = re[i + k] - xr; im[i + k + len / 2] = im[i + k] - xi;
          re[i + k] += xr; im[i + k] += xi;
        }
      }
    }
  }
  function analyse(buf, scanS) {
    const sr = buf.sampleRate;
    const L = buf.getChannelData(0), R = buf.getChannelData(1);
    const n = Math.floor(scanS * sr);
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = 0.5 * (L[i] + R[i]);
    let ss = 0; for (let i = 0; i < n; i++) ss += x[i] * x[i];
    const rms = Math.sqrt(ss / n);
    // Spectrum: 4096-point frames, Hann window.
    const N = 4096; const hop = 2048;
    let cNum = 0, cDen = 0, hi = 0; const cents = []; let tonSum = 0, tonN = 0;
    for (let s = 0; s + N <= n; s += hop) {
      const re = new Float64Array(N), im = new Float64Array(N);
      for (let i = 0; i < N; i++) re[i] = x[s + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
      fft(re, im);
      let fn = 0, fd = 0; const pw = new Float64Array(N / 2);
      for (let k = 1; k < N / 2; k++) {
        const p = re[k] * re[k] + im[k] * im[k]; const f = (k * sr) / N;
        pw[k] = p; fn += f * p; fd += p; if (f > 1500) hi += p;
      }
      if (fd > 1e-6) { const top = Array.from(pw).sort((a, b) => b - a).slice(0, 40).reduce((a, b) => a + b, 0); tonSum += top / fd; tonN++; }
      if (fd > 1e-9) cents.push(fn / fd);
      cNum += fn; cDen += fd;
    }
    const centroid = cDen > 0 ? cNum / cDen : 0;
    const mean = cents.reduce((a, b) => a + b, 0) / Math.max(1, cents.length);
    const wobble = Math.sqrt(cents.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, cents.length));
    // Envelope at 200 Hz, slow swell removed with a 0.5 s moving average.
    const eh = Math.floor(sr / 200); const env = [];
    for (let s = 0; s + eh <= n; s += eh) { let e = 0; for (let i = 0; i < eh; i++) e += x[s + i] * x[s + i]; env.push(Math.sqrt(e / eh)); }
    const W = 100; const fast = [];
    for (let i = W / 2; i < env.length - W / 2; i++) {
      let m = 0; for (let j = i - W / 2; j < i + W / 2; j++) m += env[j]; m /= W;
      fast.push(m > 1e-5 ? env[i] / m - 1 : 0);
    }
    let ms = 0; for (const v of fast) ms += v * v;
    const modDepth = Math.sqrt(ms / Math.max(1, fast.length));
    // Dominant fluctuation 1-16 Hz from a DFT of the normalised envelope.
    let best = 0, bestP = 0;
    for (let f = 1; f <= 16; f += 0.25) {
      let a = 0, b = 0;
      for (let i = 0; i < fast.length; i++) { const w = (2 * Math.PI * f * i) / 200; a += fast[i] * Math.cos(w); b += fast[i] * Math.sin(w); }
      const p = a * a + b * b; if (p > bestP) { bestP = p; best = f; }
    }
    return { rms, centroid, hiShare: cDen > 0 ? hi / cDen : 0, flicker: best, modDepth, wobble, tonal: tonN ? tonSum / tonN : 0 };
  }

  const out = [];
  for (const c of window.__cases) {
    const cfg = T.TRACK_SOUND[c.track];
    const f = fields[c.field || c.track];
    // Ring statistics at five radii, read with the track's own voice mapping.
    let sounding = 0, total = 0, tSum = 0, tN = 0, mSum = 0;
    for (const k of [1, 0.8, 0.6, 0.4, 0.2]) {
      for (const v of readRing(f, land, c, c.radiusKm * k, cfg.fullScale)) {
        const m = cfg.mapVoice ? cfg.mapVoice(v) : { gains: v.gains };
        total++;
        if (Math.max(0, ...Object.values(m.gains)) > 0.05) sounding++;
        if (m.temp !== undefined && m.temp !== null) { tSum += m.temp; tN++; mSum += m.motion || 0; }
      }
    }
    const buf = await renderScan({
      fields: f, landField: land, center: c, radiusKm: c.radiusKm, durationS: 8,
      layers: cfg.layers, fullScale: cfg.fullScale, trim: cfg.trim, mapVoice: cfg.mapVoice, coastClicks: false,
    });
    out.push({ ...c, voices: sounding / total, tempC: tN ? tSum / tN : null, motion: tN ? mSum / tN : null, ...analyse(buf, 8) });
  }
  return out;
})()`;

const CASES = JSON.parse(process.env.CASES || 'null') || [
  // Old shared presets on the ocean track (the hypothesis: mostly land, little contrast).
  { track: 'ocean', name: 'India (old preset)', lat: 22.5, lon: 79.0, radiusKm: 1500 },
  { track: 'ocean', name: 'Europe (old preset)', lat: 48.5, lon: 9.0, radiusKm: 1500 },
  // Ocean presets.
  { track: 'ocean', name: 'Gulf Stream', lat: 38, lon: -68, radiusKm: 1200 },
  { track: 'ocean', name: 'Kuroshio', lat: 35, lon: 145, radiusKm: 1200 },
  { track: 'ocean', name: 'Agulhas', lat: -38, lon: 24, radiusKm: 1200 },
  { track: 'ocean', name: 'Equatorial Pacific', lat: 0, lon: -120, radiusKm: 1500 },
  { track: 'ocean', name: 'Southern Ocean front', lat: -52, lon: 140, radiusKm: 1200 },
  // Other tracks: two places each should not sound alike.
  { track: 'nightlights', name: 'India 2023', lat: 22.5, lon: 79.0, radiusKm: 1500 },
  { track: 'nightlights', name: 'Europe 2023', lat: 48.5, lon: 9.0, radiusKm: 1500 },
  { track: 'nightlights', name: 'Sahara 2023', lat: 23, lon: 10, radiusKm: 1500 },
  { track: 'aerosols', name: 'Sahara dust', lat: 18, lon: 2, radiusKm: 1500 },
  { track: 'aerosols', name: 'Central Africa smoke', lat: -9, lon: 22, radiusKm: 1500 },
  { track: 'aerosols', name: 'East China', lat: 32, lon: 114, radiusKm: 1500 },
  { track: 'aerosols', name: 'Southern Ocean (sulfate, old candidate)', lat: -50, lon: 40, radiusKm: 1500 },
  { track: 'aerosols', name: 'Indian Ocean sea salt', lat: -15, lon: 65, radiusKm: 1500 },
];

const { c, close } = await launch(9340);
try {
  await c.send('Page.enable');
  await c.send('Page.navigate', { url: BASE });
  await c.until("document.readyState === 'complete'", 30000);
  await c.eval(`window.__cases = ${JSON.stringify(CASES)}`);
  const r = await c.send('Runtime.evaluate', { expression: PAGE_CODE, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 800));
  const rows = r.result.result.value;
  const fmt = (v, d = 2) => (v === null || v === undefined ? '–' : v.toFixed(d));
  console.log('| Track | Place | Voices sounding | Temp heard °C | Current motion 0-1 | RMS | Centroid Hz | Energy >1.5 kHz | Flicker Hz | Mod depth | Wobble Hz | Tonal |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const x of rows) {
    console.log(`| ${x.track} | ${x.name} | ${Math.round(x.voices * 100)}% | ${fmt(x.tempC, 1)} | ${fmt(x.motion)} | ${fmt(x.rms, 3)} | ${Math.round(x.centroid)} | ${Math.round(x.hiShare * 100)}% | ${fmt(x.flicker, 2)} | ${fmt(x.modDepth)} | ${Math.round(x.wobble)} | ${fmt(x.tonal)} |`);
  }
  if (OUT) writeFileSync(OUT, JSON.stringify(rows, null, 1));
} finally {
  await close();
}
