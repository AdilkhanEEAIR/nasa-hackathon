// EarthSonar application: tracks, state, keyboard control, announcements.
// Everything is reachable from the keyboard; every button shows its shortcut.

import { SonicEngine, DEFAULT_LAYERS } from './audio.js';
import { RingScan, motorLevels, renderScanWav, readPoint, readRing } from './scan.js';
import { MapView, reducedMotion } from './view.js';
import { VoiceDial } from './dial.js';
import { buildMask, meanOver, sampleField } from './fields.js';
import { clampLat, normalizeLon, formatLatLon, diskPoints } from './geo.js';
import { degreeToFreq, degreeForIndex } from './music.js';
import {
  CHANGE_LAYERS, CHANGE_COLORS, dominant, describeChange,
  AEROSOL_LAYERS, AEROSOL_COLORS, AEROSOL_NAMES, aerosolFields, describeAerosol,
  LIGHTNING_LAYERS, LIGHTNING_COVERAGE_LAT, strikeRate,
} from './tracks.js';
import { LightningSource } from './lightning.js';
import { LiveRingScan } from './scan.js';
import { fetchBlob, blobToPixels, channelField, supportsWebp, Progress } from './loader.js';
import { Voice } from './speech.js';
import { describePlace } from './places.js';

const YEARS = Array.from({ length: 12 }, (_, i) => 2012 + i);
const AMBER = '#ffd56a';

/** Tracks whose map is split into named classes, each played by its own instrument. */
const CLASS_TRACKS = {
  change: {
    layers: CHANGE_LAYERS, colors: CHANGE_COLORS, describe: describeChange, slug: 'change-2012-2023',
    names: { more: 'more light', less: 'less light', same: 'little change' }, when: 'Changes 2012 to 2023', fullScale: 0.08, trim: 1.3,
    map: 'Map of change in night lights between 2012 and 2023: purple more light, orange less light, white little change.',
  },
  aerosols: {
    layers: AEROSOL_LAYERS, colors: AEROSOL_COLORS, describe: describeAerosol, slug: 'aerosols-2025-08-19',
    names: AEROSOL_NAMES, when: '19 August 2025, 20:00 UTC', fullScale: 0.6, trim: 0.9,
    map: 'Aerosol map for 19 August 2025: orange smoke and black carbon, purple dust, blue sea salt, green sulfate.',
  },
};
const classTrack = () => CLASS_TRACKS[state.track] || null;

export const TRACKS = [
  { id: 'nightlights', title: 'Night Lights 2012–2023', blurb: 'A decade of cities at night, one year at a time.', ready: true,
    intro: 'Night Lights, 2012 to 2023: yearly maps of light at night from NASA Black Marble. Warm bell tones are city lights; louder and brighter means more light. A soft muffled hum is unlit land, and silence is water. Page Up and Page Down change the year.' },
  { id: 'change', title: 'What Changed', blurb: 'More light, less light, no change: 2012 → 2023.', ready: true,
    intro: 'What Changed: the difference between 2012 and 2023. A high bright sparkle means more light in 2023. A low muffled buzz means less light. A soft quiet tone means little change. Y gives a summary of the ring.' },
  { id: 'aerosols', title: 'Aerosols', blurb: 'Dust, smoke, sea salt and sulfate in one day of air.', ready: true,
    intro: 'Aerosols: tiny particles in the air from the GEOS model, 19 August 2025. Each type has its own sound. Smoke and black carbon crackle like fire. Dust is a dry rustle. Sea salt is soft surf. Sulfate is a buzzing tone. Louder means more. Y gives a summary of the ring.' },
  { id: 'lightning', title: 'Lightning', blurb: 'Six years of storms seen from the space station.', ready: true,
    intro: 'Lightning: flashes seen by the Lightning Imaging Sensor on the International Space Station, 2017 to 2023, shown as a 10-day window. Each new flash is a sharp crack in its direction; many storms make a low thunder rumble. The sensor only sees up to about 52 degrees north and south, so silence there means no data. Space plays and pauses; Page Up and Page Down jump a month.' },
];

export const PRESETS = [
  { key: '1', name: 'India', lat: 22.5, lon: 79.0, radiusKm: 1500 },
  { key: '2', name: 'China', lat: 32.0, lon: 110.0, radiusKm: 2000 },
  { key: '3', name: 'Bishkek', lat: 42.87, lon: 74.59, radiusKm: 1500 },
  { key: '4', name: 'Europe', lat: 48.5, lon: 9.0, radiusKm: 1500 },
];

const $ = (id) => document.getElementById(id);

const state = {
  track: 'nightlights',
  year: 2012,
  center: { ...PRESETS[0] },
  radiusKm: PRESETS[0].radiusKm,
  durationS: 8,
  manifest: null,
  fields: new Map(),   // year -> value field
  change: null,        // {more, less, same} value fields from the change map
  land: null,
  busy: false,
  aerosols: null,      // {smoke, dust, salt, sulfate} value fields
  explore: false,     // explore mode: a sustained probe tone at the centre point
  probeLand: null,
};

const engine = new SonicEngine();
const voice = new Voice();
let pendingScan = false; // Space pressed before the first data arrived: start when ready
const view = new MapView({
  world: $('world'),
  imgA: $('map-a'),
  imgB: $('map-b'),
  overlay: $('overlay'),
  onClick: (geo) => setCenter(geo),
  onCamera: (cam) => {
    $('zoom-badge').textContent = `${cam.s < 10 ? cam.s.toFixed(1) : Math.round(cam.s)}×`;
    showFrame();
  },
});
const dial = new VoiceDial($('dial'));

