// Site shell: tabbed landing page. Loads nothing heavy: the player (js/app.js) and all map
// data are imported only when the Jukebox or Demo tab is opened.
//
// Tabs follow the WAI-ARIA tabs pattern: role=tablist/tab/tabpanel, roving tabindex, arrow
// keys and Home/End move between tabs, and each tab has its own address (#home, #jukebox…).

const TABS = ['home', 'jukebox', 'demo', 'how', 'data', 'hardware'];
const HEAVY = new Set(['jukebox', 'demo']);

const tabEl = (id) => document.getElementById(`tab-${id}`);
const panelEl = (id) => document.getElementById(`panel-${id}`);

// Every module of the player (js/app.js and what it imports). Preloading them in parallel
// avoids an import waterfall: one round trip instead of four. tests/assets.test.js keeps this
// list equal to the real import graph.
export const PLAYER_MODULES = [
  'app.js', 'audio.js', 'camera.js', 'dial.js', 'fields.js', 'geo.js', 'lightning.js', 'loader.js',
  'music.js', 'places.js', 'scan.js', 'serial.js', 'speech.js', 'theme.js', 'tracks.js', 'view.js', 'wav.js',
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

function tabFromHash() {
  const id = location.hash.replace('#', '');
  return TABS.includes(id) ? id : 'home';
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
  document.documentElement.classList.remove('deep-link'); // the tabs own visibility from here
  if (push && location.hash !== `#${id}`) history.pushState(null, '', `#${id}`);
  if (focusTab) tabEl(id).focus();
  document.title = id === 'home' ? 'EarthSonar — hear NASA Earth visualizations'
    : `${tabEl(id).textContent.trim()} · EarthSonar`;
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
  window.addEventListener('popstate', () => show(tabFromHash()));
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
show(tabFromHash());
document.body.dataset.shell = 'ready';
