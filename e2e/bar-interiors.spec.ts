import { expect, test } from '@playwright/test';
import { HOUSE_DATA } from '../packages/client/src/world/buildingLayout.js';
import { BAR_INTERIORS } from '../packages/client/src/world/barInteriors.js';
import { collectErrors, joinTown, startStack, type Stack } from './support.js';

for (const name of ['Wilson House', 'Shockley House']) test.describe('bar at ' + name, () => {
  const house = HOUSE_DATA.houses.find(h => h.name === name)!;
  let stack: Stack;
  test.beforeAll(async () => {
    stack = await startStack(3263, 4295, { x: house.x + 1, y: house.y + 4 });
  });
  test.afterAll(async () => { await stack.close(); });

  for (const view of ['2d', '3d']) test('enters, greets and exits in ' + view, async ({ page }, testInfo) => {
    const errors = collectErrors(page);
    await joinTown(page, stack.baseURL + '/?view=' + view, '酒吧訪客');
    const enter = page.locator('#house-enter');
    const read = page.locator('#house-notice-open');
    await expect(enter).toBeVisible();
    await expect(read).toBeVisible();
    expect((await enter.boundingBox())!.y).toBeGreaterThan((await read.boundingBox())!.y);
    const outside = await page.evaluate(() => window.__town!.position());
    const loaded = page.waitForResponse(r => r.url().endsWith('/images/bar-interiors-reference.jpg'));
    await enter.click();
    expect((await loaded).status()).toBe(200);
    const room = page.locator('#bar-interior');
    await expect(room).toBeVisible();
    await expect(room).toHaveAttribute('aria-label', name + ' 的酒吧');
    await expect(room).toHaveText('←');
    const full = await page.locator('#bar-scene').boundingBox();
    expect(full!.x).toBe(0);
    expect(full!.y).toBe(0);
    expect(full!.width).toBe(page.viewportSize()!.width);
    expect(full!.height).toBe(page.viewportSize()!.height);
    await expect(page.locator('#bar-picture')).toHaveAttribute('preserveAspectRatio', 'xMidYMid slice');
    await expect(page.locator('#bar-picture')).toHaveAttribute('viewBox', BAR_INTERIORS.find(b => b.house === name)!.viewBox);
    await page.keyboard.down('d');
    await page.waitForTimeout(200);
    await page.keyboard.up('d');
    expect(await page.evaluate(() => window.__town!.position())).toEqual(outside);
    await page.screenshot({ path: testInfo.outputPath('bar-' + view + '.png') });
    await page.locator('#bar-scene').click();
    const greeting = page.getByRole('dialog', { name: '你好', exact: true });
    await expect(greeting).toBeVisible();
    await expect(page.getByRole('button', { name: 'OK', exact: true })).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath('greeting-' + view + '.png') });
    await page.getByRole('button', { name: 'OK', exact: true }).click();
    await expect(greeting).not.toBeVisible();
    await expect(room).toBeVisible();
    await page.locator('#bar-scene').click();
    await page.keyboard.press('Escape');
    await expect(greeting).not.toBeVisible();
    await expect(room).toBeVisible();
    await page.getByRole('button', { name: '返回戶外' }).click();
    await expect(room).not.toBeVisible();
    await expect(enter).toBeFocused();
    expect(await page.evaluate(() => window.__town!.position())).toEqual(outside);
    // Existing notice interaction still works after leaving the interior.
    await read.click();
    await expect(page.locator('#house-notice-dialog')).toBeVisible();
    await page.getByRole('button', { name: '關閉告示牌' }).click();
    await page.keyboard.down('s');
    try { await expect(enter).toBeHidden(); } finally { await page.keyboard.up('s'); }
    await expect(read).toBeHidden();
    expect(errors).toEqual([]);
  });
});
