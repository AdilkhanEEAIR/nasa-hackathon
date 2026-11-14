// Renders docs/slides/slides.html to docs/SixthSense-slides.pdf with headless Chrome,
// after checking that no slide overflows its page.
//
//   node tools/build_slides.mjs http://localhost:8766/

import { writeFileSync } from 'node:fs';
import { launch, sleep } from './cdp.mjs';

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
  writeFileSync('docs/SixthSense-slides.pdf', Buffer.from(pdf.result.data, 'base64'));
  console.log('docs/SixthSense-slides.pdf written');
} finally {
  await close();
}
