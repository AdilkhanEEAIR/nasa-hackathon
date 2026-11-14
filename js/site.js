// Site shell: tabbed landing page. Loads nothing heavy: the player (js/app.js) and all map
// data are imported only when the Jukebox or Demo tab is opened.
//
// Tabs follow the WAI-ARIA tabs pattern: role=tablist/tab/tabpanel, roving tabindex, arrow
// keys and Home/End move between tabs, and each tab has its own address (#home, #jukebox…).

import { prefs, setPref, applyPrefs } from './prefs.js';

const TABS = ['home', 'jukebox', 'demo'];
// Any other address, including the removed #how, #data and #hardware tabs, opens Home.
const HEAVY = new Set(['jukebox', 'demo']);

const tabEl = (id) => document.getElementById(`tab-${id}`);
const panelEl = (id) => document.getElementById(`panel-${id}`);

// Every module of the player (js/app.js and what it imports). Preloading them in parallel
// avoids an import waterfall: one round trip instead of four. tests/assets.test.js keeps this
// list equal to the real import graph.
export const PLAYER_MODULES = [
  'app.js', 'audio.js', 'camera.js', 'dial.js', 'fields.js', 'geo.js', 'lightning.js', 'loader.js',
  'music.js', 'places.js', 'prefs.js', 'scan.js', 'serial.js', 'speech.js', 'theme.js', 'tracks.js', 'view.js', 'wav.js',
];

let preloaded = false;
/** Fetches the player code without running it (on first intent: hover, focus or open). */
function preloadPlayer() {
  if (preloaded) return;
  preloaded = true;
  const base = new URL('./', import.meta.url);
  for (const m of PLAYER_MODULES) {
    const l = document.createElement('link');
    l.rel = 'modulepreload';
    l.href = new URL(m, base).href;
    document.head.appendChild(l);
  }
  const l = document.createElement('link');
  l.rel = 'preload';
  l.as = 'fetch';
  l.crossOrigin = 'anonymous';
  l.href = new URL('../manifest.json', base).href;
  document.head.appendChild(l);
}

let player = null;
function loadPlayer() {
  preloadPlayer();
  if (!player) {
    document.body.dataset.player = 'loading';
    player = import('./app.js').then((m) => { document.body.dataset.player = 'ready'; return m; });
  }
  return player;
}

// Tabs removed in the November 2026 rework; old links to them land on Home.
const RETIRED = new Set(['how', 'data', 'hardware']);

/** Tab for the current address, or null for an in-page anchor such as #main (skip link). */
function tabFromHash() {
  const id = location.hash.replace('#', '');
  if (TABS.includes(id)) return id;
  if (!id || RETIRED.has(id)) return 'home';
  return null;
}

/** Shows one tab. `focusTab` moves focus to the tab button (keyboard navigation in the list). */
function show(id, { focusTab = false, push = false } = {}) {
  for (const t of TABS) {
    const on = t === id;
    const tab = tabEl(t);
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
    panelEl(t).hidden = !on;
  }
  document.body.dataset.tab = id;
  if (push && location.hash !== `#${id}`) history.pushState(null, '', `#${id}`);
  if (focusTab) tabEl(id).focus();
  document.title = id === 'home' ? 'EarthSonar — hear NASA Earth visualizations'
    : `${tabEl(id).textContent.trim()} · EarthSonar`;
  // The Home picture has no src in the HTML, so a direct link to another tab never fetches it
  // (the browser's preload scanner would, even for a hidden or lazy image).
  if (id === 'home') {
    const img = document.querySelector('.hero__figure img[data-src]');
    if (img) { img.src = img.dataset.src; img.removeAttribute('data-src'); }
  }
  if (HEAVY.has(id)) {
    loadPlayer().then((m) => { if (id === 'demo') m.openDemo(); });
  }
}

