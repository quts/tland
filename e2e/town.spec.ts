import { expect, test, type Page } from '@playwright/test';

/**
 * Browser smoke test against the production build, in WebKit.
 *
 * It drives the page the way a player would — tapping, typing, pressing the
 * on-screen buttons — and reads back state through `window.__town`, the small
 * read-only bridge the client installs. Asserting on canvas pixels would be
 * both slow and flaky; asserting on the state behind them is neither.
 *
 * This covers one player on one device. What two players can see of each
 * other is covered by packages/server/test/integration.test.ts, which drives
 * two real WebSocket clients against the real server: Playwright's Linux
 * WebKit refuses to automate a second page or context, so a two-browser test
 * cannot run here, and the server relay is what that test would be asserting
 * anyway.
 */

declare global {
  interface Window {
    __town?: {
      position(): { x: number; y: number };
      zone(): string | null;
      connection(): string;
      playerCount(): number;
      others(): string[];
      bubbles(): string[];
      joined(): boolean;
    };
  }
}

/** Surface anything the page throws; a silent failure is a wasted run. */
function reportFailures(page: Page, label: string): void {
  page.on('pageerror', (error) => {
    console.log(`[${label}] page error: ${error.message}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') {
      console.log(`[${label}] console error: ${message.text()}`);
    }
  });
}

async function joinTown(page: Page, nickname: string): Promise<void> {
  // `domcontentloaded`, not `load`: the page is interactive long before the
  // two-megabyte font and the Phaser bundle have finished arriving, and
  // waiting for them makes the suite time out under device emulation.
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('#join')).toBeVisible();
  const button = page.locator('#join-button');
  // The button stays disabled until the socket is up and a name is typed.
  await expect(button).toHaveText('進入小鎮', { timeout: 20_000 });

  await page.locator('#nickname').fill(nickname);
  await page.locator('#pick-hat .chip').nth(2).click();
  await page.locator('#pick-shirt .swatch').nth(3).click();
  await button.click();

  await expect(page.locator('#join')).toBeHidden();
  await page.waitForFunction(() => window.__town?.joined() === true, null, {
    timeout: 20_000,
  });
}

test.describe('Riverside Town', () => {
  test.describe.configure({ timeout: 90_000 });

  test('a player can join, walk and be heard', async ({ page }) => {
    reportFailures(page, 'player');

    await joinTown(page, '小美');

    await expect(page.locator('#game canvas')).toBeVisible();
    await expect(page.locator('#joystick')).toBeVisible();
    await expect(page.locator('#status-text')).toHaveText('已連線');
    // Standing somewhere that belongs to a named district.
    expect(await page.evaluate(() => window.__town?.zone())).not.toBeNull();

    /* -------- walking -------- */

    const before = await page.evaluate(() => window.__town?.position());
    const box = await page.locator('#game canvas').boundingBox();
    expect(box).not.toBeNull();
    const { x, y, width, height } = box as NonNullable<typeof box>;

    // Tap well above the character to send them walking north.
    await page.touchscreen.tap(x + width * 0.5, y + height * 0.22);

    await page.waitForFunction(
      (start) => {
        const now = window.__town?.position();
        if (now === undefined || start === undefined) return false;
        return Math.hypot(now.x - start.x, now.y - start.y) > 16;
      },
      before,
      { timeout: 15_000 },
    );

    /* -------- speaking -------- */

    await page.locator('#chat-open').click();
    await page.locator('#chat-input').fill('哈囉，這裡真舒服');
    await page.locator('#chat-input').press('Enter');

    await expect
      .poll(() => page.evaluate(() => window.__town?.bubbles() ?? []), {
        timeout: 15_000,
      })
      .toContain('哈囉，這裡真舒服');

    // The field folds away again rather than covering the world.
    await expect(page.locator('#chat-open')).toBeVisible();

    /* -------- emotes and the minimap -------- */

    await page.locator('.emote-button').first().click();
    await page.locator('#minimap-toggle').click();
    await expect(page.locator('#minimap')).toBeVisible();

    // Still alive after all of that.
    expect(await page.evaluate(() => window.__town?.joined())).toBe(true);
  });

  test('the layout fits this viewport', async ({ page }) => {
    reportFailures(page, 'layout');
    await joinTown(page, '看看');

    const metrics = await page.evaluate(() => {
      const canvas = document.querySelector('#game canvas') as HTMLCanvasElement;
      const rect = canvas.getBoundingClientRect();
      const joystick = document
        .getElementById('joystick')
        ?.getBoundingClientRect();
      return {
        canvasWidth: Math.round(rect.width),
        canvasHeight: Math.round(rect.height),
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        joystickBottom: joystick ? Math.round(joystick.bottom) : 0,
        joystickLeft: joystick ? Math.round(joystick.left) : 0,
      };
    });

    // The canvas fills its parent in both dimensions.
    expect(metrics.canvasWidth).toBeGreaterThan(metrics.innerWidth * 0.9);
    expect(metrics.canvasHeight).toBeGreaterThan(metrics.innerHeight * 0.9);

    // Nothing has pushed the page into scrolling.
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);
    expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.innerHeight + 1);

    // The joystick is on screen and reachable with a left thumb.
    expect(metrics.joystickLeft).toBeGreaterThanOrEqual(0);
    expect(metrics.joystickBottom).toBeLessThanOrEqual(metrics.innerHeight);
  });

});
