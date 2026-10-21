import { expect, test as base, type Page } from '@playwright/test';

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

/**
 * La lista de movimientos se ve como tabla en escritorio y como tarjetas en móvil: estos
 * localizadores valen para las dos.
 */
export const movements = {
  /** «Movimientos (40)» o «Movimientos (12 de 40)». */
  count: (page: Page) => page.locator('main caption, main app-transaction-cards h3'),
  /** Cada movimiento: su fila o su tarjeta. */
  items: (page: Page) => page.locator('main tbody tr, main app-transaction-cards li'),
  item: (page: Page, text: string | RegExp) => movements.items(page).filter({ hasText: text }),
  /** En móvil los filtros van plegados: los despliega si hace falta. */
  openFilters: async (page: Page) => {
    const toggle = page.getByRole('button', { name: /^Filtros/ });
    if ((await toggle.isVisible()) && (await toggle.getAttribute('aria-expanded')) === 'false') {
      await toggle.click();
    }
    return page.getByRole('form', { name: 'Filtros' });
  },
};
