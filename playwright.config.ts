import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end smoke tests against the real production build.
 *
 * WebKit only: the target is iPhone and iPad Safari, and a pass in Chromium
 * would say nothing about the browser these players actually use. The server
 * and a static preview of the built client are started by Playwright itself,
 * so `npm run test:e2e` needs nothing running beforehand.
 */
const WEB_PORT = Number(process.env['E2E_WEB_PORT'] ?? 4173);
const GAME_PORT = Number(process.env['E2E_GAME_PORT'] ?? 3100);

export default defineConfig({
  testDir: './e2e',
  // Two browser contexts talk to one shared room, so the specs cannot
  // safely run at the same time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? 'list' : 'line',
  timeout: 45_000,
  expect: { timeout: 10_000 },

  // Artifacts go outside the repo: this runs over a bind mount into a VM,
  // where writing a multi-megabyte trace is slow enough to stall teardown.
  outputDir: process.env['PLAYWRIGHT_OUTPUT_DIR'] ?? 'test-results',

  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: 'retain-on-failure',
    video: 'off',
    screenshot: 'only-on-failure',
  },

  /**
   * Orientation is a project rather than a `setViewportSize` call inside a
   * test: resizing the window mid-test wedges Playwright's Linux WebKit, and
   * running the same assertions in a landscape viewport covers the same
   * ground without it.
   */
  projects: [
    {
      name: 'iphone',
      use: { ...devices['iPhone 13'], browserName: 'webkit' },
    },
    {
      name: 'iphone-landscape',
      use: { ...devices['iPhone 13 landscape'], browserName: 'webkit' },
    },
    {
      name: 'ipad',
      use: { ...devices['iPad (gen 7)'], browserName: 'webkit' },
    },
    {
      name: 'ipad-landscape',
      use: { ...devices['iPad (gen 7) landscape'], browserName: 'webkit' },
    },
  ],

  webServer: [
    {
      // `node` directly, not `npm run start`: Playwright kills the process it
      // spawned, and an npm wrapper leaves the real server holding the port,
      // so teardown waits for a port that never frees.
      command: 'node packages/server/dist/index.js',
      port: GAME_PORT,
      env: { GAME_PORT: String(GAME_PORT), GAME_HOST: '127.0.0.1' },
      reuseExistingServer: !process.env['CI'],
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      // Not `vite preview`: it does not forward protocol upgrades, so /ws
      // never reaches the game server under it.
      command: 'node e2e/preview-server.mjs packages/client/dist',
      port: WEB_PORT,
      env: {
        E2E_WEB_PORT: String(WEB_PORT),
        E2E_GAME_PORT: String(GAME_PORT),
      },
      reuseExistingServer: !process.env['CI'],
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
