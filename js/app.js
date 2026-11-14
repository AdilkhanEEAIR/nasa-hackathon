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
  dominant,
  AEROSOL_LAYERS, AEROSOL_COLORS, AEROSOL_NAMES, aerosolFields, describeAerosol,
  LIGHTNING_LAYERS, LIGHTNING_COVERAGE_LAT, strikeRate,
  oceanFields, oceanTemp, describeTemp, oceanBandWeights, OCEAN_CALM, OCEAN_DENSE,
  TRACK_PRESETS, TRACK_SOUND,
} from './tracks.js';
import { LightningSource } from './lightning.js';
import { Controller } from './serial.js';
import { mix, resetTokens } from './theme.js';
import { prefs, setPref, mayVoiceSpeak } from './prefs.js';
import { LiveRingScan } from './scan.js';
import { fetchBlob, blobToPixels, channelField, supportsWebp, Progress } from './loader.js';
import { Voice } from './speech.js';
import { describePlace } from './places.js';

const YEARS = Array.from({ length: 12 }, (_, i) => 2012 + i);
const AMBER = '--data-lights'; // design-token name (css/tokens.css), resolved at draw time

/** Tracks whose map is split into named classes, each played by its own instrument. */
const CLASS_TRACKS = {
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
  { id: 'aerosols', title: 'Aerosols', blurb: 'Dust, smoke, sea salt and sulfate in one day of air.', ready: true,
    intro: 'Aerosols: tiny particles in the air from the GEOS model, 19 August 2025. Each type has its own sound. Smoke and black carbon crackle like fire. Dust is a dry rustle. Sea salt is soft surf. Sulfate is a buzzing tone. Louder means more. Y gives a summary of the ring.' },
  { id: 'lightning', title: 'Lightning', blurb: 'Six years of storms seen from the space station.', ready: true,
    intro: 'Lightning: flashes seen by the Lightning Imaging Sensor on the International Space Station, 2017 to 2023, shown as a 10-day window. Each new flash is a sharp crack in its direction; many storms make a low thunder rumble. The sensor only sees up to about 52 degrees north and south, so silence there means no data. Space plays and pauses; Page Up and Page Down jump a month.' },
  { id: 'ocean', title: 'Ocean Temperature', blurb: 'Surface currents coloured by temperature, 19 June 2007.', ready: true,
    intro: 'Ocean Temperature: sea surface currents from the ECCO2 ocean model, 19 June 2007, coloured by temperature from 0 to 32 degrees Celsius. Temperature has five sounds. Ice-cold water is a pure tone with a slow shimmer. Cold water is soft and hollow. Mild water is reedy. Warm water is rich and flickers faster. Hot water is bright, an octave higher, and flickers fast. Where the current lines are dense the tone slides and swirls: that is moving water. Louder means more sea on the ring; land is silent. Y tells you the temperatures around the ring.' },
];

// Each track has its own centre presets (js/tracks.js); night lights are the starting set.
export const PRESETS = TRACK_PRESETS.nightlights;
const currentPresets = () => TRACK_PRESETS[state.track] || PRESETS;

const $ = (id) => document.getElementById(id);

const state = {
  track: 'nightlights',
  year: 2012,
  center: { ...PRESETS[0] },
  radiusKm: PRESETS[0].radiusKm,
  durationS: 8,
  manifest: null,
  fields: new Map(),   // year -> value field
  land: null,
  busy: false,
  aerosols: null,      // {smoke, dust, salt, sulfate} value fields
  ocean: null,         // {cover, temp} value fields
  explore: false,     // explore mode: a sustained probe tone at the centre point
  probeLand: null,
  centreFromPreset: true, // the centre is still a preset (not moved by hand): a track switch moves it
};

const engine = new SonicEngine();
const voice = new Voice(prefs().voice);
// The scan is ducked while the guide talks, so speech never covers the data being heard.
voice.onSpeaking = (on) => engine.setDucked(on);
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
  if (state.track === 'ocean') return tempColor(v.temp);
  return AMBER;
}

// ---------------------------------------------------------------- touch: controller and phone

const controller = new Controller({
  onMessage: (msg) => onControllerMessage(msg),
  onStatus: (s) => {
    $('btn-serial').textContent = s === 'connected' ? 'Disconnect controller' : 'Connect controller';
    $('serial-status').textContent = s === 'connected' ? 'Controller connected.' : 'Controller disconnected.';
    announce(s === 'connected' ? 'Controller connected.' : 'Controller disconnected.');
  },
});
let phoneVibrate = false;
let lastBuzz = 0;

