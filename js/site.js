import { prefs, setPref, applyPrefs } from './prefs.js';
import { BRAND } from './brand.js';
import { haptics } from './haptics.js';

const TABS = ['home', 'jukebox', 'demo'];
const HEAVY = new Set(['jukebox', 'demo']);
const RETIRED = new Set(['how', 'data', 'hardware']);

const tabEl = (id) => document.getElementById(`tab-${id}`);
const panelEl = (id) => document.getElementById(`panel-${id}`);
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const PLAYER_MODULES = [
  'app.js', 'audio.js', 'brand.js', 'camera.js', 'demo-plan.js', 'dial.js', 'fields.js', 'geo.js', 'lightning.js', 'loader.js',
  'music.js', 'needle.js', 'places.js', 'prefs.js', 'scan.js', 'haptics.js', 'speech.js', 'theme.js', 'tracks.js', 'view.js', 'wav.js',
];

let preloaded = false;
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

let manifest = null;
const getManifest = () => (manifest = manifest || fetch('manifest.json').then((r) => r.json()));

let home = null;
function startHome() {
  const img = document.querySelector('.hero__figure img[data-src]');
  if (img) { img.src = img.dataset.src; img.removeAttribute('data-src'); }
  if (!home) {
    home = Promise.all([import('./home.js'), getManifest()]).then(([m, mf]) => m.startHomeMap({
      canvas: document.getElementById('hero-canvas'),
      placeEl: document.getElementById('hero-place'),
      manifest: mf,
    }));
  }
  home.then((h) => h.setActive(document.body.dataset.tab === 'home')).catch(() => {});
}

function wireReveal() {
  const items = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window) || reducedMotion()) {
    items.forEach((el) => el.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -10% 0px' });
  items.forEach((el) => io.observe(el));
}

function show(id, { focusTab = false, push = false, animate = false } = {}) {
  for (const t of TABS) {
    const on = t === id;
    const tab = tabEl(t);
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
    panelEl(t).hidden = !on;
  }
  const panel = panelEl(id);
  panel.classList.remove('panel-enter');
  if (animate && !reducedMotion()) {
    void panel.offsetWidth;
    panel.classList.add('panel-enter');
  }
  document.body.dataset.tab = id;
  if (push && location.hash !== `#${id}`) history.pushState(null, '', `#${id}`);
  if (focusTab) tabEl(id).focus();
  document.title = id === 'home' ? `${BRAND.name} — ${BRAND.tagline}`
    : `${tabEl(id).textContent.trim()} · ${BRAND.name}`;
  if (id === 'home') startHome();
  else if (home) home.then((h) => h.setActive(false)).catch(() => {});
  if (HEAVY.has(id)) {
    loadPlayer().then((m) => { if (id === 'demo') m.openDemo(); });
  }
}

function tabFromHash() {
  const id = location.hash.replace('#', '');
  if (TABS.includes(id)) return id;
  if (!id || RETIRED.has(id)) return 'home';
  return null;
}

function wireTabs() {
  const list = document.getElementById('tabs');
  list.addEventListener('click', (e) => {
    const tab = e.target.closest('[role="tab"]');
    if (tab) show(tab.dataset.tab, { push: true, animate: e.detail > 0 });
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
      e.stopPropagation();
      show(next, { focusTab: true, push: true });
    }
  });
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href').slice(1);
    if (!TABS.includes(id)) return;
    e.preventDefault();
    show(id, { push: true, animate: e.detail > 0 });
    panelEl(id).focus();
  });
  window.addEventListener('popstate', () => {
    if (RETIRED.has(location.hash.slice(1))) history.replaceState(null, '', `${location.pathname}#home`);
    const id = tabFromHash();
    if (id) show(id);
  });
  const wantsPlayer = (e) => {
    const el = e.target.closest && e.target.closest('[data-tab="jukebox"], [data-tab="demo"], a[href="#jukebox"], a[href="#demo"], #hero-listen');
    if (el) preloadPlayer();
  };
  document.addEventListener('pointerover', wantsPlayer);
  document.addEventListener('focusin', wantsPlayer);
  document.getElementById('hero-listen').addEventListener('click', async (e) => {
    const h = home ? await home : null;
    const place = h ? h.place : null;
    show('jukebox', { push: true, animate: e.detail > 0 });
    panelEl('jukebox').focus();
    const m = await loadPlayer();
    if (place) m.playAt(place);
  });
}

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
  wireHaptics();
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

function wireHaptics() {
  const row = document.getElementById('pref-haptics-row');
  const box = document.getElementById('pref-haptics');
  const hint = document.getElementById('pref-haptics-hint');
  const NO = hint.textContent;
  const update = () => {
    const ok = haptics.available;
    row.hidden = !ok;
    hint.textContent = !ok ? NO : haptics.phone ? 'Phone vibration follows the value under the scan.'
      : 'Controller rumble follows the value under the scan: the heavy motor carries the south (low notes), the light motor the north (high notes).';
    if (!ok && haptics.enabled) { haptics.enabled = false; box.checked = false; haptics.off(); }
    document.body.dataset.haptics = String(ok);
    window.dispatchEvent(new CustomEvent('earthsonar:haptics'));
  };
  box.addEventListener('change', () => {
    haptics.enabled = box.checked;
    if (box.checked) haptics.set({ s: 0.6, n: 0.6 }); else haptics.off();
  });
  window.addEventListener('gamepadconnected', update);
  window.addEventListener('gamepaddisconnected', update);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') haptics.off(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) haptics.off(); });
  update();
}

if (new URLSearchParams(location.search).has('demo')) history.replaceState(null, '', `${location.pathname}#demo`);
if (RETIRED.has(location.hash.slice(1))) history.replaceState(null, '', `${location.pathname}#home`);
for (const el of document.querySelectorAll('[data-brand]')) el.textContent = BRAND[el.dataset.brand];
wireAccessibility();
wireTabs();
wireReveal();
show(tabFromHash() || 'home');
document.body.dataset.shell = 'ready';
