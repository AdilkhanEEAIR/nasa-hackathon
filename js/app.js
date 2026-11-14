// EarthSonar application: tracks, state, keyboard control, announcements.
// Everything is reachable from the keyboard; every button shows its shortcut.

import { SonicEngine, DEFAULT_LAYERS } from './audio.js';
import { RingScan, motorLevels, renderScanWav, readPoint } from './scan.js';
import { MapView, reducedMotion } from './view.js';
import { VoiceDial } from './dial.js';
import { buildField, buildMask, lightLevel, meanOver, sampleField } from './fields.js';
import { clampLat, normalizeLon, formatLatLon, diskPoints } from './geo.js';
import { degreeToFreq, degreeForIndex } from './music.js';
import { changeClass, CHANGE_LAYERS, CHANGE_COLORS, dominant, describeChange } from './tracks.js';

const YEARS = Array.from({ length: 12 }, (_, i) => 2012 + i);
const AMBER = '#ffd56a';

export const TRACKS = [
  { id: 'nightlights', title: 'Night Lights 2012–2023', blurb: 'A decade of cities at night, one year at a time.', ready: true },
  { id: 'change', title: 'What Changed', blurb: 'More light, less light, no change: 2012 → 2023.', ready: true },
  { id: 'aerosols', title: 'Aerosols', blurb: 'Dust, smoke, sea salt and sulfate in one day of air.', ready: false },
  { id: 'lightning', title: 'Lightning', blurb: 'Six years of storms seen from the space station.', ready: false },
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
};

const engine = new SonicEngine();
const view = new MapView({ imgA: $('map-a'), imgB: $('map-b'), overlay: $('overlay') });
const dial = new VoiceDial($('dial'));

/** Colour of a voice in the visuals: the instrument that is loudest on its arc. */
function voiceColor(v) {
  if (state.track === 'change') return CHANGE_COLORS[dominant(v.gains)] || AMBER;
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
      const what = state.track === 'change' ? describeChange(centreLevel > 0.001 ? centreKind : null) : describeLevel(centreLevel);
      announce(`Scan finished. At the centre: ${what}.`);
    }
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
  const c = state.center;
  return c.name ? `${c.name} (${formatLatLon(c.lat, c.lon)})` : formatLatLon(c.lat, c.lon);
}

function updateDescription() {
  const map = state.track === 'change'
    ? 'Map of change in night lights between 2012 and 2023: purple more light, orange less light, white little change.'
    : `Night lights map for ${state.year}.`;
  $('overlay').setAttribute('aria-label', `${map} Ring centre: ${centreLabel()}. Ring size ${state.radiusKm} kilometres.`);
  $('centre-readout').textContent = state.center.name || formatLatLon(state.center.lat, state.center.lon);
  $('year-readout').textContent = state.track === 'change' ? '2012 → 2023' : String(state.year);
  $('radius-readout').textContent = `${state.radiusKm} km`;
  markTimeline(state.track === 'change' ? null : state.year);
}

// ---------------------------------------------------------------- data loading

function yearUrl(year) {
  return state.manifest.nightlights.years[String(year)].file;
}

function trackImageUrl() {
  return state.track === 'change' ? state.manifest.nightlights.change.file : yearUrl(state.year);
}

async function loadChange() {
  if (state.change) return;
  const data = await loadImagePixels(state.manifest.nightlights.change.file);
  const { width, height } = data;
  const px = data.data;
  // One pass over the pixels, three fields out.
  const f = { more: new Uint8Array(width * height), less: new Uint8Array(width * height), same: new Uint8Array(width * height) };
  for (let i = 0, p = 0; i < width * height; i++, p += 4) {
    const c = changeClass(px[p], px[p + 1], px[p + 2]);
    f.more[i] = Math.round(255 * c.more);
    f.less[i] = Math.round(255 * c.less);
    f.same[i] = Math.round(255 * c.same);
  }
  const wrap = (values) => ({ width, height, lon0: -180, values });
  state.change = { more: wrap(f.more), less: wrap(f.less), same: wrap(f.same) };
}

