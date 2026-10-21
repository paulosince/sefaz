import { defineConfig, devices } from 'playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:8090', serviceWorkers: 'block' },
  webServer: { command: 'http-server -p 8090 -c-1 -s .', url: 'http://127.0.0.1:8090/index.html', reuseExistingServer: true },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'iphone', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
  ],
});