function wireTabs() {
  const list = document.getElementById('tabs');
  list.addEventListener('click', (e) => {
    const tab = e.target.closest('[role="tab"]');
    if (tab) show(tab.dataset.tab, { push: true });
  });
  list.addEventListener('keydown', (e) => {
    const i = TABS.indexOf(document.body.dataset.tab);
    let next = null;
    if (e.key === 'ArrowRight') next = TABS[(i + 1) % TABS.length];
    else if (e.key === 'ArrowLeft') next = TABS[(i - 1 + TABS.length) % TABS.length];
    else if (e.key === 'Home') next = TABS[0];
    else if (e.key === 'End') next = TABS[TABS.length - 1];
    if (next) {
      e.preventDefault();
      e.stopPropagation(); // never reaches the player's own key handling
      show(next, { focusTab: true, push: true });
    }
  });
  // In-page links such as "Open the jukebox" switch tabs and move focus into the panel.
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href').slice(1);
    if (!TABS.includes(id)) return;
    e.preventDefault();
    show(id, { push: true });
    panelEl(id).focus();
  });
  window.addEventListener('popstate', () => {
    // ---------------------------------------------------------------- accessibility menu
// The first focusable element on every page. Alt+A opens it from any tab. Changing a tab is
// never spoken: the guide's rules live in js/prefs.js and only the Jukebox uses them.
function wireAccessibility() {
  const toggle = document.getElementById('a11y-toggle');
  const panel = document.getElementById('a11y-panel');
  const boxes = { voice: document.getElementById('pref-voice'), large: document.getElementById('pref-large') };
  const sync = () => { for (const [k, el] of Object.entries(boxes)) el.checked = prefs()[k]; };
  const open = (on, { focus = false } = {}) => {
    panel.hidden = !on;
    toggle.setAttribute('aria-expanded', String(on));
    if (on && focus) boxes.voice.focus();
  };
  applyPrefs();
  sync();
  toggle.addEventListener('click', () => open(panel.hidden));
  for (const [k, el] of Object.entries(boxes)) el.addEventListener('change', () => setPref(k, el.checked));
  window.addEventListener('earthsonar:prefs', sync);
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); open(false); toggle.focus(); }
  });
  document.addEventListener('pointerdown', (e) => {
    if (!panel.hidden && !e.target.closest('#a11y')) open(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyA') {
      e.preventDefault();
      open(true, { focus: true });
    }
  });
}

wireAccessibility();
if (RETIRED.has(location.hash.slice(1))) history.replaceState(null, '', `${location.pathname}#home`);
    const id = tabFromHash();
    if (id) show(id);
  });
  // Intent to open the player (pointer over or focus on a way in) starts fetching its code.
  const wantsPlayer = (e) => {
    const el = e.target.closest && e.target.closest('[data-tab="jukebox"], [data-tab="demo"], a[href="#jukebox"], a[href="#demo"]');
    if (el) preloadPlayer();
  };
  document.addEventListener('pointerover', wantsPlayer);
  document.addEventListener('focusin', wantsPlayer);
}

// The old demo address (/?demo) opens the Demo tab.
if (new URLSearchParams(location.search).has('demo')) {
  history.replaceState(null, '', `${location.pathname}#demo`);
}
wireTabs();
// ---------------------------------------------------------------- accessibility menu
// The first focusable element on every page. Alt+A opens it from any tab. Changing a tab is
// never spoken: the guide's rules live in js/prefs.js and only the Jukebox uses them.
function wireAccessibility() {
  const toggle = document.getElementById('a11y-toggle');
  const panel = document.getElementById('a11y-panel');
  const boxes = { voice: document.getElementById('pref-voice'), large: document.getElementById('pref-large') };
  const sync = () => { for (const [k, el] of Object.entries(boxes)) el.checked = prefs()[k]; };
  const open = (on, { focus = false } = {}) => {
    panel.hidden = !on;
    toggle.setAttribute('aria-expanded', String(on));
    if (on && focus) boxes.voice.focus();
  };
  applyPrefs();
  sync();
  toggle.addEventListener('click', () => open(panel.hidden));
  for (const [k, el] of Object.entries(boxes)) el.addEventListener('change', () => setPref(k, el.checked));
  window.addEventListener('earthsonar:prefs', sync);
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); open(false); toggle.focus(); }
  });
  document.addEventListener('pointerdown', (e) => {
    if (!panel.hidden && !e.target.closest('#a11y')) open(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyA') {
      e.preventDefault();
      open(true, { focus: true });
    }
  });
}

wireAccessibility();
if (RETIRED.has(location.hash.slice(1))) history.replaceState(null, '', `${location.pathname}#home`);
show(tabFromHash() || 'home');
document.body.dataset.shell = 'ready';
