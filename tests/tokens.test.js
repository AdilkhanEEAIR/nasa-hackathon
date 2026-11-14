import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOKENS = readFileSync(join(ROOT, 'css/tokens.css'), 'utf8');

const raw = {};
for (const m of TOKENS.matchAll(/--([\w-]+):\s*([^;]+);/g)) raw[m[1]] = m[2].trim();

function resolve(name, depth = 0) {
  const v = raw[name];
  assert.ok(v !== undefined, `unknown token --${name}`);
  const ref = /^var\(--([\w-]+)\)$/.exec(v);
  return ref && depth < 10 ? resolve(ref[1], depth + 1) : v;
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  assert.ok(/^[0-9a-fA-F]{6}$/.test(h), `expected #rrggbb, got ${hex}`);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (rgb) => {
  const [r, g, b] = rgb.map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

const COLOUR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/g;

function siteFiles() {
  const files = ['index.html', 'docs/slides/slides.html'];
  for (const d of ['css', 'js']) for (const f of readdirSync(join(ROOT, d))) files.push(`${d}/${f}`);
  return files.filter((f) => f !== 'css/tokens.css' && /\.(html|css|js)$/.test(f));
}

test('no colour literals outside css/tokens.css', () => {
  const offenders = [];
  for (const f of siteFiles()) {
    const text = readFileSync(join(ROOT, f), 'utf8');
    for (const m of text.matchAll(COLOUR_LITERAL)) {
      const line = text.slice(0, m.index).split('\n').length;
      offenders.push(`${f}:${line} ${m[0]}`);
    }
  }
  assert.deepEqual(offenders, [], `colour literals found:\n${offenders.join('\n')}`);
});

test('every var(--token) used in the site exists in tokens.css', () => {
  const missing = new Set();
  for (const f of siteFiles()) {
    const text = readFileSync(join(ROOT, f), 'utf8');
    for (const m of text.matchAll(/var\(--([\w-]+)/g)) if (!(m[1] in raw)) missing.add(`${f}: --${m[1]}`);
    for (const m of text.matchAll(/token\(['"]--([\w-]+)['"]/g)) if (!(m[1] in raw)) missing.add(`${f}: --${m[1]}`);
  }
  assert.deepEqual([...missing], []);
});

test('interface text meets WCAG AA (4.5:1), large text and UI parts 3:1', () => {
  const pairs = [
    ['ui-text', 'ui-bg', 4.5], ['ui-text', 'ui-surface', 4.5], ['ui-text', 'ui-surface-2', 4.5],
    ['ui-text-muted', 'ui-bg', 4.5], ['ui-text-muted', 'ui-surface', 4.5], ['ui-text-muted', 'ui-surface-2', 4.5],
    ['ui-text-soft', 'ui-surface', 4.5],
    ['ui-on-accent', 'ui-accent', 4.5], ['ui-on-accent', 'ui-accent-hover', 4.5],
    ['ui-accent', 'ui-bg', 3], ['ui-focus', 'ui-surface', 3], ['ui-border-strong', 'ui-bg', 1.5],
  ];
  for (const [fg, bg, min] of pairs) {
    const c = contrast(hexToRgb(resolve(fg)), hexToRgb(resolve(bg)));
    assert.ok(c >= min, `--${fg} on --${bg}: ${c.toFixed(2)} < ${min}`);
  }
});

test('the background is not pure black and the text is not pure white', () => {
  assert.notEqual(resolve('ui-bg').toUpperCase(), '#000000');
  assert.notEqual(resolve('ui-text').toUpperCase(), '#FFFFFF');
});

const CVD = {
  normal: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
};

function toLab(rgb, matrix) {
  const lin = rgb.map(toLinear);
  const sim = matrix.map((row) => Math.min(1, Math.max(0, row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2])));
  const [r, g, b] = sim;
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
const deltaE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const LEGENDS = {
  aerosols: ['data-smoke', 'data-dust', 'data-salt', 'data-sulfate'],
  ocean: ['data-cold', 'data-warm'],
  lightning: ['data-flash', 'data-rumble', 'data-nodata'],
  nightlights: ['data-lights', 'data-land'],
  wind: ['data-wind-calm', 'data-wind-strong', 'data-nodata'],
  forest: ['data-forest', 'data-nodata'],
  co2: ['data-co2', 'data-nodata'],
};

test('data colours in each legend stay distinguishable with colour-vision deficiencies', () => {
  const MIN = 12;
  const report = [];
  for (const [legend, names] of Object.entries(LEGENDS)) {
    for (const [kind, m] of Object.entries(CVD)) {
      for (let i = 0; i < names.length; i++) {
        for (let j = i + 1; j < names.length; j++) {
          const d = deltaE(toLab(hexToRgb(resolve(names[i])), m), toLab(hexToRgb(resolve(names[j])), m));
          if (d < MIN) report.push(`${legend}/${kind}: --${names[i]} vs --${names[j]} ΔE ${d.toFixed(1)}`);
        }
      }
    }
  }
  assert.deepEqual(report, []);
});

test('data colours are muted: no channel-maxed neon, similar lightness across a legend', () => {
  for (const [legend, names] of Object.entries(LEGENDS)) {
    const Ls = names.filter((n) => n !== 'data-nodata').map((n) => toLab(hexToRgb(resolve(n)), CVD.normal)[0]);
    for (const n of names) {
      const rgb = hexToRgb(resolve(n)).map((c) => Math.round(c * 255));
      const sat = (Math.max(...rgb) - Math.min(...rgb)) / Math.max(1, Math.max(...rgb));
      assert.ok(sat <= 0.6, `--${n} saturation ${sat.toFixed(2)} too high`);
    }
    if (legend !== 'lightning' && legend !== 'nightlights') {
      assert.ok(Math.max(...Ls) - Math.min(...Ls) <= 25, `${legend} lightness spread ${(Math.max(...Ls) - Math.min(...Ls)).toFixed(1)}`);
    }
  }
});

test('data colours read on the blue background (3:1 for marks, legends and the dial)', () => {
  const data = Object.keys(raw).filter((k) => k.startsWith('data-') && k !== 'data-nodata');
  assert.ok(data.length >= 10);
  for (const d of data) {
    for (const bg of ['ui-bg', 'ui-bg-sunken', 'ui-surface']) {
      const c = contrast(hexToRgb(resolve(d)), hexToRgb(resolve(bg)));
      assert.ok(c >= 3, `--${d} on --${bg}: ${c.toFixed(2)}`);
    }
  }
});

test('red is rare and readable: stop and warnings meet AA on the background', () => {
  assert.ok(contrast(hexToRgb(resolve('ui-danger')), hexToRgb(resolve('ui-bg'))) >= 4.5);
  assert.ok(contrast(hexToRgb(resolve('ui-danger')), hexToRgb(resolve('ui-surface-2'))) >= 3);
  const css = readFileSync(join(ROOT, 'css/style.css'), 'utf8');
  const uses = (css.match(/var\(--ui-danger\)/g) || []).length;
  assert.ok(uses >= 1 && uses <= 6, `red used ${uses} times in style.css`);
});

test('warm and cold water never clash with the interface red, blue or yellow', () => {
  const MIN = 15;
  for (const water of ['data-warm', 'data-cold']) {
    for (const ui of ['ui-danger', 'ui-brand', 'ui-accent']) {
      for (const [kind, m] of Object.entries(CVD)) {
        const d = deltaE(toLab(hexToRgb(resolve(water)), m), toLab(hexToRgb(resolve(ui)), m));
        assert.ok(d >= MIN, `--${water} vs --${ui} (${kind}) ΔE ${d.toFixed(1)}`);
      }
    }
  }
});
