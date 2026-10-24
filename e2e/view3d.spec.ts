import { expect, test } from '@playwright/test';

/**
 * The 3D view (M0 spike): it loads behind `?view=3d`, draws the island, and
 * the local player walks.
 *
 * WebGL here may be software-rendered, so this asserts behaviour and budgets
 * that do not depend on the GPU — draw calls, movement, the district — and
 * never frame rate. Frame rate is measured by hand on a phone; see TESTING.md.
 */

declare global {
  interface Window {
    __town3d?: {
      ready(): boolean;
      position(): { x: number; y: number };
      zone(): string | null;
      calls(): number;
      triangles(): number;
    };
  }
}

test.describe('3D view', () => {
  test.describe.configure({ timeout: 90_000 });

  test('draws the island within budget and walks', async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/?view=3d&debug=1', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__town3d?.ready() === true, null, {
      timeout: 30_000,
    });
    // Let a few frames render so the counters describe a real frame.
    await page.waitForFunction(() => (window.__town3d?.calls() ?? 0) > 0);

    await expect(page.locator('#game canvas')).toBeVisible();
    await expect(page.locator('#joystick')).toBeVisible();
    await expect(page.locator('.debug-hud-text')).toContainText('calls');
    // The join screen belongs to the networked game, not to this spike.
    await expect(page.locator('#join')).toBeHidden();

    const calls = await page.evaluate(() => window.__town3d?.calls() ?? 0);
    expect(calls).toBeGreaterThan(0);
    expect(calls).toBeLessThan(150);
    expect(await page.evaluate(() => window.__town3d?.zone())).not.toBeNull();

    await page.screenshot({ path: testInfo.outputPath('view3d-start.png') });

    const before = await page.evaluate(() => window.__town3d?.position());
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(900);
    await page.keyboard.up('ArrowRight');
    const after = await page.evaluate(() => window.__town3d?.position());
    expect(after?.x).toBeGreaterThan((before?.x ?? 0) + 8);
    expect(after?.y).toBeCloseTo(before?.y ?? 0, 3);

    await page.screenshot({ path: testInfo.outputPath('view3d-walked.png') });
    expect(errors).toEqual([]);
  });

  test('stays within budget over the wooded hills', async ({ page }, testInfo) => {
    // The road over the northern hills: the most trees in one view.
    await page.goto('/?view=3d&debug=1&at=64,40', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => (window.__town3d?.calls() ?? 0) > 0, null, {
      timeout: 30_000,
    });
    const position = await page.evaluate(() => window.__town3d?.position());
    expect(position).toEqual({ x: 64 * 32 + 16, y: 40 * 32 + 16 });

    const calls = await page.evaluate(() => window.__town3d?.calls() ?? 0);
    expect(calls).toBeLessThan(150);
    await page.screenshot({ path: testInfo.outputPath('view3d-hills.png') });
  });

  test('without the flag, the page is the 2D game', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#join')).toBeVisible();
    expect(await page.evaluate(() => window.__town3d === undefined)).toBe(true);
  });
});
