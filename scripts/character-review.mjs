/* global window */
import { webkit } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const output = 'docs/visual/character-fixed';
await mkdir(output, { recursive: true });
const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 1900, height: 800 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error') errors.push(message.text());
});
const results = [];
try {
  for (const sheet of ['turnaround', 'closeups', 'variants']) {
    await page.goto('http://127.0.0.1:5173/turnaround.html?sheet=' + sheet);
    await page.waitForFunction(() => window.__ready === true);
    await page.locator('#sheet').screenshot({ path: output + '/' + sheet + '.png' });
    const metrics = await page.evaluate(() => window.__review);
    if (metrics.bodyGeometries !== 1 || metrics.armGeometries !== 1
      || metrics.views !== (sheet === 'turnaround' ? 7 : 6)
      || metrics.paletteMaterials !== (sheet === 'variants' ? 6 : 1)) {
      throw new Error('Unexpected review geometry or palette counts: ' + JSON.stringify(metrics));
    }
    results.push({ sheet, ...metrics });
  }
  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(output + '/render-metrics.json', JSON.stringify(results, null, 2) + '\n');
  console.log('Character review sheets rendered without browser or shader errors.');
} finally {
  await browser.close();
}