/** Colour of a voice in the visuals: the instrument that is loudest on its arc. */
function voiceColor(v) {
  if (classTrack()) return classTrack().colors[dominant(v.gains)] || AMBER;
  return AMBER;
}

const scan = new RingScan(engine, {
  onStep: ({ ring }) => {
    for (const v of ring) v.color = voiceColor(v);
    view.setRing(ring);
    dial.update(ring.map((v) => v.gain), motorLevels(ring), ring.map((v) => v.color));
  },
  onEnd: ({ completed, centreLevel, centreKind }) => {
    setScanButton(false);
    view.setRing(null);
    dial.clear();
    if (completed) {
      view.pulseCentre(centreLevel);
      const what = classTrack() ? classTrack().describe(centreLevel > 0.001 ? centreKind : null) : describeLevel(centreLevel);
      announce(`Scan finished. At the centre: ${what}.`);
    }
  },
});

// Lightning: arc density of dots that is heard at full rumble loudness (fixed for the video).
const LIGHTNING_FULL = 0.04;
// Measured live against the night-lights scan (analyser on the master bus): RMS 0.022 vs
// 0.073, so the lightning track is lifted to match.
const LIGHTNING_TRIM = 2.5;
let lightning = null; // LightningSource, created when track 4 is first chosen

const liveScan = new LiveRingScan(engine, {
  onStep: ({ ring }) => {
    for (const v of ring) v.color = v.struck ? '#ffffff' : '#ffe04d';
    view.setRing(ring);
    dial.update(ring.map((v) => v.gain), motorLevels(ring), ring.map((v) => v.color));
    if (lightning) $('year-readout').textContent = lightning.date;
  },
});

// ---------------------------------------------------------------- announcements

let announceTimer = 0;
/**
 * Polite live region (cleared first so repeating the same sentence is still read out), and
 * optionally the spoken guide for listeners without a screen reader.
 */
function announce(text, { speak = true } = {}) {
  const el = $('status');
  el.textContent = '';
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => { el.textContent = text; }, 60);
  if (speak) voice.say(text);
}

function describeLevel(level) {
  if (level < 0.01) return 'dark, no lights';
  if (level < 0.15) return 'faint lights';
  if (level < 0.45) return 'moderate lights';
  return 'bright lights';
}

function centreLabel() {
  const c = state.center;
  return c.name ? `${c.name} (${formatLatLon(c.lat, c.lon)})` : formatLatLon(c.lat, c.lon);
}

function updateDescription() {
  const isLt = state.track === 'lightning';
  const map = classTrack() ? classTrack().map
    : isLt ? `Lightning map${lightning && lightning.date ? ` for the 10 days to ${lightning.date}` : ''}: yellow dots are flashes seen from the space station.`
      : `Night lights map for ${state.year}.`;
  $('overlay').setAttribute('aria-label', `${map} Ring centre: ${centreLabel()}. Ring size ${state.radiusKm} kilometres.`);
  $('centre-readout').textContent = state.center.name || formatLatLon(state.center.lat, state.center.lon);
  $('year-readout').textContent = state.track === 'change' ? '2012 → 2023'
    : state.track === 'aerosols' ? '19 Aug 2025'
      : isLt ? (lightning && lightning.date) || '2017–2023' : String(state.year);
  $('radius-readout').textContent = `${state.radiusKm} km`;
  $('when-label').textContent = state.track === 'nightlights' ? 'Year' : 'Date';
  markTimeline(classTrack() || isLt ? null : state.year);
}

// ---------------------------------------------------------------- data loading

// Sound and sight are separate files: lossless PNG grids hold the exact values the sound
// uses; lossy WebP/JPEG views are only for the eyes. Only the first year loads before the
// player is ready; everything else loads on demand or in the background afterwards.

let viewExt = 'jpg';
const inflight = new Map(); // url -> Promise, so a file is never fetched twice

function viewUrl(entry) {
  return entry.view[viewExt];
}

function yearUrl(year) {
  return viewUrl(state.manifest.nightlights.years[String(year)]);
}

function trackImageUrl() {
  return viewUrl(currentEntry());
}

function currentEntry() {
  if (state.track === 'change') return state.manifest.nightlights.change;
  if (state.track === 'aerosols') return state.manifest.aerosols;
  return state.manifest.nightlights.years[String(state.year)];
}

const HI_RES_FROM = 1.5;

/**
 * Shows the current frame: the 1920-px view normally, the 3840-px source view once zoomed
 * past 1.5x. The high-resolution file is fetched only for the frame on screen, only when
 * needed, and swapped in when it has arrived (so zooming never shows a blank map).
 */
function showFrame({ fade = false } = {}) {
  if (!state.manifest || state.track === 'lightning') return; // the video is its own frame
  const entry = currentEntry();
  const low = viewUrl(entry);
  const hi = entry.viewHi ? entry.viewHi[viewExt] : null;
  const wantHi = hi && view.cam.s > HI_RES_FROM;
  if (!wantHi) {
    // Zoomed back out: keep the sharper image if it is already this frame's.
    if (!hi || view.currentImage !== hi) view.setImage(low, { fade });
    return;
  }
  if (view.currentImage === hi) return;
  if (inflight.has(hi)) {
    inflight.get(hi).then(() => { if (currentEntry() === entry) view.setImage(hi); });
    if (view.currentImage !== low) view.setImage(low, { fade });
    return;
  }
  if (view.currentImage !== low) view.setImage(low, { fade });
  prefetchView(hi).then(() => {
    if (currentEntry() === entry && view.cam.s > HI_RES_FROM) view.setImage(hi);
  });
}