/**
 * Sends the four tactile directions to the controller motors and, as a fallback, pulses a
 * phone's vibration motor with the strongest direction (Android Chrome; iPhones have none).
 */
function haptics(levels) {
  if (controller.connected) controller.motors(levels);
  if (phoneVibrate && navigator.vibrate) {
    const max = Math.max(levels.n, levels.e, levels.s, levels.w);
    const now = performance.now();
    if (max > 0.15 && now - lastBuzz > 250) {
      lastBuzz = now;
      navigator.vibrate(Math.round(10 + 50 * max));
    }
  }
}

function hapticsOff() {
  if (controller.connected) controller.stopMotors();
  if (phoneVibrate && navigator.vibrate) navigator.vibrate(0);
}

const scan = new RingScan(engine, {
  onStep: ({ ring }) => {
    for (const v of ring) v.color = voiceColor(v);
    view.setRing(ring);
    const m = motorLevels(ring);
    dial.update(ring.map((v) => v.gain), m, ring.map((v) => v.color));
    haptics(m);
  },
  onEnd: ({ completed, centreLevel, centreKind }) => {
    setScanButton(false);
    view.setRing(null);
    dial.clear();
    hapticsOff();
    if (completed) {
      view.pulseCentre(centreLevel);
      const what = classTrack() ? classTrack().describe(centreLevel > 0.001 ? centreKind : null) : describeLevel(centreLevel);
      announce(`Scan finished. At the centre: ${what}.`, { say: 'result' });
    }
  },
});

// Lightning: arc density of dots that is heard at full rumble loudness (fixed for the video).
const LIGHTNING_FULL = 0.04;
// Measured live against the night-lights scan (analyser on the master bus): RMS 0.022 vs
// 0.073, so the lightning track is lifted to match.
const LIGHTNING_TRIM = 2.5;
let lightning = null; // LightningSource, created when the lightning track is first chosen

const liveScan = new LiveRingScan(engine, {
  onStep: ({ ring }) => {
    for (const v of ring) v.color = v.struck ? '--data-strike' : '--data-flash';
    view.setRing(ring);
    const m = motorLevels(ring);
    dial.update(ring.map((v) => v.gain), m, ring.map((v) => v.color));
    // A strike is a short, full-strength jolt on its side; the rumble is the steady level.
    for (const v of ring) {
      if (!v.struck) continue;
      const side = ['n', 'e', 's', 'w'][Math.round(v.bearing / 90) % 4];
      m[side] = 1;
    }
    haptics(m);
    if (lightning) $('year-readout').textContent = lightning.date;
  },
});

// ---------------------------------------------------------------- announcements

let announceTimer = 0;
/**
 * Polite live region (cleared first so repeating the same sentence is still read out). Every
 * message goes there for the user's own screen reader. The built-in guide speaks a message
 * only when `say` names one of its kinds ('intro', 'where', 'result'), the guide is on and
 * the Jukebox is the open tab (see mayVoiceSpeak in js/prefs.js).
 */
function announce(text, { say = null } = {}) {
  const el = $('status');
  el.textContent = '';
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => { el.textContent = text; }, 60);
  if (mayVoiceSpeak({ voiceOn: voice.enabled, tab: document.body.dataset.tab, kind: say })) voice.say(text);
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
    : state.track === 'ocean' ? 'Map of sea surface currents on 19 June 2007, coloured by temperature from blue, 0 degrees, to red, 32 degrees Celsius; land is grey.'
    : isLt ?`Lightning map${lightning && lightning.date ? ` for the 10 days to ${lightning.date}` : ''}: yellow dots are flashes seen from the space station.`
      : `Night lights map for ${state.year}.`;
  $('overlay').setAttribute('aria-label', `${map} Ring centre: ${centreLabel()}. Ring size ${state.radiusKm} kilometres.`);
  $('centre-readout').textContent = state.center.name || formatLatLon(state.center.lat, state.center.lon);
  $('year-readout').textContent = state.track === 'aerosols' ? '19 Aug 2025'
    : state.track === 'ocean' ? '19 Jun 2007'
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
  if (state.track === 'aerosols') return state.manifest.aerosols;
  if (state.track === 'ocean') return state.manifest.ocean;
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
    // decode() can stall in a hidden or background window; the picture is only for the eyes,
    // so readiness never waits on it for long.
    await Promise.race([img.decode().catch(() => {}), new Promise((r) => setTimeout(r, 1500))]);
  });
}

