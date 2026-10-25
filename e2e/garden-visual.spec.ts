import { expect, test } from '@playwright/test';
import { getTownMap } from '@tland/shared';
import { collectErrors, startStack, type Stack } from './support.js';

for (const theme of ['garden', 'woodland'] as const) test.describe('sunlit ' + theme, () => {
  let stack: Stack;
  test.beforeAll(async () => {
    const map = getTownMap();
    // Pick the same planted street in every build, including the baseline.
    let best = map.spawn, bestScore = -1;
    for (const spot of map.spawnPoints) {
      if (!map.isWalkable(spot.x, spot.y)) continue;
      let score = 0;
      for (let z = -7; z <= 3; z += 1) for (let x = -5; x <= 5; x += 1) {
        const prop = map.propAt(spot.x + x, spot.y + z);
        const terrain = map.terrainAt(spot.x + x, spot.y + z);
        if (prop === 'tree') score += theme === 'woodland' ? 20 : 3;
        if (prop === 'flower') score += theme === 'garden' ? 2 : 0.2;
        if (terrain === 'hill' && theme === 'woodland') score += 2;
        if (terrain === 'building') score += 0.2;
      }
      if (score > bestScore) { best = spot; bestScore = score; }
    }
    stack = await startStack(3230, 4294, best);
  });
  test.afterAll(async () => { await stack.close(); });

  test('renders a planted street without shader errors or excessive draw calls', async ({ page }, testInfo) => {
    const errors = collectErrors(page);
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(stack.baseURL + '/?view=3d');
    await expect(page.locator('#join-button')).toHaveText('進入小鎮');
    await page.locator('#pick-shirt .swatch').nth(4).click();
    await page.locator('#nickname').fill(theme === 'garden' ? '花園驗證' : '樹林驗證');
    await page.locator('#join-button').click();
    await page.waitForFunction(() => window.__town?.joined() === true);
    await page.waitForTimeout(900);
    expect(await page.evaluate(() => window.__town?.view())).toBe('3d');
    const stats = await page.evaluate(() => window.__town?.stats());
    expect(stats?.drawCalls).toBeGreaterThan(0);
    expect(stats?.drawCalls).toBeLessThan(150);
    expect(stats?.triangles).toBeLessThan(300_000);
    console.log(theme + ' metrics', JSON.stringify({ viewport: page.viewportSize(), drawCalls: stats?.drawCalls, triangles: stats?.triangles }));
    await page.screenshot({ path: testInfo.outputPath(theme + '-town.png') });
    expect(errors).toEqual([]);
  });
});
