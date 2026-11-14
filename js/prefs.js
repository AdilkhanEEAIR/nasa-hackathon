// Accessibility preferences, shared by the site shell (js/site.js) and the player (js/app.js).
// Two independent options, both off by default:
//   voice  the built-in spoken guide (most blind users already have a screen reader that reads
//          the live region, so a second voice is opt-in);
//   large  large text and high contrast: bigger type, stronger contrast, thicker ring, focus
//          ring and larger buttons (all through css/tokens.css).
// The choice is remembered in the browser; storage can be blocked, so every access is guarded.

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
  } catch { /* private mode or blocked storage: the setting lasts for this visit only */ }
}

/**
 * The spoken guide's whole remit. It talks only inside the Jukebox, and only for these kinds
 * of line: a track's introduction, the answer to "Where am I", the result of a scan or
 * summary, and the steps of the sound lesson the user asked for with T. Tab changes, loading
 * progress and status chatter are never spoken; they still go to the live region for the
 * user's own screen reader.
 */
export const SPOKEN_KINDS = Object.freeze(['intro', 'where', 'result', 'tutorial']);

export function mayVoiceSpeak({ voiceOn, tab, kind }) {
  return !!voiceOn && tab === 'jukebox' && SPOKEN_KINDS.includes(kind);
}

let current = null;

/** Current preferences (loaded once). */
export function prefs() {
  if (!current) current = loadPrefs();
  return current;
}

/** Changes one option, remembers it, applies it to the page and tells listeners. */
export function setPref(name, value) {
  current = { ...prefs(), [name]: !!value };
  savePrefs(current);
  applyPrefs();
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('earthsonar:prefs', { detail: { ...current, changed: name } }));
}

/** Large text and high contrast is a token override on the root element (css/tokens.css). */
export function applyPrefs() {
  if (typeof document === 'undefined') return;
  document.documentElement.toggleAttribute('data-large', prefs().large);
}
