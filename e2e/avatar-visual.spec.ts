import { expect, test } from '@playwright/test';
import { collectErrors, startStack, type Stack } from './support.js';

test.describe('avatar readability', () => {
  let stack: Stack;
  test.beforeAll(async () => { stack = await startStack(3220, 4293); });
  test.afterAll(async () => { await stack.close(); });

  test('keeps the reference outfit visible in preview and the town', async ({ page }, testInfo) => {
    const errors = collectErrors(page);
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto(stack.baseURL + '/?view=3d');
    await expect(page.locator('#join-button')).toHaveText('進入小鎮');
    await page.locator('#pick-hat .chip').nth(2).click();
    await page.locator('#pick-shirt .swatch').nth(4).click();
    await page.locator('#pick-accessory .chip').nth(1).click();
    await page.locator('#avatar-preview').screenshot({ path: testInfo.outputPath('reference-preview.png') });
    await page.locator('#nickname').fill('草帽小紫');
    await page.locator('#join-button').click();
    await page.waitForFunction(() => window.__town?.joined() === true);
    await expect.poll(() => page.evaluate(() => window.__town?.stats()?.drawCalls ?? 0)).toBeGreaterThan(0);
    // Wait for submitted geometry and face instances to reach the rendered frame.
    await page.waitForTimeout(700);
    const metrics = await page.evaluate(() => window.__town?.stats());
    expect(metrics?.drawCalls).toBeLessThan(150);
    expect(metrics?.triangles).toBeLessThan(300_000);
    console.log('visual metrics', JSON.stringify({ viewport: page.viewportSize(), drawCalls: metrics?.drawCalls, triangles: metrics?.triangles }));
    await page.screenshot({ path: testInfo.outputPath('reference-town.png') });
    const viewport = page.viewportSize()!;
    await page.screenshot({ path: testInfo.outputPath('reference-detail.png'), clip: {
      x: Math.floor(viewport.width / 2) - 70, y: Math.floor(viewport.height / 2) - 100,
      width: 140, height: 115,
    } });
    expect(await page.evaluate(() => window.__town?.view())).toBe('3d');
    // Exercise the actual joystick pointer path after capturing the stationary outfit.
    const direction = await page.evaluate(() => {
      const town = window.__town!;
      const before = town.position();
      const tx = Math.floor(before.x / 32), ty = Math.floor(before.y / 32);
      for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        if (town.walkable(tx + dx!, ty + dy!)) return { dx: dx!, dy: dy!, before };
      }
      return null;
    });
    expect(direction).not.toBeNull();
    const stick = (await page.locator('#joystick').boundingBox())!;
    const cx = stick.x + stick.width / 2, cy = stick.y + stick.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    try {
      await page.mouse.move(cx + direction!.dx * 40, cy + direction!.dy * 40);
      await expect.poll(async () => page.evaluate((before) => {
        const now = window.__town!.position();
        return Math.hypot(now.x - before.x, now.y - before.y);
      }, direction!.before)).toBeGreaterThan(5);
    } finally {
      await page.mouse.up();
    }
    await expect(page.locator('#joystick')).not.toHaveClass(/is-active/);
    await page.waitForTimeout(500);
    await page.screenshot({ path: testInfo.outputPath('reference-walked.png') });
    expect(errors).toEqual([]);
  });
});
