import { writeFileSync } from 'node:fs';
import { launch, sleep } from './cdp.mjs';

function cleanMetadata(buf) {
  const text = buf.toString('latin1');
  const key = '/Creator (';
  const start = text.indexOf(key);
  if (start < 0) return buf;
  let end = start + key.length;
  for (let depth = 1; depth > 0 && end < text.length; end++) {
    const ch = text[end];
    if (ch === String.fromCharCode(92)) end++;
    else if (ch === '(') depth++;
    else if (ch === ')') depth--;
  }
  const inner = end - 1 - (start + key.length);
  const neutral = 'Sixth Sense slides'.padEnd(inner, ' ').slice(0, inner);
  return Buffer.from(text.slice(0, start + key.length) + neutral + text.slice(end - 1), 'latin1');
}

const BASE = (process.argv[2] || 'http://localhost:8766/').replace(/#.*$/, '');
const { c, close } = await launch(9336);
try {
  await c.send('Page.enable');
  await c.send('Page.navigate', { url: `${BASE}docs/slides/slides.html` });
  await c.until("document.readyState === 'complete' && [...document.images].every((i) => i.complete && i.naturalWidth > 0)", 30000);
  await sleep(300);
  const report = await c.eval(`[...document.querySelectorAll('.slide')].map((s, i) => {
    const box = s.getBoundingClientRect();
    const over = [...s.querySelectorAll('*')].filter((e) => !e.classList.contains('foot') && !e.closest('.foot'))
      .some((e) => e.getBoundingClientRect().bottom > box.bottom - 0.6 * 96);
    return { slide: i + 1, overflow: s.scrollHeight > s.clientHeight || over };
  })`);
  const bad = report.filter((r) => r.overflow);
  console.log(`${report.length} slides; ${bad.length ? `OVERFLOW on ${bad.map((r) => r.slide).join(', ')}` : 'no overflow'}`);
  const pdf = await c.send('Page.printToPDF', { preferCSSPageSize: true, printBackground: true });
  writeFileSync('docs/SixthSense-slides.pdf', cleanMetadata(Buffer.from(pdf.result.data, 'base64')));
  console.log('docs/SixthSense-slides.pdf written');
} finally {
  await close();
}
