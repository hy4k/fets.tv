const { chromium } = require(process.env.PW);
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ colorScheme: 'light' });
  const html = require('fs').readFileSync(process.argv[2], 'utf8');
  await p.setContent(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">${html.split('<main>')[0]}</head><body><main>${html.split('<main>')[1]}</body></html>`, { waitUntil: 'networkidle' }).catch(e => console.error('load', e.message));
  await p.evaluate(() => document.fonts.ready);
  console.log('fonts:', await p.evaluate(() => [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family).join(',')));
  await p.pdf({ path: process.argv[3], format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' } });
  await p.setViewportSize({ width: 820, height: 1000 });
  await p.screenshot({ path: process.argv[4], fullPage: true });
  await b.close();
})();
