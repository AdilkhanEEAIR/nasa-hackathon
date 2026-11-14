const KEY = 'earthsonar.a11y';
export const DEFAULT_PREFS = Object.freeze({ voice: false, large: false });

export function loadPrefs(storage = globalThis.localStorage) {
  try {
    const raw = storage ? storage.getItem(KEY) : null;
    const p = raw ? JSON.parse(raw) : {};
    return { voice: p.voice === true, large: p.large === true };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(p, storage = globalThis.localStorage) {
  try {
    if (storage) storage.setItem(KEY, JSON.stringify({ voice: !!p.voice, large: !!p.large }));
  } catch { }
}

export const SPOKEN_KINDS = Object.freeze(['intro', 'where', 'result', 'tutorial']);

export function mayVoiceSpeak({ voiceOn, tab, kind }) {
  return !!voiceOn && tab === 'jukebox' && SPOKEN_KINDS.includes(kind);
}

let current = null;

export function prefs() {
  if (!current) current = loadPrefs();
  return current;
}

export function setPref(name, value) {
  current = { ...prefs(), [name]: !!value };
  savePrefs(current);
  applyPrefs();
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('earthsonar:prefs', { detail: { ...current, changed: name } }));
}

export function applyPrefs() {
  if (typeof document === 'undefined') return;
  document.documentElement.toggleAttribute('data-large', prefs().large);
}
