import { existsSync } from 'node:fs';

import { defineConfig, devices } from '@playwright/test';

const PORT = 8788;

/**
 * Ba'zi muhitlarda Chromium oldindan o'rnatilgan bo'ladi va uning versiyasi
 * Playwright kutgan versiyadan farq qiladi. Shunday holatda uni yuklab
 * olmasdan, mavjud binarni ishlatamiz. CI'da bu yo'l bo'lmaydi va Playwright
 * o'zi o'rnatgan brauzer ishlatiladi.
 */
const PRESET_CHROMIUM = [
  process.env.CHROMIUM_PATH,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
].find(path => path && existsSync(path));

const launchOptions = PRESET_CHROMIUM ? { executablePath: PRESET_CHROMIUM } : {};

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['html'], ['list']] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
    launchOptions
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } }
  ],
  webServer: {
    command: `npx --yes http-server . -p ${PORT} -c-1 --silent`,
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000
  }
});
