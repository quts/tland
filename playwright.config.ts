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

  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: 'retain-on-failure',
  },

  projects: [
    {
      name: 'iphone',
      use: { ...devices['iPhone 13'], browserName: 'webkit' },
    },
    {
      name: 'ipad',
      use: { ...devices['iPad (gen 7)'], browserName: 'webkit' },
    },
  ],

  webServer: [
    {
      command: 'npm run start -w @tland/server',
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
