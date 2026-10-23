import { expect, test, type Page } from '@playwright/test';

/**
 * End-to-end smoke test against the production build in WebKit.
 *
 * It drives the page the way a player would — tapping, typing, pressing the
 * on-screen buttons — and reads back state through `window.__town`, the small
 * read-only bridge the client installs. Asserting on canvas pixels would be
 * both slow and flaky; asserting on the state behind them is neither.
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

/**
 * A second player, as another tab rather than another browser context.
 *
 * Playwright's Linux WebKit cannot drive a second context — it logs
 * "automation is not allowed in the context" and the new page never
 * responds. The app keeps nothing in cookies or storage, so sharing a
 * context changes nothing about what is being tested.
 */
async function openSecondPlayer(page: Page): Promise<Page> {
  const second = await page.context().newPage();
  reportFailures(second, 'second');
  return second;
}

test.describe('Riverside Town', () => {
  test.describe.configure({ timeout: 90_000 });

  test('a player can join, walk, and be heard nearby', async ({ page }) => {
    reportFailures(page, 'first');

    await joinTown(page, '小美');

    await expect(page.locator('#game canvas')).toBeVisible();
    await expect(page.locator('#joystick')).toBeVisible();
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

    /* -------- a second player -------- */

    const second = await openSecondPlayer(page);
    try {
      await joinTown(second, '阿寬');

      await page.waitForFunction(
        () => (window.__town?.others().length ?? 0) >= 1,
        null,
        { timeout: 20_000 },
      );
      await second.waitForFunction(
        () => (window.__town?.others().length ?? 0) >= 1,
        null,
        { timeout: 20_000 },
      );

      await expect(page.locator('#count-text')).toHaveText('2');

      /* -------- proximity chat -------- */

      // The second player spawns beside the first, inside the three-tile
      // earshot, so the line should reach both of them.
      await second.locator('#chat-open').click();
      await second.locator('#chat-input').fill('有人在嗎');
      await second.locator('#chat-input').press('Enter');

      await expect
        .poll(() => second.evaluate(() => window.__town?.bubbles() ?? []), {
          timeout: 15_000,
        })
        .toContain('有人在嗎');

      await expect
        .poll(() => page.evaluate(() => window.__town?.bubbles() ?? []), {
          timeout: 15_000,
        })
        .toContain('有人在嗎');

      /* -------- emotes -------- */

      // Nothing to assert in the DOM; this is a crash check on the emote path.
      await second.locator('.emote-button').first().click();
      await page.waitForTimeout(500);
      expect(await page.evaluate(() => window.__town?.joined())).toBe(true);
    } finally {
      await second.close();
    }
  });

  test('the layout survives a rotation', async ({ page }) => {
    reportFailures(page, 'rotate');
    await joinTown(page, '轉轉');

    const portrait = page.viewportSize();
    expect(portrait).not.toBeNull();
    const { width, height } = portrait as NonNullable<typeof portrait>;

    await page.setViewportSize({ width: height, height: width });
    await page.waitForTimeout(500);

    const metrics = await page.evaluate(() => {
      const canvas = document.querySelector('#game canvas') as HTMLCanvasElement;
      const rect = canvas.getBoundingClientRect();
      return {
        canvasWidth: Math.round(rect.width),
        innerWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
      };
    });

    // The canvas still fills its parent, and the page has not gained a
    // horizontal scrollbar.
    expect(metrics.canvasWidth).toBeGreaterThan(metrics.innerWidth * 0.9);
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);
    expect(await page.evaluate(() => window.__town?.joined())).toBe(true);
  });
});
