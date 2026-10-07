import { expect, test as base } from '@playwright/test';

interface Guards {
  /** Peticiones abortadas por salir del origen de la app (ver T9.4). */
  externalRequests: string[];
  /** Errores no capturados y errores de consola (incluidas violaciones de CSP). */
  pageErrors: string[];
}

/**
 * Fixture base de todos los e2e. Falla el test si la app intenta usar la red
 * fuera de su origen o si se produce cualquier error en la página.
 */
export const test = base.extend<Guards>({
  externalRequests: [
    async ({ page, baseURL }, use) => {
      const origin = new URL(baseURL ?? 'http://127.0.0.1').origin;
      const external: string[] = [];
      await page.route('**/*', (route) => {
        const url = route.request().url();
        if (url.startsWith(origin) || url.startsWith('data:') || url.startsWith('blob:')) {
          return route.continue();
        }
        external.push(url);
        return route.abort();
      });
      await use(external);
      expect(external, 'La app no debe hacer peticiones fuera de su origen').toEqual([]);
    },
    { auto: true },
  ],
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(err.message));
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
      });
      await use(errors);
      expect(errors, 'La página no debe registrar errores').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