async function loadYear(year, progress) {
  if (state.fields.has(year)) return;
  const entry = state.manifest.nightlights.years[String(year)];
  const img = await loadGrid(entry.sound, progress && progress.part(`sound-${year}`));
  if (progress) progress.finish(`sound-${year}`);
  state.fields.set(year, channelField(img, 0));
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
  if (state.track === 'aerosols') {
    if (!state.aerosols) await withProgress('Aerosols', (p) => loadAerosols(p));
    return state.aerosols;
  }
  if (state.track === 'ocean') {
    if (!state.ocean) {
      await withProgress('Ocean Temperature', async (p) => {
        const entry = state.manifest.ocean;
        const [img] = await Promise.all([loadGrid(entry.sound, p.part('sound-ocean')), prefetchView(viewUrl(entry))]);
        p.finish('sound-ocean');
        state.ocean = oceanFields(img);
      });
    }
    return state.ocean;
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

/** How arc values become sound on the current track (see scan.js defaultVoice). */
function currentMapVoice() {
  return TRACK_SOUND[state.track] ? TRACK_SOUND[state.track].mapVoice : undefined;
}

/** Blue (cold) to red (warm) for the ocean visuals, matching the source colorbar's ends. */
function tempColor(t) {
  if (t === null || t === undefined) return '--data-nodata';
  return mix('--data-cold', '--data-warm', t / 32);
}

function currentLayers() {
  if (state.track === 'ocean') return TRACK_SOUND.ocean.layers;
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
    hapticsOff();
    announce(`Paused at ${lightning.date}.`);
    return;
  }
  await currentFields();
  setScanButton(true);
  announce(`Playing lightning from ${lightning.date}, ring around ${centreLabel()}.`);
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
  announce(`Loading ${label}…`);
  const progress = new Progress((f) => {
    const pct = Math.round(f * 100);
    bar.setAttribute('aria-valuenow', String(pct));
    fill.style.transform = `scaleX(${f})`;
    const slow = performance.now() - t0 > 1500;
    if (slow && pct - lastSpoken >= 25 && pct < 100) {
      lastSpoken = pct;
      announce(`Loading ${label}: ${pct} percent.`);
    }
  });
  try {
    await job(progress);
    announce(`${label} ready.`);
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
  await loadAerosols().catch(() => {});
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
    announce('Still loading. The scan starts as soon as the map is ready.');
    return;
  }
  if (state.track === 'lightning') { toggleLightning(); return; }
  const fields = await currentFields();
  setScanButton(true);
  const what = classTrack() ? classTrack().when : state.track === 'ocean' ? '19 June 2007' : String(state.year);
  announce(`Scanning ${what} around ${centreLabel()}, ring ${state.radiusKm} kilometres.`);
  scan.start({
    fields,
    landField: state.land,
    center: state.center,
    radiusKm: state.radiusKm,
    durationS: state.durationS,
    fullScale: classTrack() ? classTrack().fullScale : undefined,
    mapVoice: currentMapVoice(),
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
  state.centreFromPreset = false;
  updateProbe();
}

function applyPreset(p, { speak = true } = {}) {
  state.radiusKm = p.radiusKm;
  $('radius').value = String(p.radiusKm);
  $('radius-out').textContent = `${p.radiusKm} km`;
  setCenter(p, { speak });
  state.centreFromPreset = true;
  if (scan.running) { scan.stop(false); toggleScan(); }
}

/** Buttons for the current track's presets (keys 1-5). */
function renderPresets() {
  const box = $('presets');
  box.textContent = '';
  for (const p of currentPresets()) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'button';
    b.innerHTML = `${p.name} <kbd>${p.key}</kbd>`;
    b.setAttribute('aria-keyshortcuts', p.key);
    b.addEventListener('click', () => applyPreset(p));
    box.appendChild(b);
  }
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
    ['--data-land', 'Soft hum: unlit land · silence: water'],
  ],
  ocean: [
    ['--data-cold', 'Ice-cold to cold: pure or hollow tone, slow shimmer'],
    ['--data-warm', 'Warm to hot: rich, bright tone, fast flicker'],
    ['--data-land', 'Dense current lines: the tone slides and swirls'],
    ['--data-nodata', 'Land: silent'],
  ],
  lightning: [
    ['--data-flash', 'New flash: sharp crack in its direction'],
    ['--data-rumble', 'Many storms: low thunder rumble'],
    ['--data-nodata', 'Beyond ±52°: no data, silence'],
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
    sw.style.background = `var(${color})`;
    sw.setAttribute('aria-hidden', 'true');
    li.append(sw, text);
    el.appendChild(li);
  }
}

/** `fade` (pointer clicks only) cross-fades the map; keyboard track changes are instant. */
async function selectTrack(id, { fade = false } = {}) {
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
  engine.trim = isLt ? LIGHTNING_TRIM : TRACK_SOUND[id].trim;
  engine.setLayers(currentLayers());
  renderTracks();
  renderLegend();
  renderPresets();
  // A centre still sitting on a preset moves to this track's first preset, where its data has
  // contrast (an ocean ring centred on India would be half silent).
  if (state.centreFromPreset) applyPreset(currentPresets()[0], { speak: false });
  $('track-title').textContent = t.title;
  document.body.dataset.track = id;
  $('map-video').hidden = !isLt;
  const yearsOnly = id === 'nightlights';
  for (const b of ['btn-prev-year', 'btn-next-year']) $(b).disabled = !(yearsOnly || isLt);
  $('year').disabled = !yearsOnly;
  // WAV export renders offline from still frames; the lightning video has no such path.
  const wav = $('btn-wav');
  if (isLt) { wav.setAttribute('aria-disabled', 'true'); wav.setAttribute('aria-describedby', 'wav-note'); }
  else { wav.removeAttribute('aria-disabled'); wav.removeAttribute('aria-describedby'); }
  $('wav-note').hidden = !isLt;
  $('btn-sweep').querySelector('.btn-label').textContent = yearsOnly ? 'All years' : 'Ring summary';
  await currentFields();
  showFrame({ fade });
  updateDescription();
  // Short spoken introduction: what the data is and how each state sounds.
  announce(`Track ${TRACKS.indexOf(t) + 1}. ${t.intro || `${t.title}. ${t.blurb}`} Press Space to scan.`, { say: 'intro' });
  updateProbe();
}

/**
 * "Y" on class tracks (Aerosols): how the signal inside the ring divides
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
    announce(`Inside the ring around ${centreLabel()}: ${ct.describe(null)}.`, { say: 'result' });
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
  const what = 'of the aerosol signal';
  const parts = order.map((k) => `${Math.round((100 * m[k]) / total)} percent ${ct.names[k]}`);
  announce(`Inside the ring around ${centreLabel()}, ${what}: ${parts.join(', ')}.`, { say: 'result' });
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
/** Lightning "Y": where the lightning is around the centre in the current 10-day window. */
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
    announce(`The ring around ${centreLabel()} is outside the sensor's coverage: no data.`, { say: 'result' });
    return;
  }
  if (total < 0.002) {
    engine.centreNote(0);
    announce(`No lightning within the ring around ${centreLabel()} in the 10 days to ${date}.`, { say: 'result' });
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
  announce(`In the 10 days to ${date}: ${level} lightning within the ring around ${centreLabel()}, most of it to the ${names[order[0]]}.`, { say: 'result' });
}