function once(url, fn) {
  if (!inflight.has(url)) inflight.set(url, fn().catch((e) => { inflight.delete(url); throw e; }));
  return inflight.get(url);
}

async function loadGrid(url, onProgress) {
  return once(url, async () => blobToPixels(await fetchBlob(url, onProgress)));
}

/** Warms the HTTP cache and decodes a view image, so showing it later is instant. */
function prefetchView(url) {
  return once(url, async () => {
    const img = new Image();
    img.src = url;
    await img.decode().catch(() => {});
  });
}

async function loadYear(year, progress) {
  if (state.fields.has(year)) return;
  const entry = state.manifest.nightlights.years[String(year)];
  const img = await loadGrid(entry.sound, progress && progress.part(`sound-${year}`));
  if (progress) progress.finish(`sound-${year}`);
  state.fields.set(year, channelField(img, 0));
}

async function loadChange(progress) {
  if (state.change) return;
  const entry = state.manifest.nightlights.change;
  const [img] = await Promise.all([
    loadGrid(entry.sound, progress && progress.part('sound-change')),
    prefetchView(viewUrl(entry)),
  ]);
  if (progress) progress.finish('sound-change');
  // R, G, B channels = more, less, same (see tools/prepare_media.py).
  state.change = { more: channelField(img, 0), less: channelField(img, 1), same: channelField(img, 2) };
}

/** Value fields for the current track (and year). */
async function loadAerosols(progress) {
  if (state.aerosols) return;
  const entry = state.manifest.aerosols;
  const [img] = await Promise.all([
    loadGrid(entry.sound, progress && progress.part('sound-aerosols')),
    prefetchView(viewUrl(entry)),
  ]);
  if (progress) progress.finish('sound-aerosols');
  state.aerosols = aerosolFields(img);
}

async function currentFields() {
  if (state.track === 'change') {
    if (!state.change) await withProgress('What Changed', (p) => loadChange(p));
    return state.change;
  }
  if (state.track === 'aerosols') {
    if (!state.aerosols) await withProgress('Aerosols', (p) => loadAerosols(p));
    return state.aerosols;
  }
  if (state.track === 'lightning') {
    if (!lightning) lightning = new LightningSource($('map-video'), state.manifest.lightning);
    if (!lightning.ready) await withProgress('Lightning', (p) => lightning.load(p));
    const f = lightning.frame() || { field: lightning.field };
    return { rumble: f.field };
  }
  await loadYear(state.year);
  return state.fields.get(state.year);
}

function currentLayers() {
  if (state.track === 'lightning') return LIGHTNING_LAYERS;
  return classTrack() ? classTrack().layers : DEFAULT_LAYERS;
}

// ---------------------------------------------------------------- lightning playback

async function toggleLightning() {
  const v = $('map-video');
  if (liveScan.running) {
    liveScan.stop();
    v.pause();
    setScanButton(false);
    view.setRing(null);
    dial.clear();
    announce(`Paused at ${lightning.date}.`);
    return;
  }
  await currentFields();
  setScanButton(true);
  announce(`Playing lightning from ${lightning.date}, ring around ${centreLabel()}.`, { speak: false });
  try { await v.play(); } catch (err) { console.error(err); }
  liveScan.start({
    getFrame: () => lightning.frame(),
    center: state.center,
    radiusKm: state.radiusKm,
    durationS: state.durationS,
    fullScale: LIGHTNING_FULL,
    coverageLat: LIGHTNING_COVERAGE_LAT,
    strikeRate: (lvl) => strikeRate(lvl),
  });
  v.onended = () => { if (liveScan.running) toggleLightning(); };
}

/** Page Up / Page Down move about one month (the video runs ~1 s per month). */
function seekLightning(deltaSeconds, absolute = null) {
  if (!lightning || !lightning.ready) return;
  if (absolute === null) lightning.seekBy(deltaSeconds);
  else lightning.seekTo(absolute);
  $('map-video').addEventListener('seeked', () => {
    lightning.refresh();
    updateDescription();
    announce(lightning.date);
    updateProbe();
  }, { once: true });
}

/**
 * Runs a load job with a visible progress bar, a live-region message and (if the job takes
 * a while) spoken progress. Short jobs only say "ready", to avoid chatter.
 */
async function withProgress(label, job) {
  const bar = $('loadbar');
  const fill = bar.querySelector('.fill');
  const t0 = performance.now();
  let lastSpoken = 0;
  bar.hidden = false;
  bar.setAttribute('aria-label', `Loading ${label}`);
  announce(`Loading ${label}…`, { speak: true });
  const progress = new Progress((f) => {
    const pct = Math.round(f * 100);
    bar.setAttribute('aria-valuenow', String(pct));
    fill.style.transform = `scaleX(${f})`;
    const slow = performance.now() - t0 > 1500;
    if (slow && pct - lastSpoken >= 25 && pct < 100) {
      lastSpoken = pct;
      announce(`Loading ${label}: ${pct} percent.`, { speak: true });
    }
  });
  try {
    await job(progress);
    announce(`${label} ready.`, { speak: performance.now() - t0 > 600 });
  } finally {
    bar.hidden = true;
    fill.style.transform = 'scaleX(0)';
  }
}

