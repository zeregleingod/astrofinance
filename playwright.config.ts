import { defineConfig, devices } from '@playwright/test';

const PORT = 4300;

/** E2E contra el build de producción servido por tools/serve-dist.mjs. */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  // En local, con la mitad de los núcleos (el valor por defecto) los cuatro navegadores se
  // estorban y algún test agota la espera de vez en cuando; con la cuarta parte tarda lo mismo.
  workers: process.env['CI'] ? undefined : '25%',
  reporter: process.env['CI'] ? 'github' : 'list',
  // Con los cuatro navegadores en paralelo, Firefox tarda a veces más de los 5 s por defecto en
  // arrancar SQLite en el worker.
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
    locale: 'es-ES',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npm run build && npm run serve:dist',
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
  },
});
