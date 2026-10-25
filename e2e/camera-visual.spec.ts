import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { getTownMap } from '@tland/shared';
import { AVATAR_SCALE, characterBodyGeometry } from '../packages/client/src/three/avatar3d.js';
import { cameraBasis, CAMERA_PITCH_DEG, viewportFrame } from '../packages/client/src/three/cameraRig.js';
import { collectErrors, startStack, type Stack } from './support.js';
for (const scene of ['street', 'woodland'] as const) test.describe('camera ' + scene, () => {
 let stack: Stack;
 test.beforeAll(async () => {
  const map = getTownMap(); let spawn = map.spawn;
  if (scene === 'woodland') { let score = -1; for (const spot of map.spawnPoints) {
   let trees = 0; for (let z = -7; z <= 3; z++) for (let x = -5; x <= 5; x++) if (map.propAt(spot.x + x, spot.y + z) === 'tree') trees++;
   if (trees > score) { score = trees; spawn = spot; }
  }}
  stack = await startStack(3250, 4297, spawn);
 });
 test.afterAll(async () => { await stack.close(); });
 test('captures the same stationary outfit and street', async ({ page }, testInfo) => {
  const errors = collectErrors(page), sockets: string[] = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('websocket', socket => sockets.push(socket.url()));
  await page.goto(stack.baseURL + '/?view=3d');
  await expect(page.locator('#join-button')).toHaveText('進入小鎮');
  await page.locator('#pick-shirt .swatch').nth(4).click();
  await page.locator('#nickname').fill('鏡頭比較'); await page.locator('#join-button').click();
  await page.waitForFunction(() => window.__town?.joined() === true);
  await expect.poll(() => page.evaluate(() => window.__town?.stats()?.drawCalls ?? 0)).toBeGreaterThan(0);
  await page.waitForTimeout(1200);
  const viewport = page.viewportSize()!, frame = viewportFrame(viewport.width, viewport.height, { halfWidth: 0, halfHeight: 0 });
  const stats = await page.evaluate(() => ({ position: window.__town!.position(), stats: window.__town!.stats(), canvas: document.querySelector('#game canvas')!.getBoundingClientRect().toJSON() }));
  // One shared geometry: every character is this shape.
  const geometry = characterBodyGeometry();
  const vertices = geometry.getAttribute('position');
  let top = -Infinity, bottom = Infinity;
  const up = cameraBasis().up;
  for (let i = 0; i < vertices.count; i++) {
    const projected = AVATAR_SCALE * (vertices.getX(i) * up.x + vertices.getY(i) * up.y + vertices.getZ(i) * up.z);
    top = Math.max(top, projected); bottom = Math.min(bottom, projected);
  }
  const pixelsPerTile = viewport.height / (frame.halfHeight * 2);
  const silhouette = { top: viewport.height / 2 - top * pixelsPerTile, bottom: viewport.height / 2 - bottom * pixelsPerTile, height: (top - bottom) * pixelsPerTile };
  const tag = (await page.locator('.name-tag', { hasText: '鏡頭比較' }).boundingBox())!;
  expect(Math.abs(tag.x + tag.width / 2 - viewport.width / 2)).toBeLessThan(1);
  expect(tag.y + tag.height).toBeLessThanOrEqual(silhouette.top + 1);
  const metrics = { silhouette, viewport, pitch: CAMERA_PITCH_DEG, frame, groundDepth: frame.halfHeight * 2 / -cameraBasis().forward.y,
   pixelsPerTile: viewport.height / (2 * frame.halfHeight), projectedAvatarAxis: 2.405 * Math.cos(CAMERA_PITCH_DEG * Math.PI / 180) * viewport.height / (2 * frame.halfHeight), ...stats, sockets };
  console.log('camera metrics', JSON.stringify(metrics));
  await writeFile(testInfo.outputPath('metrics.json'), JSON.stringify(metrics, null, 2));
  await page.screenshot({ path: testInfo.outputPath('town.png') });
  await page.screenshot({ path: testInfo.outputPath('detail.png'), clip: { x: viewport.width / 2 - 75, y: viewport.height / 2 - 130, width: 150, height: 150 } });
  expect(sockets.every(url => url.startsWith('ws://127.0.0.1:4297/'))).toBe(true);
  expect(stats.stats!.drawCalls).toBeLessThan(150); expect(stats.stats!.triangles).toBeLessThan(300_000);
  expect(errors).toEqual([]);
 });
});