/** Background loading after the first screen is ready: other years, then the next track. */
async function prefetchRest() {
  const idle = () => new Promise((r) => (window.requestIdleCallback ? requestIdleCallback(() => r(), { timeout: 800 }) : setTimeout(r, 50)));
  for (const y of YEARS) {
    await idle();
    await Promise.all([loadYear(y), prefetchView(yearUrl(y))]).catch(() => {});
  }
  await idle();
  await loadChange().catch(() => {});
}

async function init() {
  announce('Loading Night Lights…');
  const [manifest, webp] = await Promise.all([fetch('manifest.json').then((r) => r.json()), supportsWebp()]);
  state.manifest = manifest;
  viewExt = webp ? 'webp' : 'jpg';
  // Everything the first screen needs, in parallel: one view, one sound grid, the land mask.
  const first = state.manifest.nightlights.years[String(state.year)];
  const [mask] = await Promise.all([
    loadGrid(state.manifest.landMask.file),
    loadYear(state.year),
    prefetchView(viewUrl(first)),
  ]);
  state.land = buildMask(mask.data, mask.width, mask.height);
  showFrame();
  view.setCenter(state.center);
  renderLegend();
  updateDescription();
  document.body.dataset.ready = 'true';
  announce('Ready. Press Space to play a scan, or T for a 10-second tutorial.');
  if (pendingScan) { pendingScan = false; toggleScan(); }
  prefetchRest();
}

// ---------------------------------------------------------------- actions

async function ensureSound() {
  if (engine.ready) return true;
  const ok = await engine.unlock();
  const s = $('sound-state');
  s.dataset.on = String(ok);
  s.textContent = ok ? 'Sound is on.' : 'Sound could not start in this browser.';
  return ok;
}

function setScanButton(running) {
  const b = $('btn-scan');
  b.setAttribute('aria-pressed', String(running));
  b.querySelector('.btn-label').textContent = running ? 'Stop scan' : 'Play scan';
}

function requireReadyTrack() {
  const t = TRACKS.find((x) => x.id === state.track);
  if (t.ready) return true;
  announce(`${t.title} is coming next. Switch to track 1 with Shift and 1.`);
  return false;
}

async function toggleScan() {
  if (scan.running) {
    scan.stop();
    announce('Scan stopped.');
    return;
  }
  if (!requireReadyTrack()) return;
  await ensureSound();
  if (state.explore) toggleExplore(false);
  if (document.body.dataset.ready !== 'true') {
    pendingScan = true;
    announce('Still loading. The scan starts as soon as the map is ready.', { speak: true });
    return;
  }
  if (state.track === 'lightning') { toggleLightning(); return; }
  const fields = await currentFields();
  setScanButton(true);
  const what = classTrack() ? classTrack().when : String(state.year);
  announce(`Scanning ${what} around ${centreLabel()}, ring ${state.radiusKm} kilometres.`, { speak: false });
  scan.start({
    fields,
    landField: state.land,
    center: state.center,
    radiusKm: state.radiusKm,
    durationS: state.durationS,
    fullScale: classTrack() ? classTrack().fullScale : undefined,
  });
}

async function setYear(year, { speak = true } = {}) {
  if (state.track === 'lightning') {
    // Year keys move through the video: one step is about a month.
    if (year === YEARS[0]) seekLightning(0, 0);
    else if (year === YEARS[YEARS.length - 1]) seekLightning(0, Infinity);
    else seekLightning(year > state.year ? 1 : -1);
    return;
  }
  if (state.track !== 'nightlights') {
    announce('This track is a single moment; years are on track 1.');
    return;
  }
  const y = Math.max(YEARS[0], Math.min(YEARS[YEARS.length - 1], year));
  state.year = y;
  $('year').value = String(y);
  await loadYear(y);
  showFrame();   // instant: keyboard-driven changes are never animated
  updateDescription();
  if (speak) announce(String(y));
  updateProbe();
  if (scan.running) {
    // Restart so the ring reads the new year from the outside in, keeping comparisons fair.
    scan.stop(false);
    toggleScan();
  }
}

function setCenter(center, { speak = true } = {}) {
  state.center = { lat: clampLat(center.lat), lon: normalizeLon(center.lon), name: center.name || '' };
  view.setCenter(state.center);
  view.follow(state.center.lat, state.center.lon); // a zoomed map keeps the scan centre in frame
  updateDescription();
  if (speak) announce(`Centre ${centreLabel()}.`);
  updateProbe();
}

function applyPreset(p) {
  state.radiusKm = p.radiusKm;
  $('radius').value = String(p.radiusKm);
  $('radius-out').textContent = `${p.radiusKm} km`;
  setCenter(p);
  if (scan.running) { scan.stop(false); toggleScan(); }
}

function moveCenter(dLat, dLon) {
  // Explore mode moves in finer steps; the spoken centre is skipped so the probe tone is
  // what you hear while walking (W names the place on demand).
  const k = state.explore ? 0.5 : 1;
  setCenter({ lat: state.center.lat + dLat * k, lon: state.center.lon + dLon * k }, { speak: !state.explore });
}

function setRadius(km) {
  state.radiusKm = Math.max(250, Math.min(4000, Math.round(km / 250) * 250));
  $('radius').value = String(state.radiusKm);
  $('radius-out').textContent = `${state.radiusKm} km`;
  updateDescription();
  announce(`Ring ${state.radiusKm} kilometres.`);
}

