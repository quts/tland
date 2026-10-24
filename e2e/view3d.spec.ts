import { expect, test, type Page } from '@playwright/test';
import { Bot, TILE, collectErrors, joinTown, startStack, type Stack } from './support.js';

/**
 * The 3D view, end to end, in WebKit.
 *
 * WebGL here may be software-rendered, so these assert behaviour and budgets
 * that do not depend on the GPU — draw calls, where the player ends up, what
 * text is on screen — and never frame rate. Frame rate is measured by hand on
 * a phone; see TESTING.md.
 */

const DRAW_CALL_BUDGET = 150;

async function drawCalls(page: Page): Promise<number> {
  // Counters describe the last frame; give a few frames to settle first.
  await page.waitForTimeout(400);
  return page.evaluate(() => window.__town?.stats()?.drawCalls ?? 0);
}

test.describe('3D view', () => {
  test.describe.configure({ timeout: 90_000 });

  test('joins, stays within budget, and walks to a tapped tile', async ({ page }, testInfo) => {
    const errors = collectErrors(page);
    await joinTown(page, '/?view=3d&debug=1', '立體小美');

    expect(await page.evaluate(() => window.__town?.view())).toBe('3d');
    await expect(page.locator('#game canvas')).toBeVisible();
    await expect(page.locator('.name-tag', { hasText: '立體小美' })).toBeVisible();
    await expect(page.locator('.debug-hud-text')).toContainText('calls');
    expect(await page.evaluate(() => window.__town?.zone())).not.toBeNull();

    const calls = await drawCalls(page);
    expect(calls).toBeGreaterThan(0);
    expect(calls).toBeLessThan(DRAW_CALL_BUDGET);
    await page.screenshot({ path: testInfo.outputPath('joined.png') });

    // A walkable tile a few steps away, on screen and clear of the joystick.
    const target = await page.evaluate((tile) => {
      const town = window.__town;
      if (town === undefined) return null;
      const here = town.position();
      const sx = Math.floor(here.x / tile);
      const sy = Math.floor(here.y / tile);
      const stick = document.getElementById('joystick')?.getBoundingClientRect();
      const offsets = [
        [0, -3], [3, 0], [-3, 0], [0, 3], [2, -2], [-2, -2], [2, 2], [-2, 2],
        [0, -4], [4, 0], [-4, 0], [0, 4], [3, -3], [-3, -3], [3, 3], [-3, 3],
      ];
      for (const [dx, dy] of offsets) {
        const x = sx + (dx as number);
        const y = sy + (dy as number);
        if (!town.walkable(x, y)) continue;
        const screen = town.tileToScreen(x, y);
        if (screen === null) continue;
        const underStick =
          stick !== undefined && stick.width > 0 &&
          screen.x > stick.left - 20 && screen.x < stick.right + 20 &&
          screen.y > stick.top - 20 && screen.y < stick.bottom + 20;
        if (!underStick) return { x, y, screen };
      }
      return null;
    }, TILE);
    expect(target, 'there should be somewhere nearby to walk to').not.toBeNull();
    const { x, y, screen } = target as NonNullable<typeof target>;

    const box = await page.locator('#game canvas').boundingBox();
    await page.touchscreen.tap((box?.x ?? 0) + screen.x, (box?.y ?? 0) + screen.y);
    await page.waitForFunction(
      ([tx, ty, tile]) => {
        const p = window.__town?.position();
        return p !== undefined && Math.floor(p.x / tile) === tx && Math.floor(p.y / tile) === ty;
      },
      [x, y, TILE] as const,
      { timeout: 15_000 },
    );

    await page.screenshot({ path: testInfo.outputPath('walked.png') });
    expect(errors).toEqual([]);
  });

  test('without the flag, the page is the 2D game', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#join')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__town?.view())).toBe('2d');
  });
});

test.describe('3D view with other players', () => {
  test.describe.configure({ timeout: 120_000 });

  // A private server that puts every arrival near the same tile.
  let stack: Stack;
  test.beforeAll(async () => {
    stack = await startStack(3210, 4283);
  });
  test.afterAll(async () => {
    await stack.close();
  });

  test('shows a nearby player, their bubble and their emote', async ({ page }, testInfo) => {
    const errors = collectErrors(page);
    const bot = await Bot.join(stack.wsURL, '路過的貓', 3);
    try {
      await joinTown(page, `${stack.baseURL}/?view=3d`, '立體聽眾');
      await expect.poll(() => page.evaluate(() => window.__town?.others().length ?? 0)).toBe(1);
      await expect(page.locator('.name-tag', { hasText: '路過的貓' })).toBeVisible();

      bot.say('你好，聽得到嗎');
      await expect
        .poll(() => page.evaluate(() => window.__town?.bubbles() ?? []), { timeout: 10_000 })
        .toContain('你好，聽得到嗎');
      await expect(page.locator('.bubble3d', { hasText: '你好，聽得到嗎' })).toBeVisible();

      bot.emote('heart');
      await expect(page.locator('.emote3d canvas')).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('bubble.png') });
    } finally {
      bot.close();
    }
    expect(errors).toEqual([]);
  });

  test('thirty avatars nearby stay within the draw-call budget', async ({ page }, testInfo) => {
    const bots: Bot[] = [];
    try {
      for (let i = 0; i < 30; i += 1) bots.push(await Bot.join(stack.wsURL, `居民${i + 1}`, i));
      await joinTown(page, `${stack.baseURL}/?view=3d&debug=1`, '人群中');
      await expect
        .poll(() => page.evaluate(() => window.__town?.others().length ?? 0), { timeout: 15_000 })
        .toBe(30);

      const calls = await drawCalls(page);
      expect(calls).toBeLessThan(DRAW_CALL_BUDGET);
      await page.screenshot({ path: testInfo.outputPath('crowd.png') });
    } finally {
      for (const bot of bots) bot.close();
    }
  });
});
