import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { getTownMap } from '@tland/shared';
import { collectErrors, startStack, type Stack } from './support.js';

test.use({ video: 'on' });
test.describe('low-frame-rate tap movement', () => {
  test.describe.configure({ retries: 0 });
  let stack: Stack;
  test.beforeAll(async () => {
    const map = getTownMap();
    const spawn = map.spawnPoints.find(p => {
      for (let n = 0; n <= 3; n += 1) if (!map.isWalkable(p.x + n, p.y)) return false;
      for (let n = 0; n < 3; n += 1) {
        if (!map.isWalkable(p.x + n + 1, p.y + n + 1) ||
          !map.isWalkable(p.x + n + 1, p.y + n) || !map.isWalkable(p.x + n, p.y + n + 1)) return false;
      }
      return true;
    });
    expect(spawn).toBeDefined();
    stack = await startStack(3240, 4296, spawn!);
  });
  test.afterAll(async () => { await stack?.close(); });

  for (const view of ['2d', '3d'] as const) for (const fps of [30, 24]) {
    test(view + ' reaches and stops at the exact center with a ' + fps + 'fps simulation step', async ({ page }, testInfo) => {
      const errors = collectErrors(page), corrections: string[] = [];
      page.on('websocket', socket => socket.on('framereceived', ({ payload }) => {
        const message = JSON.parse(String(payload)) as { t: string };
        if (message.t === 'correction') corrections.push(String(payload));
      }));
      // Pace actual callbacks slowly enough not to trigger the server's speed guard,
      // while passing deterministic low-FPS timestamps to both renderer loops.
      await page.addInitScript((frameMs) => {
        const nativeRequest = window.requestAnimationFrame.bind(window);
        const nativeCancel = window.cancelAnimationFrame.bind(window);
        const pending = new Map<number, { timer: number; frame?: number }>();
        let sequence = 0, timestamp = performance.now(), delivered = 0;
        Object.defineProperty(window, '__tapFrames', { get: () => delivered });
        window.requestAnimationFrame = callback => {
          const id = ++sequence;
          const entry: { timer: number; frame?: number } = { timer: 0 };
          entry.timer = window.setTimeout(() => {
            entry.frame = nativeRequest(() => {
              pending.delete(id);
              delivered += 1;
              timestamp += frameMs;
              callback(timestamp);
            });
          }, frameMs);
          pending.set(id, entry);
          return id;
        };
        window.cancelAnimationFrame = id => {
          const entry = pending.get(id);
          if (entry === undefined) return;
          clearTimeout(entry.timer);
          if (entry.frame !== undefined) nativeCancel(entry.frame);
          pending.delete(id);
        };
      }, 1000 / fps);
      await page.goto(stack.baseURL + '/?view=' + view);
      await expect(page.locator('#join-button')).toHaveText('進入小鎮', { timeout: 20_000 });
      await page.locator('#nickname').fill('路線測試');
      await page.locator('#join-button').click();
      await page.waitForFunction(() => window.__town?.joined() === true);
      if (view === '2d') {
        // Phaser clamps deltas during its first 120 frames after focus/reset.
        const start = await page.evaluate(() => (window as Window & { __tapFrames: number }).__tapFrames);
        await page.waitForFunction(count => (window as Window & { __tapFrames: number }).__tapFrames >= count + 140, start,
          { timeout: 20_000 });
      } else await page.waitForTimeout(1800);
      const target = await page.evaluate(diagonal => {
        const town = window.__town!, here = town.position();
        const x = Math.floor(here.x / 32) + 3, y = Math.floor(here.y / 32) + (diagonal ? 3 : 0);
        return { x, y, screen: town.tileToScreen(x, y)!, start: here };
      }, fps === 24);
      const expected = { x: target.x * 32 + 16, y: target.y * 32 + 16 };
      // Software-rendered tablet frames can take longer than simulated time.
      // Keep sampling until arrival is stable, with a bounded wall-clock deadline.
      const samplesPromise = page.evaluate(expected => new Promise<Array<{ x: number; y: number; ms: number }>>(resolve => {
        const start = performance.now();
        const samples: Array<{ x: number; y: number; ms: number }> = [];
        let stable = 0;
        const timer = setInterval(() => {
          samples.push({ ...window.__town!.position(), ms: performance.now() - start });
          const position = samples.at(-1)!;
          stable = Math.hypot(position.x - expected.x, position.y - expected.y) < 1e-5 ? stable + 1 : 0;
          const elapsed = performance.now() - start;
          if ((elapsed >= 4000 && stable >= 10) || elapsed >= 15_000) { clearInterval(timer); resolve(samples); }
        }, 30);
      }), expected);
      const box = (await page.locator('#game canvas').boundingBox())!;
      if (testInfo.project.use.hasTouch) await page.touchscreen.tap(box.x + target.screen.x, box.y + target.screen.y);
      else await page.mouse.click(box.x + target.screen.x, box.y + target.screen.y);
      const samples = await samplesPromise;
      let reversals = 0;
      for (let i = 1; i < samples.length; i += 1) {
        const a = samples[i - 1]!, b = samples[i]!;
        if ((b.x - a.x) * (expected.x - target.start.x) +
          (b.y - a.y) * (expected.y - target.start.y) < -0.1) reversals += 1;
      }
      await writeFile(testInfo.outputPath('motion.json'), JSON.stringify({ view, fps, target, expected, samples, reversals, corrections }, null, 2));
      await page.screenshot({ path: testInfo.outputPath('arrived.png') });
      console.log('tap result', JSON.stringify({ view, fps, reversals, corrections: corrections.length, final: samples.at(-1), expected }));
      expect(samples.at(-1)?.x).toBeCloseTo(expected.x, 5);
      expect(samples.at(-1)?.y).toBeCloseTo(expected.y, 5);
      expect(reversals).toBe(0);
      for (const sample of samples.slice(-10)) {
        expect(sample.x).toBeCloseTo(expected.x, 5);
        expect(sample.y).toBeCloseTo(expected.y, 5);
      }
      expect(corrections).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
});