/** Ocean "Y": coldest and warmest directions around the ring and the mean temperature,
 * heard as a sweep of the ocean tone from the coldest to the warmest side. */
async function oceanSummary() {
  await ensureSound();
  if (scan.running) scan.stop(false);
  const f = await currentFields();
  const names = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  const temps = [];
  let cs = 0;
  let ts = 0;
  for (const k of [0.33, 0.66, 1]) {
    readRing(f, null, state.center, state.radiusKm * k).forEach((v, i) => {
      cs += v.levels.cover;
      ts += v.levels.temp;
      const t = oceanTemp(v.levels.cover, v.levels.temp);
      if (t !== null) temps.push({ t, dir: names[Math.round(v.bearing / 45) % 8] });
    });
  }
  const mean = oceanTemp(cs, ts);
  if (mean === null || !temps.length) {
    engine.centreNote(0);
    announce(`No ocean within the ring around ${centreLabel()}.`, { say: 'result' });
    return;
  }
  temps.sort((a, b) => a.t - b.t);
  const lo = temps[0];
  const hi = temps[temps.length - 1];
  state.busy = true;
  const bandGains = (t) => Object.fromEntries(Object.entries(oceanBandWeights(t)).map(([k, w]) => [k, 0.8 * w]));
  [lo.t, mean, hi.t].forEach((t, i) => setTimeout(() => engine.setProbe({ gains: bandGains(t), brightness: t / 32, land: 0, lat: state.center.lat }), i * 700));
  setTimeout(() => { engine.silenceProbe(); state.busy = false; updateProbe(); }, 2200);
  announce(`Inside the ring around ${centreLabel()}: sea surface from about ${Math.round(lo.t)} degrees to the ${lo.dir} `
    + `to about ${Math.round(hi.t)} degrees to the ${hi.dir}; average about ${Math.round(mean)} degrees Celsius.`, { say: 'result' });
}

