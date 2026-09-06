import { defineConfig, devices } from '@playwright/test';

const tip008ProviderMode = process.env.PLAYWRIGHT_PROVIDER === '1';
const tip007ProviderMode = process.env.PLAYWRIGHT_TIP007_PROVIDER === '1';
if (tip008ProviderMode && tip007ProviderMode) {
  throw new Error('TIP-007 and TIP-008 Playwright provider profiles are mutually exclusive.');
}

const providerMode = tip008ProviderMode || tip007ProviderMode;
const realProviderBaseUrl = process.env.PLAYWRIGHT_REAL_PROVIDER_BASE_URL ?? 'http://127.0.0.1:3109';
const localPort = Number(process.env.PLAYWRIGHT_LOCAL_PORT ?? '3109');
const providerProfile = tip008ProviderMode ? 'tip008' : tip007ProviderMode ? 'tip007' : 'contract';

const projects = providerProfile === 'tip008'
  ? [{
      name: 'tip008-provider',
      testMatch: /capabilities-pane\.production\.spec\.ts$/,
      grep: /@tip008-provider/,
      use: { baseURL: realProviderBaseUrl, ...devices['Desktop Chrome'] },
    }]
  : providerProfile === 'tip007'
    ? [{
        name: 'tip007-real-provider',
        testMatch: /capabilities-pane\.real\.spec\.ts$/,
        grep: /@tip007-provider/,
        use: { baseURL: realProviderBaseUrl, ...devices['Desktop Chrome'] },
      }]
    : [{
        name: 'chromium-contract',
        grepInvert: /@tip008-provider|@tip007-provider/,
        use: { baseURL: `http://127.0.0.1:${localPort}`, ...devices['Desktop Chrome'] },
      }];

export default defineConfig({
  testDir: './e2e',
  timeout: 30 * 1000,
  expect: {
    timeout: 5000
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { outputFolder: '/tmp/playwright-report' }]],
  outputDir: '/tmp/playwright-results',
  use: {
    actionTimeout: 0,
    trace: 'on-first-retry',
  },
  projects,
  webServer: providerMode ? undefined : {
    command: `env -u NEXT_PUBLIC_API_MOCKING pnpm dev --port ${localPort}`,
    port: localPort,
    reuseExistingServer: false,
    timeout: 120000,
  },
});