const LEGENDS = {
  nightlights: [
    [AMBER, 'Louder and brighter: more light'],
    ['#8b95a8', 'Soft hum: unlit land · silence: water'],
  ],
  change: [
    [CHANGE_COLORS.more, 'Purple, more light: high bright sparkle'],
    [CHANGE_COLORS.less, 'Orange, less light: low muffled buzz'],
    [CHANGE_COLORS.same, 'White, little change: soft quiet tone'],
  ],
  lightning: [
    ['#ffe04d', 'New flash: sharp crack in its direction'],
    ['#b7c0cf', 'Many storms: low thunder rumble'],
    ['#4a5568', 'Beyond ±52°: no data, silence'],
  ],
  aerosols: [
    [AEROSOL_COLORS.smoke, 'Smoke / black carbon: crackle'],
    [AEROSOL_COLORS.dust, 'Dust: dry rustle'],
    [AEROSOL_COLORS.salt, 'Sea salt: soft surf'],
    [AEROSOL_COLORS.sulfate, 'Sulfate: buzzing tone'],
  ],
};

function renderLegend() {
  const el = $('track-legend');
  el.textContent = '';
  for (const [color, text] of LEGENDS[state.track] || []) {
    const li = document.createElement('li');
    const sw = document.createElement('span');
    sw.className = 'swatch';
    sw.style.background = color;
    sw.setAttribute('aria-hidden', 'true');
    li.append(sw, text);
    el.appendChild(li);
  }
}

async function selectTrack(id) {
  const t = TRACKS.find((x) => x.id === id);
  if (!t) return;
  if (!t.ready) {
    announce(`${t.title} is coming next.`);
    return;
  }
  if (state.busy) return;
  if (scan.running) scan.stop(false);
  if (liveScan.running) { liveScan.stop(); $('map-video').pause(); setScanButton(false); }
  state.track = id;
  const isLt = id === 'lightning';
  engine.trim = classTrack() ? classTrack().trim : isLt ? LIGHTNING_TRIM : 1;
  engine.setLayers(currentLayers());
  renderTracks();
  renderLegend();
  $('track-title').textContent = t.title;
  document.body.dataset.track = id;
  $('map-video').hidden = !isLt;
  const yearsOnly = id === 'nightlights';
  for (const b of ['btn-prev-year', 'btn-next-year']) $(b).disabled = !(yearsOnly || isLt);
  $('year').disabled = !yearsOnly;
  $('btn-sweep').querySelector('.btn-label').textContent = yearsOnly ? 'All years' : 'Ring summary';
  await currentFields();
  showFrame();
  updateDescription();
  // Short spoken introduction: what the data is and how each state sounds.
  announce(`Track ${TRACKS.indexOf(t) + 1}. ${t.intro || `${t.title}. ${t.blurb}`} Press Space to scan.`);
  updateProbe();
}

/**
 * "Y" on class tracks (What Changed, Aerosols): how the signal inside the ring divides
 * between the classes. Each class is played on its own instrument, largest share first,
 * louder for a larger share, then the shares are read out.
 */
async function classSummary() {
  if (state.busy) return;
  await ensureSound();
  if (scan.running) scan.stop(false);
  const ct = classTrack();
  const f = await currentFields();
  const pts = diskPoints(state.center, state.radiusKm, 8, 60);
  const m = Object.fromEntries(Object.keys(f).map((k) => [k, meanOver(f[k], pts, 1)]));
  const total = Object.values(m).reduce((a, b) => a + b, 0);
  if (total < 1e-4) {
    engine.centreNote(0);
    announce(`Inside the ring around ${centreLabel()}: ${ct.describe(null)}.`);
    return;
  }
  const order = Object.keys(m).filter((k) => m[k] / total >= 0.01).sort((a, b) => m[b] - m[a]);
  state.busy = true;
  order.forEach((k, i) => {
    setTimeout(() => {
      engine.setProbe({ gains: { [k]: 0.35 + 0.65 * (m[k] / total) }, brightness: 0.6, land: 0, lat: state.center.lat });
      dial.update(new Float32Array(16).fill(m[k] / total), { n: 0, e: 0, s: 0, w: 0 }, new Array(16).fill(ct.colors[k]));
    }, i * 900);
  });
  setTimeout(() => {
    engine.silenceProbe();
    dial.clear();
    state.busy = false;
    updateProbe();
  }, order.length * 900 + 100);
  const what = state.track === 'change' ? 'of the lit area' : 'of the aerosol signal';
  const parts = order.map((k) => `${Math.round((100 * m[k]) / total)} percent ${ct.names[k]}`);
  announce(`Inside the ring around ${centreLabel()}, ${what}: ${parts.join(', ')}.`);
}

/** Pings one year chip in the visual timeline when its note sounds. */
function pingYear(year) {
  const chip = document.querySelector(`.chip[data-year="${year}"]`);
  if (!chip) return;
  chip.classList.add('ping');
  setTimeout(() => chip.classList.remove('ping'), 220);
}

/**
 * Plays one note per year: the mean rendered brightness inside the disk around the centre,
 * on a fixed logarithmic pentatonic scale shared by all regions and years.
 */
