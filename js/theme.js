const cache = new Map();

export function token(name) {
  if (!cache.has(name)) {
    cache.set(name, getComputedStyle(document.documentElement).getPropertyValue(name).trim());
  }
  return cache.get(name);
}

export function resetTokens() {
  cache.clear();
}

export function num(name) {
  return parseFloat(token(name));
}

export function ms(name) {
  const v = token(name);
  return v.endsWith('ms') ? parseFloat(v) : parseFloat(v) * 1000;
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

export function mix(fromToken, toToken, t) {
  const a = hexToRgb(token(fromToken));
  const b = hexToRgb(token(toToken));
  const k = Math.max(0, Math.min(1, t));
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * k));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
