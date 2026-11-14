// Hosting (Vercel) runs on Linux, where paths are case-sensitive. Windows is not, so a
// wrong-case reference would work locally and break in production. These checks walk each
// path segment against the real directory listing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function existsExactCase(rel) {
  let dir = ROOT;
  for (const seg of rel.split('/')) {
    if (!existsSync(dir) || !readdirSync(dir).includes(seg)) return false;
    dir = join(dir, seg);
  }
  return true;
}

function manifestPaths(obj, out = []) {
  for (const v of Object.values(obj)) {
    if (typeof v === 'string' && v.startsWith('media/')) out.push(v);
    else if (v && typeof v === 'object') manifestPaths(v, out);
  }
  return out;
}

test('every media path in the manifest exists with exact case', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
  const paths = manifestPaths(manifest);
  assert.ok(paths.length >= 40);
  for (const p of paths) assert.ok(existsExactCase(p), `missing or wrong case: ${p}`);
});

test('media files are content-hashed (safe to cache as immutable)', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
  for (const p of manifestPaths(manifest)) assert.match(p, /\.[0-9a-f]{10}\.[a-z0-9]+$/, p);
});

test('every local href/src/import in the site exists with exact case and is relative', () => {
  const refs = new Set();
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  for (const m of html.matchAll(/(?:href|src)="([^"#:]+)"/g)) refs.add(m[1]);
  for (const f of readdirSync(join(ROOT, 'js'))) {
    const src = readFileSync(join(ROOT, 'js', f), 'utf8');
    for (const m of src.matchAll(/(?:from |import\()'\.\/([^']+)'/g)) refs.add(`js/${m[1]}`);
    for (const m of src.matchAll(/fetch\('([^']+)'\)/g)) refs.add(m[1]);
  }
  assert.ok(refs.size > 5);
  for (const r of refs) {
    assert.ok(!r.startsWith('/'), `absolute path breaks on sub-path hosting: ${r}`);
    assert.ok(existsExactCase(r), `missing or wrong case: ${r}`);
  }
});

test('the preload list in js/site.js matches the player import graph', () => {
  const imports = (f) => [...readFileSync(join(ROOT, 'js', f), 'utf8').matchAll(/from '\.\/([^']+)'/g)].map((m) => m[1]);
  const seen = new Set();
  const walk = (f) => { if (!seen.has(f)) { seen.add(f); imports(f).forEach(walk); } };
  walk('app.js');
  const site = readFileSync(join(ROOT, 'js', 'site.js'), 'utf8');
  const list = /PLAYER_MODULES = \[([^\]]+)\]/.exec(site)[1].match(/'[^']+'/g).map((s) => s.slice(1, -1));
  assert.deepEqual([...list].sort(), [...seen].sort());
});