/** Track 4's "Y": where the lightning is around the centre in the current 10-day window. */
async function lightningSummary() {
  await ensureSound();
  const f = await currentFields();
  const acc = new Float32Array(16);
  const covered = new Array(16).fill(false);
  for (const k of [0.25, 0.5, 0.75, 1]) {
    readRing(f, null, state.center, state.radiusKm * k, LIGHTNING_FULL).forEach((v, i) => {
      acc[i] += v.level;
      if (v.points.some((p) => Math.abs(p.lat) <= LIGHTNING_COVERAGE_LAT)) covered[i] = true;
    });
  }
  const total = acc.reduce((a, b) => a + b, 0);
  const date = lightning.date;
  if (!covered.some(Boolean)) {
    announce(`The ring around ${centreLabel()} is outside the sensor's coverage: no data.`);
    return;
  }
  if (total < 0.002) {
    engine.centreNote(0);
    announce(`No lightning within the ring around ${centreLabel()} in the 10 days to ${date}.`);
    return;
  }
  const names = ['north', 'north-north-east', 'north-east', 'east-north-east', 'east', 'east-south-east', 'south-east', 'south-south-east',
    'south', 'south-south-west', 'south-west', 'west-south-west', 'west', 'west-north-west', 'north-west', 'north-north-west'];
  const order = [...acc.keys()].sort((a, b) => acc[b] - acc[a]);
  order.slice(0, 6).forEach((i, n) => {
    if (acc[i] <= 0) return;
    const v = engine.voices[i];
    setTimeout(() => engine.strike(v.pan.pan.value, v.base, Math.min(1, 0.3 + acc[i] / (total + 1e-9))), n * 160);
  });
  const level = total / 4 > LIGHTNING_FULL ? 'a lot of' : total / 4 > LIGHTNING_FULL / 4 ? 'some' : 'a little';
  announce(`In the 10 days to ${date}: ${level} lightning within the ring around ${centreLabel()}, most of it to the ${names[order[0]]}.`);
}

async function yearSweep() {
  if (classTrack()) { classSummary(); return; }
  if (state.track === 'lightning') { lightningSummary(); return; }
  if (state.busy || !requireReadyTrack()) return;
  await ensureSound();
  if (scan.running) scan.stop(false);
  state.busy = true;
  for (const y of YEARS) await loadYear(y);
  const pts = diskPoints(state.center, state.radiusKm, 8, 60);
  const values = YEARS.map((y) => meanOver(state.fields.get(y), pts, 1));
  announce(`All years around ${centreLabel()}, 2012 to 2023. Higher note means brighter.`, { speak: false });
  const lead = 0.8;
  const step = 0.55; // under 2 notes per second, so the visual pings stay far below 3 flashes/s
  values.forEach((v, i) => {
    engine.note(degreeToFreq(degreeForIndex(v)), { when: lead + i * step, duration: 0.5, level: 0.32, bright: Math.min(1, v / 0.02), type: 'triangle' });
    setTimeout(() => {
      // While music plays, the picture follows it with a short cross-fade.
      view.setImage(yearUrl(YEARS[i]), { fade: true });
      $('year-readout').textContent = String(YEARS[i]);
      markTimeline(YEARS[i]);
      pingYear(YEARS[i]);
    }, (lead + i * step) * 1000);
  });
  setTimeout(() => {
    showFrame({ fade: true });
    updateDescription();
    const max = Math.max(...values);
    const min = Math.min(...values);
    const first = values[0];
    const last = values[values.length - 1];
    const change = first > 0 ? Math.round(((last - first) / first) * 100) : 0;
    const dir = change >= 0 ? `up ${change}` : `down ${Math.abs(change)}`;
    announce(`Brightest year ${YEARS[values.indexOf(max)]}, dimmest ${YEARS[values.indexOf(min)]}. `
      + `Rendered brightness from 2012 to 2023: ${dir} percent.`);
    state.busy = false;
  }, (lead + YEARS.length * step + 0.3) * 1000);
}

/**
 * Short sound tutorial: each rule is said first, then heard on its own, so speech and the
 * example note never overlap. Without the voice guide the text goes to the live region and
 * the notes keep a fixed rhythm.
 */
async function tutorial() {
  if (state.busy) return;
  await ensureSound();
  if (scan.running) scan.stop(false);
  if (state.explore) toggleExplore(false);
  state.busy = true;
  const steps = [
    { text: 'Top is north: high notes.', deg: 8, pan: 0, hl: 0 },
    { text: 'Right ear is east.', deg: 4, pan: 0.9, hl: 90 },
    { text: 'Bottom is south: low notes.', deg: 0, pan: 0, hl: 180 },
    { text: 'Left ear is west.', deg: 4, pan: -0.9, hl: 270 },
    { text: 'Quiet and dull means little.', deg: 6, pan: 0, hl: null, level: 0.06, bright: 0.05 },
    { text: 'Loud and bright means a lot.', deg: 6, pan: 0, hl: null, level: 0.4, bright: 1 },
  ];
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (const s of steps) {
    if (!state.busy) break; // Escape cancels
    announce(s.text, { speak: false });
    dial.setHighlight(s.hl);
    await (voice.enabled ? voice.sayAsync(s.text) : wait(700));
    engine.note(degreeToFreq(s.deg), { when: 0.05, duration: 1.1, level: s.level ?? 0.32, pan: s.pan, bright: s.bright ?? 0.6, type: 'triangle' });
    await wait(1300);
  }
  dial.setHighlight(null);
  if (state.busy) announce('That is the whole rule. Press Space to scan, or E to explore point by point.');
  state.busy = false;
}

/** Values at the centre point for the current track: words for "where am I" and the probe. */
function pointReading(fields) {
  const c = state.center;
  if (classTrack()) {
    const levels = readPoint(fields, c.lat, c.lon);
    return { levels, words: classTrack().describe(dominant(levels)) };
  }
  if (state.track === 'lightning') {
    if (Math.abs(c.lat) > LIGHTNING_COVERAGE_LAT) return { levels: { rumble: 0 }, words: 'outside the sensor coverage, no data' };
    const level = sampleField(fields.rumble, c.lat, c.lon, 2);
    return { levels: { rumble: level }, words: level > 0.02 ? 'lightning right here' : 'no lightning at this point' };
  }
  const level = sampleField(fields, c.lat, c.lon, 1);
  return { levels: { main: level }, words: describeLevel(level) };
}

