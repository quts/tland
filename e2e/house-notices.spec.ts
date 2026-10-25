import { expect, test } from '@playwright/test';
import { HOUSE_DATA } from '../packages/client/src/world/buildingLayout.js';
import { HOUSE_INTRODUCTIONS } from '../packages/client/src/world/houseNotices.js';
import { collectErrors, joinTown, startStack, type Stack } from './support.js';

for (const name of ['Wilson House', 'Shockley House']) test.describe('notice at ' + name, () => {
  const house = HOUSE_DATA.houses.find(h => h.name === name)!;
  let stack: Stack;
  test.beforeAll(async () => {
    stack = await startStack(3262, 4296, { x: house.x + 1, y: house.y + 4 });
  });
  test.afterAll(async () => { await stack.close(); });

  for (const view of ['2d', '3d']) test('reads and closes the notice in ' + view, async ({ page }, testInfo) => {
    const errors = collectErrors(page);
    await joinTown(page, stack.baseURL + '/?view=' + view, '讀告示牌');
    const prompt = page.locator('#house-notice-open');
    await expect(prompt).toBeVisible();
    const promptBounds = (await prompt.boundingBox())!;
    expect(promptBounds.x).toBeLessThan(page.viewportSize()!.width / 3);
    await prompt.click();
    const dialog = page.getByRole('dialog', { name });
    await expect(dialog).toBeVisible();
    await expect(page.locator('#house-notice-content')).toHaveText(HOUSE_INTRODUCTIONS[name]!);
    await expect.poll(async () => (await dialog.boundingBox())!.height)
      .toBeLessThanOrEqual(page.viewportSize()!.height / 3 + 1);
    await page.screenshot({ path: testInfo.outputPath('notice-top-' + view + '.png') });
    const body = page.locator('#house-notice-content');
    const overflow = await body.evaluate(el => ({ height: el.clientHeight, total: el.scrollHeight }));
    expect(await body.evaluate(el => getComputedStyle(el).overflowY)).toBe('auto');
    if (testInfo.project.name.startsWith('iphone')) expect(overflow.total).toBeGreaterThan(overflow.height);
    if (overflow.total > overflow.height) {
      await body.evaluate(el => { el.scrollTop = el.scrollHeight; });
      expect(await body.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    }
    const before = await page.evaluate(() => window.__town!.position());
    await page.keyboard.down('d');
    await page.waitForTimeout(250);
    await page.keyboard.up('d');
    expect(await page.evaluate(() => window.__town!.position())).toEqual(before);
    await page.screenshot({ path: testInfo.outputPath('notice-' + view + '.png') });
    await page.getByRole('button', { name: '關閉告示牌' }).click();
    await expect(dialog).not.toBeVisible();
    await expect(prompt).toBeFocused();
    await prompt.click();
    expect(await body.evaluate(el => el.scrollTop)).toBe(0);
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    // Leaving the front row removes the prompt; moving works again after closing.
    await page.keyboard.down('s');
    try { await expect(prompt).toBeHidden(); } finally { await page.keyboard.up('s'); }
    expect(errors).toEqual([]);
  });
});
