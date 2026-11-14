// Reads design tokens (css/tokens.css) for canvas drawing, so the map overlay and the voice
// dial use exactly the same colours, sizes and timings as the stylesheets.
// Colours in code are always token *names* ('--data-dust'); they are resolved here.

const cache = new Map();

/** Resolved value of a CSS custom property, e.g. token('--data-salt') -> the hex value set in css/tokens.css. */
export function token(name) {
  if (!cache.has(name)) {
    cache.set(name, getComputedStyle(document.documentElement).getPropertyValue(name).trim());
  }
  return cache.get(name);
}

/** Numeric token (unitless or px/ms), e.g. num('--overlay-arc-max') -> 4. */
export function num(name) {
  return parseFloat(token(name));
}

/** Duration token in milliseconds. */
export function ms(name) {
  const v = token(name);
  return v.endsWith('ms') ? parseFloat(v) : parseFloat(v) * 1000;
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

/** Linear mix of two colour tokens (both #rrggbb), t = 0..1, returned as #rrggbb. */
export function mix(fromToken, toToken, t) {
  const a = hexToRgb(token(fromToken));
  const b = hexToRgb(token(toToken));
  const k = Math.max(0, Math.min(1, t));
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * k));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
