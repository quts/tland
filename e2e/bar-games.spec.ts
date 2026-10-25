import { expect, test } from '@playwright/test';
import { HOUSE_DATA } from '../packages/client/src/world/buildingLayout.js';
import { BAR_GAMES } from '../packages/client/src/world/barGames.js';
import { collectErrors, joinTown, startStack, type Stack } from './support.js';

for (const name of ['Moore House', 'Engelbart House', 'Shockley House']) test.describe('block game at ' + name, () => {
  const house = HOUSE_DATA.houses.find(h => h.name === name)!;
  let stack: Stack;
  test.beforeAll(async () => { stack = await startStack(3264, 4293, { x: house.x + 1, y: house.y + 4 }); });
  test.afterAll(async () => { await stack.close(); });
  for (const view of ['2d', '3d']) test('plays and returns in ' + view, async ({ page }, testInfo) => {
    const errors = collectErrors(page);
    await joinTown(page, stack.baseURL + '/?view=' + view, '積木訪客');
    const outside = await page.evaluate(() => window.__town!.position());
    await page.locator('#house-enter').click();
    await page.locator('#bar-scene').click();
    await page.locator('#bar-no').click();
    await expect(page.locator('#bar-game')).not.toBeVisible();
    await page.locator('#bar-scene').click();
    await page.locator('#bar-yes').click();
    const game = page.locator('#bar-game');
    await expect(game).toBeVisible();
    const bounds = (await game.boundingBox())!;
    expect(bounds).toEqual({ x: 0, y: 0, ...page.viewportSize()! });
    expect(await game.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await expect(page.locator('#game-submit')).toBeInViewport();
    await page.locator('#game-backdrop').evaluate(async el => { await (el as HTMLImageElement).decode(); });
    await page.screenshot({ path: testInfo.outputPath('ready-' + view + '.png') });
    await page.locator('#game-submit').click();
    await expect(page.locator('#game-feedback')).toHaveText('你再試試看');
    const question = BAR_GAMES[name]!;
    if (question.kind !== 'blocks') throw new Error('Expected block game');
    if (name === 'Shockley House') {
      await expect(page.locator('#game-question')).toHaveText('給你一個數字 n，你能幫我判斷它是奇數還是偶數嗎？把積木排成正確順序吧！');
      await expect(page.locator('#game-assembly .game-block-fixed')).toHaveText(['定義函式 isEven(n)', '結束函式']);
      await expect(page.locator('#game-assembly [data-slot]')).toHaveCount(4);
      await expect(page.locator('#game-bank button')).toHaveCount(4);
      expect(await page.locator('.game-block-fixed').evaluateAll(elements => elements.every(el => !(el as HTMLElement).draggable && el.tagName !== 'BUTTON'))).toBe(true);
    }
    if (name !== 'Engelbart House') {
      // Deliberately submitting the mixed bank order must fail.
      for (const block of question.blocks) await page.locator('#game-bank [data-block-id="' + block.id + '"]').tap();
      await page.locator('#game-submit').click();
      await expect(page.locator('#game-feedback')).toHaveText('你再試試看');
      if (testInfo.project.name === 'ipad-landscape') {
        await page.locator('#game-assembly [data-block-id="' + question.blocks[0]!.id + '"]').dragTo(page.locator('[data-slot="1"]'));
        await expect(page.locator('[data-slot="0"] button')).toHaveAttribute('data-block-id', question.blocks[1]!.id);
        await expect(page.locator('[data-slot="1"] button')).toHaveAttribute('data-block-id', question.blocks[0]!.id);
      }
      await page.locator('#game-reset').click();
      await expect(page.locator('#game-bank button')).toHaveCount(question.blocks.length);
      if (question.functionFrame) await expect(page.locator('#game-assembly .game-block-fixed')).toHaveText([question.functionFrame.start, question.functionFrame.end]);
      for (const id of question.correctOrder) await page.locator('#game-bank [data-block-id="' + id + '"]').tap();
    } else {
      await expect(page.locator('#game-question')).toHaveText('1 + 1 = ?');
      await expect(page.locator('#game-bank button')).toHaveCount(1);
      await page.locator('#game-bank [data-block-id="two"]').tap();
    }
    await page.locator('#game-submit').click();
    await expect(page.locator('#game-feedback')).toHaveText('太棒了');
    await page.screenshot({ path: testInfo.outputPath('game-' + view + '.png') });
    // Taking a block back clears feedback and makes an incomplete answer retryable.
    await page.locator('#game-assembly button').first().tap();
    await expect(page.locator('#game-feedback')).toHaveText('');
    await page.locator('#game-submit').click();
    await expect(page.locator('#game-feedback')).toHaveText('你再試試看');
    await page.keyboard.down('d');
    await page.waitForTimeout(150);
    await page.keyboard.up('d');
    expect(await page.evaluate(() => window.__town!.position())).toEqual(outside);
    await page.locator('#game-exit').click();
    await expect(game).not.toBeVisible();
    await expect(page.locator('#bar-interior')).toBeVisible();
    await expect(page.locator('#bar-scene')).toBeFocused();
    await page.locator('#bar-scene').click();
    await page.locator('#bar-yes').click();
    await expect(page.locator('#game-assembly button')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(game).not.toBeVisible();
    await expect(page.locator('#bar-interior')).toBeVisible();
    await page.locator('#bar-exit').click();
    await expect(page.locator('#house-enter')).toBeFocused();
    expect(await page.evaluate(() => window.__town!.position())).toEqual(outside);
    expect(errors).toEqual([]);
  });
});