async function yearSweep() {
  if (classTrack()) { classSummary(); return; }
  if (state.track === 'ocean') { oceanSummary(); return; }
  if (state.track === 'lightning') { lightningSummary(); return; }
  if (state.busy || !requireReadyTrack()) return;
  await ensureSound();
  if (scan.running) scan.stop(false);
  state.busy = true;
  for (const y of YEARS) await loadYear(y);
  const pts = diskPoints(state.center, state.radiusKm, 8, 60);
  const values = YEARS.map((y) => meanOver(state.fields.get(y), pts, 1));
  announce(`All years around ${centreLabel()}, 2012 to 2023. Higher note means brighter.`);
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
      + `Rendered brightness from 2012 to 2023: ${dir} percent.`, { say: 'result' });
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
    announce(s.text);
    dial.setHighlight(s.hl);
    const talk = mayVoiceSpeak({ voiceOn: voice.enabled, tab: document.body.dataset.tab, kind: 'tutorial' });
    await (talk ? voice.sayAsync(s.text) : wait(700));
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
  if (state.track === 'ocean') {
    const cover = sampleField(fields.cover, c.lat, c.lon, 2);
    const t = oceanTemp(cover, sampleField(fields.temp, c.lat, c.lon, 2));
    const motion = Math.max(0, Math.min(1, (cover - OCEAN_CALM) / (OCEAN_DENSE - OCEAN_CALM)));
    return { levels: oceanBandWeights(t), words: describeTemp(t), temp: t, motion };
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
    : state.track === 'lightning' ? `10 days to ${lightning.date}`
      : state.track === 'ocean' ? '19 June 2007' : String(state.year);
  const place = describePlace(c.lat, c.lon, onLand);
  announce(`${place}. ${onLand ? 'Land' : 'Water'}, ${pointReading(fields).words}. ${when}. `
    + `${formatLatLon(c.lat, c.lon)}.`, { say: 'where' });
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
  const pr = pointReading(fields);
  const { levels } = pr;
  // A single point carries the full pixel level (0..1), not an arc average, so it maps to
  // loudness directly with the same curve shape.
  const gains = Object.fromEntries(Object.entries(levels).map(([k, v]) => [k, v > 0 ? v ** 0.7 : 0]));
  const peak = Math.max(...Object.values(levels));
  const isOcean = state.track === 'ocean';
  engine.setProbe({
    gains,
    brightness: isOcean ? (pr.temp ?? 0) / 32 : peak,
    land: onLand && !isOcean ? 1 : 0, // the ocean track keeps land silent
    lat: c.lat,
    motion: pr.motion || 0,
  });
  const motor = Math.max(...Object.values(gains));
  dial.update(new Float32Array(16).fill(motor), { n: motor, e: motor, s: motor, w: motor });
  haptics({ n: motor, e: motor, s: motor, w: motor });
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
    hapticsOff();
    $('btn-explore').setAttribute('aria-pressed', 'false');
    announce('Explore mode off.');
  }
}

// ---------------------------------------------------------------- controller input

let joy = { x: 0, y: 0 };
let joyTimer = 0;
let joyMoved = false;
let lastPotStep = null;

/**
 * Joystick: moves the centre smoothly (about 6 degrees per second at full tilt, half that in
 * explore mode); when the stick returns to rest the new place is spoken once.
 */
