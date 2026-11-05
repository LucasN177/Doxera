import { defineConfig, devices } from '@playwright/test'

// An uncommon port, so another project's preview server isn't picked up by mistake
const PORT = 5392
const ci = !!process.env.CI

/**
 * End-to-end tests against the production build (`vite preview`), so the
 * service worker and offline behaviour are the real ones. Locally the
 * installed Microsoft Edge is used (no browser download); CI installs
 * Playwright's Chromium.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  reporter: ci ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/`,
    locale: 'de-DE',
    trace: 'retain-on-failure',
    ...(ci ? {} : { channel: 'msedge' }),
  },
  projects: [
    {
      name: 'desktop',
      testIgnore: '**/mobile.e2e.ts',
      use: { ...devices['Desktop Chrome'], ...(ci ? {} : { channel: 'msedge' }) },
    },
    {
      name: 'phone',
      // A small touch screen (layout, page overview); Chromium stands in for Safari here
      use: {
        ...devices['Pixel 7'],
        ...(ci ? {} : { channel: 'msedge' }),
      },
      testMatch: '**/mobile.e2e.ts',
    },
  ],
  webServer: {
    command: `npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !ci,
  },
})
