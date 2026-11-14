// EarthSonar application: state, keyboard control, announcements.
// Everything is reachable from the keyboard; every button has the same shortcut listed in
// the help section.

import { SonicEngine } from './audio.js';
import { RingScan } from './scan.js';
import { MapView } from './view.js';
import { buildField, buildMask, lightLevel, meanOver, sampleField } from './fields.js';
import { clampLat, normalizeLon, formatLatLon, diskPoints } from './geo.js';
import { degreeToFreq, degreeForIndex } from './music.js';

const YEARS = Array.from({ length: 12 }, (_, i) => 2012 + i);

export const PRESETS = [
  { key: '1', name: 'India', lat: 22.5, lon: 79.0, radiusKm: 1500 },
  { key: '2', name: 'China', lat: 32.0, lon: 110.0, radiusKm: 2000 },
  { key: '3', name: 'Bishkek', lat: 42.87, lon: 74.59, radiusKm: 1500 },
  { key: '4', name: 'Europe', lat: 48.5, lon: 9.0, radiusKm: 1500 },
];

const $ = (id) => document.getElementById(id);

const state = {
  year: 2012,
  center: { ...PRESETS[0] },
  radiusKm: PRESETS[0].radiusKm,
  durationS: 8,
  manifest: null,
  images: new Map(),   // year -> HTMLImageElement
  fields: new Map(),   // year -> value field
  land: null,
  busy: false,
};

const engine = new SonicEngine();
const view = new MapView($('map'));
const scan = new RingScan(engine, {
  onStep: ({ ring }) => view.setRing(ring),
  onEnd: ({ completed, centreLevel }) => {
    setScanButton(false);
    view.setRing(null);
    if (completed) announce(`Scan finished. At the centre: ${describeLevel(centreLevel)}.`);
  },
});

// ---------------------------------------------------------------- announcements

let announceTimer = 0;
/** Polite live region; cleared first so repeating the same sentence is still read out. */
function announce(text) {
  const el = $('status');
  el.textContent = '';
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => { el.textContent = text; }, 60);
}

function describeLevel(level) {
  if (level < 0.01) return 'dark, no lights';
  if (level < 0.15) return 'faint lights';
  if (level < 0.45) return 'moderate lights';
  return 'bright lights';
}

function centreLabel() {
  return state.center.name ? `${state.center.name} (${formatLatLon(state.center.lat, state.center.lon)})`
    : formatLatLon(state.center.lat, state.center.lon);
}

function updateDescription() {
  const txt = `Night lights map for ${state.year}. Ring centre: ${centreLabel()}. Radius ${state.radiusKm} kilometres.`;
  $('map').setAttribute('aria-label', txt);
  $('centre-readout').textContent = centreLabel();
  $('year-readout').textContent = String(state.year);
}

// ---------------------------------------------------------------- data loading

async function loadImagePixels(url) {
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  return { img, data: ctx.getImageData(0, 0, c.width, c.height) };
}

async function loadYear(year) {
  if (state.fields.has(year)) return;
  const meta = state.manifest.nightlights.years[String(year)];
  const { img, data } = await loadImagePixels(meta.file);
  state.images.set(year, img);
  state.fields.set(year, buildField(data.data, data.width, data.height, lightLevel));
}

async function init() {
  announce('Loading night-lights maps…');
  state.manifest = await (await fetch('media/manifest.json')).json();
  const mask = await loadImagePixels(state.manifest.landMask.file);
  state.land = buildMask(mask.data.data, mask.data.width, mask.data.height);
  await loadYear(state.year);
  view.setImage(state.images.get(state.year));
  view.setCenter(state.center);
  updateDescription();
  $('app').dataset.ready = 'true';
  announce('Ready. Press any key or the Start button to turn sound on, then Space to scan.');
  // Remaining years load in the background so year changes are instant.
  for (const y of YEARS) await loadYear(y);
}

// ---------------------------------------------------------------- actions

async function ensureSound() {
  if (engine.ready) return true;
  const ok = await engine.unlock();
  $('sound-banner').hidden = ok;
  return ok;
}

function setScanButton(running) {
  const b = $('btn-scan');
  b.setAttribute('aria-pressed', String(running));
  b.textContent = running ? 'Stop scan' : 'Start scan';
}

async function toggleScan() {
  if (scan.running) {
    scan.stop();
    announce('Scan stopped.');
    return;
  }
  await ensureSound();
  await loadYear(state.year);
  setScanButton(true);
  announce(`Scanning ${state.year} around ${centreLabel()}, radius ${state.radiusKm} kilometres.`);
  scan.start({
    field: state.fields.get(state.year),
    landField: state.land,
    center: state.center,
    radiusKm: state.radiusKm,
    durationS: state.durationS,
  });
}

async function setYear(year, { speak = true } = {}) {
  const y = Math.max(YEARS[0], Math.min(YEARS[YEARS.length - 1], year));
  state.year = y;
  $('year').value = String(y);
  await loadYear(y);
  view.setImage(state.images.get(y));
  updateDescription();
  if (speak) announce(String(y));
  if (scan.running) {
    // Restart so the ring reads the new year from the outside in, keeping comparisons fair.
    scan.stop(false);
    toggleScan();
  }
}

function setCenter(center, { speak = true } = {}) {
  state.center = { lat: clampLat(center.lat), lon: normalizeLon(center.lon), name: center.name || '' };
  view.setCenter(state.center);
  updateDescription();
  if (speak) announce(`Centre ${centreLabel()}.`);
}

function applyPreset(p) {
  state.radiusKm = p.radiusKm;
  $('radius').value = String(p.radiusKm);
  $('radius-out').textContent = `${p.radiusKm} km`;
  setCenter(p);
  if (scan.running) { scan.stop(false); toggleScan(); }
}