function joyTick() {
  if (joy.x === 0 && joy.y === 0) {
    clearInterval(joyTimer);
    joyTimer = 0;
    if (joyMoved) { joyMoved = false; announce(`Centre ${centreLabel()}.`); }
    return;
  }
  const speed = (state.explore ? 3 : 6) / 20; // degrees per tick at 20 Hz
  const c = state.center;
  const dLon = (joy.x / 100) * speed / Math.max(0.2, Math.cos((c.lat * Math.PI) / 180));
  setCenter({ lat: c.lat + (joy.y / 100) * speed, lon: c.lon + dLon }, { speak: false });
  joyMoved = true;
}

function onControllerMessage(msg) {
  if (msg.type === 'hello') {
    $('serial-status').textContent = `Controller "${msg.name}" (protocol ${msg.version}) connected.`;
  } else if (msg.type === 'joy') {
    joy = msg;
    if ((msg.x || msg.y) && !joyTimer) joyTimer = setInterval(joyTick, 50);
  } else if (msg.type === 'pot') {
    // The knob picks a step on the current track: a year, a moment in the video, or a ring size.
    if (state.track === 'nightlights') {
      const step = Math.round((msg.value / 1000) * (YEARS.length - 1));
      if (step !== lastPotStep) { lastPotStep = step; setYear(YEARS[step]); }
    } else if (state.track === 'lightning' && lightning && lightning.ready) {
      const step = Math.round((msg.value / 1000) * 100);
      if (step !== lastPotStep) { lastPotStep = step; seekLightning(0, (step / 100) * $('map-video').duration); }
    } else {
      const step = Math.round((msg.value / 1000) * 15);
      if (step !== lastPotStep) { lastPotStep = step; setRadius(250 + step * 250); }
    }
  } else if (msg.type === 'button' && msg.pressed) {
    ensureSound();
    if (msg.id === 1) toggleScan();
    else whereAmI();
  }
}

async function toggleController() {
  if (!Controller.supported) {
    announce('This browser has no Web Serial. Use Chrome or Edge on a computer; everything else works without the controller.');
    return;
  }
  if (controller.connected) {
    controller.stopMotors();
    try { await controller.port.close(); } catch { /* already closed */ }
    controller._closed();
    return;
  }
  try {
    await controller.connect();
  } catch (err) {
    announce('No controller selected.');
  }
}

async function saveWav() {
  if (state.busy || !requireReadyTrack()) return;
  if (state.track === 'lightning') {
    // Offline rendering needs every video frame decoded in advance; not built yet.
    announce($('wav-note').textContent);
    return;
  }
  state.busy = true;
  const btn = $('btn-wav');
  btn.setAttribute('aria-busy', 'true');
  announce('Rendering the scan to a WAV file…');
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
      mapVoice: currentMapVoice(),
      coastClicks: scan.coastClicks,
      volume: engine.volume,
    });
    const place = (state.center.name || formatLatLon(state.center.lat, state.center.lon))
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const what = classTrack() ? classTrack().slug : state.track === 'ocean' ? 'ocean-2007-06-19' : `nightlights-${state.year}`;
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

/** V and the Jukebox checkbox change the same shared preference as the Accessibility menu. */
function toggleVoice(force) {
  const on = typeof force === 'boolean' ? force : !voice.enabled;
  setPref('voice', on);
  announce(`Voice guide ${on ? 'on' : 'off'}.`);
}

// Preferences changed anywhere (Accessibility menu, V, the checkbox): follow them here.
window.addEventListener('earthsonar:prefs', (e) => {
  const p = e.detail;
  voice.setEnabled(p.voice);
  $('voice').checked = p.voice;
  if (p.changed === 'large') {
    // The overlay and the dial read tokens from CSS; large mode swaps those tokens.
    resetTokens();
    view.draw();
    dial.draw();
  }
});

