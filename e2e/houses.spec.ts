import { expect, test } from '@playwright/test';
import { getTownMap } from '@tland/shared';
import { collectErrors, joinTown, startStack, type Stack } from './support.js';

test.describe('named reference cottages', () => {
  let stack: Stack;
  test.beforeAll(async () => {
    // South of Wilson House, clear of its door and the modeled steps.
    const spawn = { x: 77, y: 49 };
    expect(getTownMap().isWalkable(spawn.x, spawn.y)).toBe(true);
    stack = await startStack(3260, 4299, spawn);
  });
  test.afterAll(async () => { await stack.close(); });

  for (const view of ['2d', '3d']) {
    test('renders the named cottage in ' + view + ' without errors', async ({ page }, testInfo) => {
      const errors = collectErrors(page);
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      await joinTown(page, stack.baseURL + '/?view=' + view, '房屋驗證');
      await page.waitForTimeout(800);
      expect(await page.evaluate(() => window.__town?.view())).toBe(view);
      if (view === '3d') {
        const stats = await page.evaluate(() => window.__town?.stats());
        expect(stats?.drawCalls).toBeGreaterThan(0);
        expect(stats?.drawCalls).toBeLessThan(150);
        expect(stats?.triangles).toBeLessThan(300_000);
        console.log('cottage scene', testInfo.project.name, JSON.stringify(stats));
        await testInfo.attach('cottage-metrics', { body: JSON.stringify(stats), contentType: 'application/json' });
      }
      await page.screenshot({ path: testInfo.outputPath('cottage-' + view + '.png') });
      expect(errors).toEqual([]);
    });
  }
});