async function whereAmI() {
  if (!requireReadyTrack()) return;
  const fields = await currentFields();
  const c = state.center;
  const onLand = sampleField(state.land, c.lat, c.lon, 0) >= 0.5;
  const when = classTrack() ? classTrack().when
    : state.track === 'lightning' ? `10 days to ${lightning.date}` : String(state.year);
  const place = describePlace(c.lat, c.lon, onLand);
  announce(`${place}. ${onLand ? 'Land' : 'Water'}, ${pointReading(fields).words}. ${when}. `
    + `${formatLatLon(c.lat, c.lon)}.`);
}

// ---------------------------------------------------------------- explore mode

/** Sustained probe at the centre point; called whenever the point, year or track changes. */
async function updateProbe() {
  if (!state.explore) return;
  const fields = await currentFields();
  const c = state.center;
  const onLand = sampleField(state.land, c.lat, c.lon, 0) >= 0.5;
  if (state.probeLand !== null && state.probeLand !== onLand && scan.coastClicks) engine.click(0, engine.now, 0.18);
  state.probeLand = onLand;
  const { levels } = pointReading(fields);
  // A single point carries the full pixel level (0..1), not an arc average, so it maps to
  // loudness directly with the same curve shape.
  const gains = Object.fromEntries(Object.entries(levels).map(([k, v]) => [k, v > 0 ? v ** 0.7 : 0]));
  const peak = Math.max(...Object.values(levels));
  engine.setProbe({ gains, brightness: peak, land: onLand ? 1 : 0, lat: c.lat });
  const motor = Math.max(...Object.values(gains));
  dial.update(new Float32Array(16).fill(motor), { n: motor, e: motor, s: motor, w: motor });
}

async function toggleExplore(force) {
  const on = typeof force === 'boolean' ? force : !state.explore;
  if (on === state.explore) return;
  if (on) {
    if (!requireReadyTrack()) return;
    await ensureSound();
    if (scan.running) scan.stop(false);
    state.explore = true;
    state.probeLand = null;
    $('btn-explore').setAttribute('aria-pressed', 'true');
    announce('Explore mode. Arrow keys move the point and you hear the value under it. '
      + 'Higher pitch is further north. W names the place. E leaves explore mode.');
    updateProbe();
  } else {
    state.explore = false;
    engine.silenceProbe();
    dial.clear();
    $('btn-explore').setAttribute('aria-pressed', 'false');
    announce('Explore mode off.');
  }
}

async function saveWav() {
  if (state.busy || !requireReadyTrack()) return;
  if (state.track === 'lightning') {
    // Offline rendering needs every video frame decoded in advance; not built yet.
    announce('Saving as WAV is not available for the lightning video yet. Tracks 1 to 3 can be saved.');
    return;
  }
  state.busy = true;
  const btn = $('btn-wav');
  btn.setAttribute('aria-busy', 'true');
  announce('Rendering the scan to a WAV file…', { speak: false });
  try {
    const wav = await renderScanWav({
      fields: await currentFields(),
      layers: currentLayers(),
      landField: state.land,
      center: state.center,
      radiusKm: state.radiusKm,
      durationS: state.durationS,
      fullScale: classTrack() ? classTrack().fullScale : undefined,
      trim: engine.trim,
      coastClicks: scan.coastClicks,
      volume: engine.volume,
    });
    const place = (state.center.name || formatLatLon(state.center.lat, state.center.lon))
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const what = classTrack() ? classTrack().slug : `nightlights-${state.year}`;
    const name = `earthsonar-${what}-${place}.wav`;
    const url = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    announce(`Saved ${name}.`);
  } catch (err) {
    console.error(err);
    announce('Could not render the WAV file in this browser.');
  } finally {
    btn.removeAttribute('aria-busy');
    state.busy = false;
  }
}

function toggleVoice(force) {
  const on = typeof force === 'boolean' ? force : !voice.enabled;
  voice.setEnabled(on);
  $('voice').checked = on;
  announce(`Voice guide ${on ? 'on' : 'off'}.`, { speak: on });
}

function toggleCoast(force) {
  scan.coastClicks = typeof force === 'boolean' ? force : !scan.coastClicks;
  $('coast').checked = scan.coastClicks;
  announce(`Coastline clicks ${scan.coastClicks ? 'on' : 'off'}.`);
}

function stopAll() {
  if (scan.running) scan.stop(false);
  if (liveScan.running) { liveScan.stop(); $('map-video').pause(); }
  state.busy = false; // cancels a running tutorial
  voice.cancel();
  if (state.explore) toggleExplore(false);
  engine.stopAll();
  setScanButton(false);
  view.setRing(null);
  dial.clear();
  announce('Sound stopped.');
}

// ---------------------------------------------------------------- rendering helpers

function renderTracks() {
  const list = $('track-list');
  list.textContent = '';
  TRACKS.forEach((t, i) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'track';
    b.dataset.track = t.id;
    if (t.ready) b.setAttribute('aria-pressed', String(state.track === t.id));
    else b.setAttribute('aria-disabled', 'true');
    b.setAttribute('aria-keyshortcuts', `Shift+${i + 1}`);
    b.innerHTML = `<span class="num" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>
      <span class="meta"><span class="t-title">${t.title}</span>
      <span class="t-blurb">${t.blurb}</span>
      ${t.ready ? '' : '<span class="badge">coming next</span>'}</span>`;
    b.addEventListener('click', () => selectTrack(t.id));
    li.appendChild(b);
    list.appendChild(li);
  });
}