let labelLayer = null;
/** Borders and city names (Natural Earth), drawn over the map only; they make no sound. */
async function toggleLabels(force) {
  const on = typeof force === 'boolean' ? force : !view.labels;
  if (on && !labelLayer) {
    const ne = state.manifest.naturalEarth;
    const [borders, cities] = await Promise.all([fetch(ne.borders).then((r) => r.json()), fetch(ne.cities).then((r) => r.json())]);
    labelLayer = { borders, cities };
  }
  view.setLabels(on ? labelLayer : null);
  $('labels').checked = on;
  announce(on ? 'Borders and city names shown on the map. They are visual only and make no sound.' : 'Map labels hidden.');
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
  hapticsOff();
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
    b.addEventListener('click', (e) => selectTrack(t.id, { fade: e.detail > 0 }));
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
  // Player shortcuts belong to the Jukebox tab only. Elsewhere only Escape works, and only
  // to stop sound that is actually playing (e.g. during the demo).
  if (document.body.dataset.tab !== 'jukebox') {
    const playing = scan.running || liveScan.running || state.explore || document.body.classList.contains('demo-mode');
    if (e.key === 'Escape' && playing) { stopAll(); endDemoMode(); e.preventDefault(); }
    return;
  }
  const t = e.target;
  // Let native controls keep their own keys; Escape always works.
  if (e.key !== 'Escape' && isTypingTarget(t)) return;
  if ((e.key === ' ' || e.key === 'Enter') && t && (t.tagName === 'BUTTON' || t.tagName === 'A' || t.tagName === 'SUMMARY')) return;

  // Shift+1..4 selects a track (by physical key, so keyboard layout does not matter).
  const digit = /^Digit([1-9])$/.exec(e.code);
  if (e.shiftKey && digit && TRACKS[Number(digit[1]) - 1]) {
    selectTrack(TRACKS[Number(digit[1]) - 1].id);
    e.preventDefault();
    return;
  }

  const step = e.shiftKey ? 5 : 1;
  const preset = currentPresets().find((p) => p.key === e.key);
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
    case 'l': case 'L': toggleLabels(); break;
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
  $('btn-serial').addEventListener('click', toggleController);
  if (!Controller.supported) {
    $('serial-status').textContent = 'Needs Chrome or Edge on a computer (Web Serial). Everything else works without it.';
  }
  if ('vibrate' in navigator && matchMedia('(pointer: coarse)').matches) {
    $('vibrate-row').hidden = false;
    $('vibrate').addEventListener('change', (e) => {
      phoneVibrate = e.target.checked;
      if (phoneVibrate) navigator.vibrate(40);
      announce(`Phone vibration ${phoneVibrate ? 'on' : 'off'}.`);
    });
  }
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
  $('labels').addEventListener('change', (e) => toggleLabels(e.target.checked));
  $('voice').checked = voice.enabled;
  $('voice').disabled = !voice.supported;
  $('voice').addEventListener('change', (e) => toggleVoice(e.target.checked));

  renderPresets();
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

// ---------------------------------------------------------------- demo mode (?demo)
//
// A fixed 28-second scenario for the submission video (limit: 30 s with English subtitles).
// Browsers only allow sound after a user gesture, so the page waits for one click or key,
// then everything is timed from that moment. All data is preloaded before the click.

const DEMO_LENGTH_MS = 28000;
const DEMO_LIGHTNING_AT = 41; // seconds into the video: July 2019, northern summer storms
const DEMO_CENTRES = {
  india: { ...PRESETS[0], zoom: 2.6 },
  sahara: { name: 'West Africa', lat: 14, lon: 0, radiusKm: 2500, zoom: 2 },
  storms: { name: 'Central Africa', lat: 6, lon: 20, radiusKm: 2000, zoom: 2.2 },
};

function caption(text) {
  const el = $('demo-caption');
  el.textContent = text;
  el.hidden = !text;
}

async function demoScan(durationS) {
  scan.start({
    fields: await currentFields(),
    landField: state.land,
    center: state.center,
    radiusKm: state.radiusKm,
    durationS,
    fullScale: classTrack() ? classTrack().fullScale : undefined,
    mapVoice: currentMapVoice(),
  });
}

function demoCentre(c) {
  state.radiusKm = c.radiusKm;
  setCenter(c, { speak: false });
  // Framed close enough that the ring and its voices read on a recorded video.
  view.focus(c.lat, c.lon, c.zoom);
}

let demoPrepared = null;
let demoTimers = [];

/** Leaves the full-stage demo presentation and returns to the Demo tab. */
function endDemoMode() {
  demoTimers.forEach(clearTimeout);
  demoTimers = [];
  caption('');
  document.body.classList.remove('demo-mode');
  const start = $('demo-start');
  start.textContent = 'Play the demo again';
  start.disabled = false;
}

async function prepareDemo() {
  const start = $('demo-start');
  start.disabled = true;
  start.textContent = 'Preparing the demo…';
  // Everything the scenario touches, loaded before the clock starts.
  await loadYear(2012);
  await loadYear(2023);
  const keep = state.track;
  for (const id of ['aerosols', 'lightning']) { state.track = id; await currentFields(); }
  state.track = keep;
  const vid = $('map-video');
  const seeked = new Promise((r) => {
    vid.addEventListener('seeked', r, { once: true });
    setTimeout(r, 3000); // never hang the demo on a missed event
  });
  lightning.seekTo(DEMO_LIGHTNING_AT);
  if (vid.seeking) await seeked;
  start.disabled = false;
  start.textContent = 'Start the 28-second demo';
  $('demo-status').textContent = 'Ready. Turn your sound on, then press the button.';
  // The button is the user gesture browsers require before sound; the clock starts here.
  start.addEventListener('click', async () => {
    if (document.body.classList.contains('demo-mode')) return;
    await ensureSound();
    document.body.classList.add('demo-mode');
    runDemo();
  });
}

/** Called by the site shell when the Demo tab opens: preload once, then wait for the click. */
export async function openDemo() {
  await ready;
  if (!demoPrepared) demoPrepared = prepareDemo();
  return demoPrepared;
}

async function runDemo() {
  const voiceWas = voice.enabled;
  voice.enabled = false; // subtitles carry the words; speech would fight the timing
  const t0 = performance.now();
  const at = (ms, fn) => setTimeout(fn, Math.max(0, ms - (performance.now() - t0)));
  const steps = [
    [0, async () => {
      await selectTrack('nightlights');
      demoCentre(DEMO_CENTRES.india);
      await setYear(2012, { speak: false });
      caption('EarthSonar turns NASA Earth visualizations into sound — built for blind and low-vision listeners.');
    }],
    [2200, () => {
      caption('A ring of sound closes in on a place. High notes = north. Right ear = east. Louder = brighter.');
      engine.note(degreeToFreq(8), { duration: 0.6, level: 0.3, type: 'triangle' });
      engine.note(degreeToFreq(4), { when: 0.7, duration: 0.6, level: 0.3, pan: 0.9, type: 'triangle' });
    }],
    [4300, async () => { caption('India, 2012: sparse, quiet lights.'); await demoScan(3.0); }],
    [8000, async () => {
      await setYear(2023, { speak: false });
      caption('India, 2023: louder and brighter — the lights on the map grew about 2.5 times.');
      await demoScan(3.0);
    }],
    [11800, async () => {
      await selectTrack('aerosols');
      demoCentre(DEMO_CENTRES.sahara);
      caption('Aerosols, 19 Aug 2025: dust rustles, smoke crackles, sea salt sounds like surf, sulfate buzzes.');
      await demoScan(4.6);
    }],
    [17600, async () => {
      if (scan.running) scan.stop(false);
      await selectTrack('lightning');
      demoCentre(DEMO_CENTRES.storms);
      caption('Lightning seen from the space station: every new flash cracks in its direction.');
      state.durationS = 3;
      await toggleLightning();
    }],
    [23800, () => {
      if (liveScan.running) toggleLightning();
      view.resetCamera();
      caption('earthsonar.vercel.app — keyboard-only, screen-reader friendly, open source. Data: NASA SVS.');
      engine.centreNote(0.6);
    }],
    [DEMO_LENGTH_MS, () => {
      stopAll();
      view.resetCamera();
      voice.enabled = voiceWas;
      endDemoMode();
      document.body.dataset.demoDone = 'true';
    }],
  ];
  demoTimers = steps.map(([ms, fn]) => at(ms, fn));
}

// Exposed for manual debugging in the browser console only.
window.earthsonar = { engine, scan, state, view, controller, onControllerMessage };

// The site shell (js/site.js) imports this module only when the Jukebox or Demo tab opens,
// so the landing page never downloads player code or map data.
/**
 * Called by Home's "Hear this ring": night lights 2023 around the place the Home map was
 * circling, scanned at once (the click that asked for it is the user gesture for sound).
 */
export async function playAt(place) {
  await ready;
  await ensureSound();
  if (state.track !== 'nightlights') await selectTrack('nightlights');
  await setYear(2023, { speak: false });
  applyPreset({ ...place, key: '' }, { speak: false });
  if (!scan.running) toggleScan();
}

wire();
export const ready = init().catch((err) => {
  console.error(err);
  announce('Could not load the map data. Please reload the page.');
});