/** Value fields for the current track (and year). */
async function currentFields() {
  if (state.track === 'change') {
    await loadChange();
    return state.change;
  }
  await loadYear(state.year);
  return state.fields.get(state.year);
}

function currentLayers() {
  return state.track === 'change' ? CHANGE_LAYERS : DEFAULT_LAYERS;
}

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
  return ctx.getImageData(0, 0, c.width, c.height);
}

async function loadYear(year) {
  if (state.fields.has(year)) return;
  const data = await loadImagePixels(yearUrl(year));
  state.fields.set(year, buildField(data.data, data.width, data.height, lightLevel));
}

async function init() {
  announce('Loading night-lights maps…');
  state.manifest = await (await fetch('media/manifest.json')).json();
  const mask = await loadImagePixels(state.manifest.landMask.file);
  state.land = buildMask(mask.data, mask.width, mask.height);
  await loadYear(state.year);
  view.setImage(trackImageUrl());
  view.setCenter(state.center);
  renderLegend();
  updateDescription();
  document.body.dataset.ready = 'true';
  announce('Ready. Press Space to play a scan, or T for a 10-second tutorial.');
  // Remaining years load in the background so year changes are instant.
  for (const y of YEARS) await loadYear(y);
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
  const fields = await currentFields();
  setScanButton(true);
  const what = state.track === 'change' ? 'changes 2012 to 2023' : String(state.year);
  announce(`Scanning ${what} around ${centreLabel()}, ring ${state.radiusKm} kilometres.`);
  scan.start({
    fields,
    landField: state.land,
    center: state.center,
    radiusKm: state.radiusKm,
    durationS: state.durationS,
  });
}

async function setYear(year, { speak = true } = {}) {
  if (state.track !== 'nightlights') {
    announce('This track compares 2012 with 2023; years are on track 1.');
    return;
  }
  const y = Math.max(YEARS[0], Math.min(YEARS[YEARS.length - 1], year));
  state.year = y;
  $('year').value = String(y);
  await loadYear(y);
  view.setImage(yearUrl(y));   // instant: keyboard-driven changes are never animated
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
  setCenter({ lat: state.center.lat + dLat, lon: state.center.lon + dLon });
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
  state.track = id;
  engine.setLayers(currentLayers());
  renderTracks();
  renderLegend();
  $('track-title').textContent = t.title;
  document.body.dataset.track = id;
  const yearsOnly = id === 'nightlights';
  for (const b of ['btn-prev-year', 'btn-next-year', 'year']) $(b).disabled = !yearsOnly;
  $('btn-sweep').querySelector('.btn-label').textContent = yearsOnly ? 'All years' : 'Ring summary';
  await currentFields();
  view.setImage(trackImageUrl());
  updateDescription();
  announce(`Track ${TRACKS.indexOf(t) + 1}: ${t.title}. ${t.blurb} Press Space to scan.`);
}

/**
 * Track 2's "Y": how the lit area inside the ring divides between more light, less light and
 * little change, as three notes (one per instrument, loudness = share) and a sentence.
 */
