import { defineConfig, devices } from '@playwright/test';
export default defineConfig({ testDir: './e2e', testMatch: ['camera-visual.spec.ts', 'avatar-visual.spec.ts', 'tap-movement.spec.ts'], workers: 1, timeout: 60000, reporter: 'list', use: { browserName: 'webkit', screenshot: 'only-on-failure' }, projects: [
 { name: 'iphone', use: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } } },
 { name: 'iphone-bars', use: { ...devices['iPhone 13'], viewport: { width: 390, height: 664 } } },
 { name: 'landscape', use: { ...devices['iPhone 13 landscape'] } },
 { name: 'desktop', use: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } }
] });