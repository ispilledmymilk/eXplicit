import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test',
  testMatch: ['**/*.compliance.spec.js'],

  timeout: 45_000,
  retries: 1,

  reporter: [
    ['list'],
    ['html', { outputFolder: 'test/reports/playwright', open: 'never' }],
  ],

  use: {
    baseURL: 'https://www.zoocasa.com',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,

    // Realistic desktop browser fingerprint — prevents zoocasa.com bot-detection 403s
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    extraHTTPHeaders: {
      'Accept-Language': 'en-CA,en;q=0.9',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    },
    launchOptions: {
      args: ['--disable-blink-features=AutomationControlled'],
    },
  },

  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