async function changeSummary() {
  if (state.busy) return;
  await ensureSound();
  if (scan.running) scan.stop(false);
  const f = await currentFields();
  const pts = diskPoints(state.center, state.radiusKm, 8, 60);
  const m = { more: meanOver(f.more, pts, 1), less: meanOver(f.less, pts, 1), same: meanOver(f.same, pts, 1) };
  const total = m.more + m.less + m.same;
  if (total < 1e-4) {
    engine.centreNote(0);
    announce(`Inside the ring around ${centreLabel()}: no lights on the map.`);
    return;
  }
  const pct = (x) => Math.round((100 * x) / total);
  const notes = [['more', 10, 'triangle', 1], ['less', 2, 'sawtooth', 0.15], ['same', 6, 'sine', 0.5]];
  notes.forEach(([k, deg, type, bright], i) => {
    const share = m[k] / total;
    if (share > 0.01) engine.note(degreeToFreq(deg), { when: 0.2 + i * 0.6, duration: 0.55, level: 0.08 + 0.4 * share, type, bright });
  });
  announce(`Inside the ring around ${centreLabel()}, of the lit area: ${pct(m.more)} percent more light, `
    + `${pct(m.less)} percent less light, ${pct(m.same)} percent little change.`);
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
async function yearSweep() {
  if (state.track === 'change') { changeSummary(); return; }
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
    view.setImage(yearUrl(state.year), { fade: true });
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

/** Ten-second sound tutorial: the compass, then what "brighter" sounds like. */
async function tutorial() {
  if (state.busy) return;
  await ensureSound();
  if (scan.running) scan.stop(false);
  state.busy = true;
  const steps = [
    { at: 0.3, text: 'Top is north: high notes.', deg: 8, pan: 0, hl: 0 },
    { at: 1.9, text: 'Right ear is east.', deg: 4, pan: 0.9, hl: 90 },
    { at: 3.5, text: 'Bottom is south: low notes.', deg: 0, pan: 0, hl: 180 },
    { at: 5.1, text: 'Left ear is west.', deg: 4, pan: -0.9, hl: 270 },
    { at: 6.9, text: 'Dim and quiet means little light…', deg: 6, pan: 0, hl: null, level: 0.06, bright: 0.05 },
    { at: 8.3, text: '…loud and bright means a lot of light.', deg: 6, pan: 0, hl: null, level: 0.4, bright: 1 },
  ];
  for (const s of steps) {
    engine.note(degreeToFreq(s.deg), { when: s.at, duration: 1.2, level: s.level ?? 0.32, pan: s.pan, bright: s.bright ?? 0.6, type: 'triangle' });
    setTimeout(() => { announce(s.text); dial.setHighlight(s.hl); }, s.at * 1000);
  }
  setTimeout(() => {
    dial.setHighlight(null);
    announce('That is all. Press Space to scan.');
    state.busy = false;
  }, 10000);
}

async function whereAmI() {
  if (!requireReadyTrack()) return;
  const fields = await currentFields();
  const onLand = sampleField(state.land, state.center.lat, state.center.lon, 0) >= 0.5;
  const c = state.center;
  let what;
  let when;
  if (state.track === 'change') {
    what = describeChange(dominant(readPoint(fields, c.lat, c.lon)));
    when = 'Changes 2012 to 2023';
  } else {
    what = describeLevel(sampleField(fields, c.lat, c.lon, 1));
    when = String(state.year);
  }
  announce(`${when}. Centre ${centreLabel()}, ${onLand ? 'land' : 'water'}, ${what}. Ring ${state.radiusKm} kilometres.`);
}

async function saveWav() {
  if (state.busy || !requireReadyTrack()) return;
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
      coastClicks: scan.coastClicks,
      volume: engine.volume,
    });
    const place = (state.center.name || formatLatLon(state.center.lat, state.center.lon))
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const what = state.track === 'change' ? 'change-2012-2023' : `nightlights-${state.year}`;
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
    case '+': case '=': setRadius(state.radiusKm + 250); break;
    case '-': case '_': setRadius(state.radiusKm - 250); break;
    case 'y': case 'Y': yearSweep(); break;
    case 'c': case 'C': toggleCoast(); break;
    case 'w': case 'W': whereAmI(); break;
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

  $('overlay').addEventListener('click', (ev) => setCenter(view.eventToLatLon(ev)));
  document.body.dataset.motion = reducedMotion() ? 'reduced' : 'full';
}

// Exposed for manual debugging in the browser console only.
window.earthsonar = { engine, scan, state };

wire();
init().catch((err) => {
  console.error(err);
  announce('Could not load the map data. Please reload the page.');
});
