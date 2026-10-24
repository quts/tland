import { expect, test } from '@playwright/test';
import { collectErrors, joinTown, startStack, type Stack } from './support.js';

test.describe('merged districts', () => {
  let stack: Stack;
  test.beforeAll(async () => { stack = await startStack(3260, 4298, { x: 48, y: 85 }); });
  test.afterAll(async () => { await stack.close(); });

  for (const view of ['2d', '3d'] as const) {
    test(view + ' keeps the merged banner stable and announces the next retained district', async ({ page }, testInfo) => {
      const errors = collectErrors(page);
      await joinTown(page, stack.baseURL + '/?view=' + view, '分區驗證');
      await expect.poll(() => page.evaluate(() => window.__town!.zone())).toBe('青林');
      // A welcome message updates world state before the next rendered camera frame.
      await expect.poll(() => page.evaluate(() => {
        const p = window.__town!.tileToScreen(48, 85);
        return p === null ? Infinity : Math.hypot(p.x - innerWidth / 2, p.y - innerHeight / 2);
      })).toBeLessThan(2);
      const banner = page.locator('.zone-banner');
      await expect(banner).toHaveText('青林');
      await page.evaluate(() => {
        const texts: string[] = [];
        Object.defineProperty(window, '__zoneTexts', { value: texts });
        new MutationObserver(() => texts.push(document.querySelector('.zone-banner')!.textContent!))
          .observe(document.querySelector('.zone-banner')!, { childList: true, characterData: true, subtree: true });
      });
      const walkTo = async (x: number, y: number): Promise<void> => {
        const screen = await page.evaluate(([tx, ty]) => window.__town!.tileToScreen(tx!, ty!), [x, y]);
        expect(screen).not.toBeNull();
        const canvas = (await page.locator('#game canvas').boundingBox())!;
        await page.touchscreen.tap(canvas.x + screen!.x, canvas.y + screen!.y);
        await expect.poll(() => page.evaluate(([tx, ty]) => {
          const p = window.__town!.position();
          return Math.hypot(p.x - (tx! * 32 + 16), p.y - (ty! * 32 + 16));
        }, [x, y]), { timeout: 15_000 }).toBeLessThan(0.05);
      };
      // Cross a former border that is now internal to one merged district.
      await walkTo(47, 85);
      expect(await page.evaluate(() => window.__town!.zone())).toBe('青林');
      expect(await page.evaluate(() => (window as Window & { __zoneTexts: string[] }).__zoneTexts)).toEqual([]);
      // The next tile crosses the surviving district boundary.
      await walkTo(47, 84);
      await expect.poll(() => page.evaluate(() => window.__town!.zone())).toBe('平原');
      await expect(banner).toHaveText('平原');
      await page.screenshot({ path: testInfo.outputPath('merged-district.png') });
      expect(errors).toEqual([]);
    });
  }
});
