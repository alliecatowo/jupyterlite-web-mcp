import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.JLITE_PORT ?? 8765);

/**
 * The tests run against the built static JupyterLite site in `dist/`, which is
 * the same artifact that gets deployed. Nothing here needs a Jupyter server.
 */
export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    video: 'off'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ],
  webServer: {
    command: `python3 serve.py --port ${PORT} --directory ../dist`,
    url: `http://127.0.0.1:${PORT}/lab/index.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
