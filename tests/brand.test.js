import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRAND } from '../js/brand.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

test('one name and tagline', () => {
  assert.equal(BRAND.name, 'Sixth Sense');
  assert.equal(BRAND.tagline, 'Hear and feel Earth data');
  assert.equal(BRAND.url, 'earthsonar.vercel.app');
});

test('the old name only survives inside the web address or as "formerly"', () => {
  for (const f of ['index.html', 'docs/SUBMISSION.md', 'docs/slides/slides.html', 'README.md']) {
    const text = read(f).replace(/earthsonar\.vercel\.app/gi, '').replace(/Formerly EarthSonar/g, '');
    assert.doesNotMatch(text, /EarthSonar/, f);
  }
});