function moveCenter(dLat, dLon) {
  setCenter({ lat: state.center.lat + dLat, lon: state.center.lon + dLon }, { speak: true });
}

function setRadius(km) {
  state.radiusKm = Math.max(250, Math.min(4000, Math.round(km / 250) * 250));
  $('radius').value = String(state.radiusKm);
  $('radius-out').textContent = `${state.radiusKm} km`;
  updateDescription();
  announce(`Radius ${state.radiusKm} kilometres.`);
}

/**
 * Plays one note per year: the mean rendered brightness inside the disk around the centre,
 * on a fixed logarithmic pentatonic scale shared by all regions and years.
 */
async function yearSweep() {
  if (state.busy) return;
  await ensureSound();
  if (scan.running) scan.stop(false);
  state.busy = true;
  for (const y of YEARS) await loadYear(y);
  const pts = diskPoints(state.center, state.radiusKm, 8, 60);
  const values = YEARS.map((y) => meanOver(state.fields.get(y), pts, 1));
  announce(`Year sweep around ${centreLabel()}, 2012 to 2023. Higher note means brighter.`);
  const step = 0.55;
  values.forEach((v, i) => {
    engine.note(degreeToFreq(degreeForIndex(v)), { when: 0.8 + i * step, duration: 0.5, level: 0.32, bright: Math.min(1, v / 0.02), type: 'triangle' });
  });
  for (let i = 0; i < YEARS.length; i++) {
    setTimeout(() => {
      view.setImage(state.images.get(YEARS[i]));
      $('year-readout').textContent = String(YEARS[i]);
    }, (0.8 + i * step) * 1000);
  }
  setTimeout(() => {
    view.setImage(state.images.get(state.year));
    $('year-readout').textContent = String(state.year);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const first = values[0];
    const last = values[values.length - 1];
    const change = first > 0 ? Math.round(((last - first) / first) * 100) : 0;
    const dir = change >= 0 ? `up ${change}` : `down ${Math.abs(change)}`;
    announce(`Brightest year ${YEARS[values.indexOf(max)]}, dimmest ${YEARS[values.indexOf(min)]}. `
      + `Rendered brightness from 2012 to 2023: ${dir} percent.`);
    state.busy = false;
  }, (0.8 + YEARS.length * step + 0.3) * 1000);
}

function whereAmI() {
  const v = sampleField(state.fields.get(state.year), state.center.lat, state.center.lon, 1);
  const onLand = sampleField(state.land, state.center.lat, state.center.lon, 0) >= 0.5;
  announce(`${state.year}. Centre ${centreLabel()}, ${onLand ? 'land' : 'water'}, ${describeLevel(v)}. Radius ${state.radiusKm} kilometres.`);
}

function toggleCoast(force) {
  scan.coastClicks = typeof force === 'boolean' ? force : !scan.coastClicks;
  $('coast').checked = scan.coastClicks;
  announce(`Coastline clicks ${scan.coastClicks ? 'on' : 'off'}.`);
}

function stopAll() {
  if (scan.running) scan.stop(false);
  engine.stopAll();
  setScanButton(false);
  view.setRing(null);
  announce('Sound stopped.');
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
    case '+': case '=': setRadius(state.radiusKm + 250); break;
    case '-': case '_': setRadius(state.radiusKm - 250); break;
    case 'y': case 'Y': yearSweep(); break;
    case 'c': case 'C': toggleCoast(); break;
    case 'w': case 'W': whereAmI(); break;
    case 'Escape': stopAll(); break;
    case '?': case 'h': case 'H': $('help').open = true; $('help-summary').focus(); break;
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

  $('btn-sound').addEventListener('click', async () => {
    const ok = await ensureSound();
    announce(ok ? 'Sound is on.' : 'Sound could not start in this browser.');
  });
  $('btn-scan').addEventListener('click', toggleScan);
  $('btn-stop').addEventListener('click', stopAll);
  $('btn-sweep').addEventListener('click', yearSweep);
  $('btn-where').addEventListener('click', whereAmI);
  $('btn-prev-year').addEventListener('click', () => setYear(state.year - 1));
  $('btn-next-year').addEventListener('click', () => setYear(state.year + 1));
  $('year').addEventListener('change', (e) => setYear(Number(e.target.value)));
  $('radius').addEventListener('input', (e) => setRadius(Number(e.target.value)));
  $('duration').addEventListener('input', (e) => {
    state.durationS = Number(e.target.value);
    $('duration-out').textContent = `${state.durationS} s`;
  });
  $('volume').addEventListener('input', (e) => {
    const v = Number(e.target.value) / 100;
    engine.setVolume(v);
    $('volume-out').textContent = `${e.target.value}%`;
  });
  $('coast').addEventListener('change', (e) => toggleCoast(e.target.checked));

  const presetBox = $('presets');
  for (const p of PRESETS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = `${p.name}`;
    b.setAttribute('aria-keyshortcuts', p.key);
    b.title = `Centre on ${p.name} (key ${p.key})`;
    b.addEventListener('click', () => applyPreset(p));
    presetBox.appendChild(b);
  }

  const yearSel = $('year');
  for (const y of YEARS) {
    const o = document.createElement('option');
    o.value = String(y);
    o.textContent = String(y);
    yearSel.appendChild(o);
  }

  $('map').addEventListener('click', (ev) => setCenter(view.eventToLatLon(ev)));
}

// Exposed for manual debugging in the browser console only.
window.earthsonar = { engine, scan, state };

wire();
init().catch((err) => {
  console.error(err);
  announce('Could not load the map data. Please reload the page.');
});
