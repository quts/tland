import { expect, test, type Locator, type Page } from '@playwright/test';
import { HOUSE_DATA } from '../packages/client/src/world/buildingLayout.js';
import { BAR_INTERIORS } from '../packages/client/src/world/barInteriors.js';
import { collectErrors, joinTown, startStack, type Stack } from './support.js';

// Software-rendered WebKit can offer a 2D switch at any point in a long 3D test.
// Keep the chosen view and continue the interaction if that prompt appears.
async function clickWithSlowViewPrompt(page: Page, target: Locator): Promise<void> {
  const keep3d = page.getByRole('button', { name: '繼續用 3D' });
  for (let attempt = 0; attempt < 2; attempt++) {
    if (await keep3d.isVisible()) await keep3d.click();
    try {
      await target.click({ timeout: 5_000 });
      return;
    } catch (error) {
      if (attempt === 1 || !await keep3d.isVisible()) throw error;
    }
  }
}

for (const name of ['Wilson House', 'Shockley House']) test.describe('bar at ' + name, () => {
  const house = HOUSE_DATA.houses.find(h => h.name === name)!;
  let stack: Stack;
  test.beforeAll(async () => {
    stack = await startStack(3263, 4295, { x: house.x + 1, y: house.y + 4 });
  });
  test.afterAll(async () => { await stack.close(); });

  if (name === 'Wilson House') test('can read a notice after the 3D performance prompt', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'iphone');
    await joinTown(page, stack.baseURL + '/?view=3d', '提示訪客');
    const read = page.locator('#house-notice-open');
    await expect(read).toBeVisible();
    if (!await page.locator('.view-prompt').isVisible()) {
      // Reproduce the browser's asynchronous prompt when CI happens to render quickly.
      await page.evaluate(() => {
        const prompt = document.createElement('div');
        prompt.className = 'view-prompt';
        prompt.setAttribute('role', 'alertdialog');
        const text = document.createElement('p');
        text.className = 'view-prompt-text';
        text.textContent = '3D 畫面在這台裝置上跑得有點吃力。要改用 2D 畫面嗎？';
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = '繼續用 3D';
        button.addEventListener('click', () => prompt.remove());
        prompt.append(text, button);
        document.getElementById('app')!.append(prompt);
      });
    }
    await expect(page.locator('.view-prompt')).toBeVisible();
    await clickWithSlowViewPrompt(page, read);
    await expect(page.locator('#house-notice-dialog')).toBeVisible();
    expect(await page.evaluate(() => window.__town!.view())).toBe('3d');
    await page.getByRole('button', { name: '關閉告示牌' }).click();
  });

  for (const view of ['2d', '3d']) test('enters, greets and exits in ' + view, async ({ page }, testInfo) => {
    const errors = collectErrors(page);
    await joinTown(page, stack.baseURL + '/?view=' + view, '酒吧訪客');
    const enter = page.locator('#house-enter');
    const read = page.locator('#house-notice-open');
    await expect(enter).toBeVisible();
    await expect(read).toBeVisible();
    expect((await enter.boundingBox())!.y).toBeGreaterThan((await read.boundingBox())!.y);
    const outside = await page.evaluate(() => window.__town!.position());
    const expectedBar = BAR_INTERIORS.find(b => b.house === name)!;
    const loaded = page.waitForResponse(r => r.url().endsWith(expectedBar.image));
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
    const picture = page.locator('#bar-picture');
    await expect(picture).toHaveAttribute('src', expectedBar.image);
    await picture.evaluate(async el => { await (el as HTMLImageElement).decode(); });
    const quality = await picture.evaluate(el => {
      const image = el as HTMLImageElement;
      return { width: image.naturalWidth, height: image.naturalHeight, fit: getComputedStyle(image).objectFit };
    });
    expect(quality.width).toBeGreaterThanOrEqual(1536);
    expect(quality.height).toBeGreaterThanOrEqual(1024);
    expect(quality.fit).toBe('cover');
    await page.keyboard.down('d');
    await page.waitForTimeout(200);
    await page.keyboard.up('d');
    expect(await page.evaluate(() => window.__town!.position())).toEqual(outside);
    await page.screenshot({ path: testInfo.outputPath('bar-' + view + '.png') });
    await page.locator('#bar-scene').click();
    const greeting = page.getByRole('dialog', { name: '我想跟你玩個小遊戲', exact: true });
    await expect(greeting).toBeVisible();
    await expect(page.getByRole('button', { name: 'N，留在酒吧', exact: true })).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath('greeting-' + view + '.png') });
    await page.getByRole('button', { name: 'N，留在酒吧', exact: true }).click();
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
    if (view === '3d') await clickWithSlowViewPrompt(page, read);
    else await read.click();
    await expect(page.locator('#house-notice-dialog')).toBeVisible();
    await page.getByRole('button', { name: '關閉告示牌' }).click();
    await page.keyboard.down('s');
    try { await expect(enter).toBeHidden(); } finally { await page.keyboard.up('s'); }
    await expect(read).toBeHidden();
    expect(errors).toEqual([]);
  });
});