function renderTimeline() {
  const tl = $('timeline');
  for (const y of YEARS) {
    const c = document.createElement('button');
    c.type = 'button';
    c.tabIndex = -1; // pointer convenience; keyboard users have Page Up/Down and the year select
    c.className = 'chip';
    c.dataset.year = String(y);
    c.textContent = String(y).slice(2);
    c.addEventListener('click', () => setYear(y));
    tl.appendChild(c);
  }
}

function markTimeline(year) {
  for (const c of document.querySelectorAll('.chip')) c.classList.toggle('on', c.dataset.year === String(year));
}

// ---------------------------------------------------------------- keyboard

function isTypingTarget(el) {
  return el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA');
}

function onKey(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  // Let native controls keep their own keys; Escape always works.
  if (e.key !== 'Escape' && isTypingTarget(t)) return;
  if ((e.key === ' ' || e.key === 'Enter') && t && (t.tagName === 'BUTTON' || t.tagName === 'A' || t.tagName === 'SUMMARY')) return;

  // Shift+1..4 selects a track (by physical key, so keyboard layout does not matter).
  const digit = /^Digit([1-4])$/.exec(e.code);
  if (e.shiftKey && digit) {
    selectTrack(TRACKS[Number(digit[1]) - 1].id);
    e.preventDefault();
    return;
  }

  const step = e.shiftKey ? 5 : 1;
  const preset = PRESETS.find((p) => p.key === e.key);
  let handled = true;
  switch (e.key) {
    case ' ': case 'Enter': toggleScan(); break;
    case 'ArrowUp': moveCenter(step, 0); break;
    case 'ArrowDown': moveCenter(-step, 0); break;
    case 'ArrowLeft': moveCenter(0, -step); break;
    case 'ArrowRight': moveCenter(0, step); break;
    case 'PageUp': case ']': setYear(state.year + 1); break;
    case 'PageDown': case '[': setYear(state.year - 1); break;
    case 'Home': setYear(YEARS[0]); break;
    case 'End': setYear(YEARS[YEARS.length - 1]); break;
    case '+': case '=': view.zoomBy(1.5); break;
    case '-': case '_': view.zoomBy(1 / 1.5); break;
    case '0': view.resetCamera(); break;
    case '.': case '>': setRadius(state.radiusKm + 250); break;
    case ',': case '<': setRadius(state.radiusKm - 250); break;
    case 'y': case 'Y': yearSweep(); break;
    case 'c': case 'C': toggleCoast(); break;
    case 'v': case 'V': toggleVoice(); break;
    case 'w': case 'W': whereAmI(); break;
    case 'e': case 'E': toggleExplore(); break;
    case 's': case 'S': saveWav(); break;
    case 't': case 'T': tutorial(); break;
    case 'Escape': stopAll(); break;
    default:
      if (preset) applyPreset(preset);
      else handled = false;
  }
  if (handled) e.preventDefault();
}

// ---------------------------------------------------------------- wiring

function wire() {
  // Any first interaction unlocks audio, as browsers require.
  const unlockOnce = () => { ensureSound(); };
  window.addEventListener('keydown', unlockOnce, { once: true, capture: true });
  window.addEventListener('pointerdown', unlockOnce, { once: true, capture: true });
  window.addEventListener('keydown', onKey);

  $('btn-scan').addEventListener('click', toggleScan);
  $('btn-stop').addEventListener('click', stopAll);
  $('btn-sweep').addEventListener('click', yearSweep);
  $('btn-where').addEventListener('click', whereAmI);
  $('btn-explore').addEventListener('click', () => toggleExplore());
  $('btn-wav').addEventListener('click', saveWav);
  $('btn-tutorial').addEventListener('click', tutorial);
  $('btn-prev-year').addEventListener('click', () => setYear(state.year - 1));
  $('btn-next-year').addEventListener('click', () => setYear(state.year + 1));
  $('year').addEventListener('change', (e) => setYear(Number(e.target.value)));
  $('radius').addEventListener('input', (e) => setRadius(Number(e.target.value)));
  $('duration').addEventListener('input', (e) => {
    state.durationS = Number(e.target.value);
    $('duration-out').textContent = `${state.durationS} s`;
  });
  $('volume').addEventListener('input', (e) => {
    engine.setVolume(Number(e.target.value) / 100);
    $('volume-out').textContent = `${e.target.value}%`;
  });
  $('coast').addEventListener('change', (e) => toggleCoast(e.target.checked));
  $('voice').checked = voice.enabled;
  $('voice').disabled = !voice.supported;
  $('voice').addEventListener('change', (e) => toggleVoice(e.target.checked));

  for (const p of PRESETS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = `${p.name} <kbd>${p.key}</kbd>`;
    b.setAttribute('aria-keyshortcuts', p.key);
    b.addEventListener('click', () => applyPreset(p));
    $('presets').appendChild(b);
  }
  for (const y of YEARS) {
    const o = document.createElement('option');
    o.value = String(y);
    o.textContent = String(y);
    $('year').appendChild(o);
  }
  renderTracks();
  renderTimeline();

  document.body.dataset.motion = reducedMotion() ? 'reduced' : 'full';
}

// Exposed for manual debugging in the browser console only.
window.earthsonar = { engine, scan, state, view };

wire();
init().catch((err) => {
  console.error(err);
  announce('Could not load the map data. Please reload the page.');
});
