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
    await joinTown(page, '/?debug=1', '立體小美');

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

  test('previews the avatar in 3D on the join screen', async ({ page }, testInfo) => {
    const errors = collectErrors(page);
    await page.goto('/?view=3d', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#join-button')).toHaveText('進入小鎮', { timeout: 20_000 });

    // A fingerprint of what the preview canvas shows: how much of it is
    // covered, and roughly where.
    const fingerprint = () =>
      page.evaluate(() => {
        const canvas = document.getElementById('avatar-preview') as HTMLCanvasElement;
        const data = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data;
        if (data === undefined) return { covered: 0, weight: 0 };
        let covered = 0;
        let weight = 0;
        for (let i = 3; i < data.length; i += 4) {
          if ((data[i] as number) > 0) {
            covered += 1;
            weight += i;
          }
        }
        return { covered, weight };
      });

    await expect.poll(async () => (await fingerprint()).covered).toBeGreaterThan(500);
    const before = await fingerprint();
    // The last hat, never the one the join screen starts on: picking what is
    // already worn would redraw the same pixels and prove nothing.
    await page.locator('#pick-hat .chip').last().click();
    await expect.poll(async () => (await fingerprint()).weight).not.toBe(before.weight);
    await page.locator('#avatar-preview').screenshot({ path: testInfo.outputPath('preview.png') });
    expect(errors).toEqual([]);
  });

  test('opens in 3D by default, and remembers choosing 2D', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#join')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__town?.view())).toBe('3d');

    await page.goto('/?view=2d', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => page.evaluate(() => window.__town?.view())).toBe('2d');

    // Back to the plain address: still 2D, because that was the last choice.
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => page.evaluate(() => window.__town?.view())).toBe('2d');

    await page.goto('/?view=3d', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => page.evaluate(() => window.__town?.view())).toBe('3d');
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
      const listener = (await bot.next('playerJoined')) as { player: { id: string } };
      await expect.poll(() => stack.canHear(bot.id, listener.player.id)).toBe(true);
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

      // Thirty new avatars mean thirty geometries and a shader to compile;
      // measure once they are all actually being drawn (a body is a call).
      await expect.poll(() => drawCalls(page), { timeout: 15_000 }).toBeGreaterThanOrEqual(31);
      const calls = await drawCalls(page);
      console.log('crowd draw calls', calls, 'of', DRAW_CALL_BUDGET);
      expect(calls).toBeLessThan(DRAW_CALL_BUDGET);
      await page.screenshot({ path: testInfo.outputPath('crowd.png') });
    } finally {
      for (const bot of bots) bot.close();
    }
  });
});
