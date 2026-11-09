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

/** Entra en la aplicación desde la landing (ADR-0029) con uno de sus botones, sin cambiar de URL. */
export async function enterFrom(page: Page, button: string) {
  await page.getByRole('button', { name: button }).click();
  await expect(page.locator('app-landing-page')).toHaveCount(0);
}

/** Abre `path` y entra con la demo: datos ficticios en memoria. */
export async function openDemo(page: Page, path = '/') {
  await page.goto(path);
  await enterFrom(page, 'Ver la demo');
}

/** Abre `path` y entra sin datos: la BD del usuario, solo con la plantilla de categorías. */
export async function startEmpty(page: Page, path = '/') {
  await page.goto(path);
  await enterFrom(page, 'Empezar sin datos');
}

/** Va a `path` por el menú lateral, sin recargar: la BD de la pestaña vive en memoria. */
export async function goByMenu(page: Page, path: string) {
  const openMenu = page.getByRole('button', { name: 'Abrir menú' });
  if (await openMenu.isVisible()) await openMenu.click();
  await page.locator(`nav a[href="${path}"]`).click();
  await expect(page).toHaveURL((url) => url.pathname === path);
}

/**
 * Entra sin datos y crea una cuenta en Configuración › Cuentas (sin cuenta no se importa,
 * ADR-0035); luego va a `path` por el menú. La cuenta queda elegida: es la única.
 */
export async function startWithAccount(
  page: Page,
  path = '/importar',
  name = 'Cuenta Sabadell',
  bank = 'Banc Sabadell',
) {
  await startEmpty(page, '/configuracion/cuentas');
  await page.getByRole('group', { name: 'Banco' }).getByRole('radio', { name: bank }).check();
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill(name);
  await page.getByRole('button', { name: 'Añadir cuenta' }).click();
  await expect(page.getByRole('status')).toHaveText(`Cuenta añadida: ${name}`);
  if (path !== '/configuracion/cuentas') await goByMenu(page, path);
}

/**
 * El navegador tiene OPFS, donde se copian los datos de la pestaña para que sobrevivan a una
 * recarga (ADR-0031). El WebKit de Playwright en Windows no lo tiene: allí recargar vuelve a la
 * landing, como en un navegador sin OPFS.
 */
export async function keepsSession(page: Page): Promise<boolean> {
  return page.evaluate(() =>
    navigator.storage.getDirectory().then(
      () => true,
      () => false,
    ),
  );
}

/** Sale de los datos del usuario con «Salir» del menú y su diálogo, y espera a la landing. */
export async function exitApp(page: Page) {
  const exit = page.getByRole('button', { name: 'Salir', exact: true });
  // En móvil está en el menú, que hay que abrir si está cerrado.
  if (!(await exit.isVisible())) await page.getByRole('button', { name: 'Abrir menú' }).click();
  await exit.click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Salir' }).click();
  await expect(page.locator('app-landing-page')).toBeVisible();
  // Vuelve al inicio: hasta que no termina de navegar, recargar cortaría la carga de la página.
  await expect(page).toHaveURL(/\/$/);
}

/**
 * La lista de movimientos se ve como tabla en escritorio y como tarjetas en móvil: estos
 * localizadores valen para las dos.
 */
export const movements = {
  /** «Movimientos (40)» o «Movimientos (12 de 40)». */
  count: (page: Page) => page.locator('main caption, main app-transaction-cards h3'),
  /** Cada movimiento: su fila o su tarjeta (sin las de sus submovimientos). */
  items: (page: Page) =>
    page.locator(
      'main tbody tr:not(.split-row):not(.refund-row), main app-transaction-cards li.card',
    ),
  /** Las devoluciones de los gastos: sus filas, debajo del gasto, o su lista en la tarjeta. */
  refunds: (page: Page) =>
    page.locator('main tbody tr.refund-row, main app-transaction-cards .refunds li'),
  /** Los submovimientos: sus filas, debajo del movimiento, o su lista dentro de la tarjeta. */
  splits: (page: Page) =>
    page.locator('main tbody tr.split-row, main app-transaction-cards .splits:not(.refunds) li'),
  item: (page: Page, text: string | RegExp) => movements.items(page).filter({ hasText: text }),
  /**
   * El movimiento con ese concepto. A diferencia de `item`, no lo confunde con un gasto que lleva
   * debajo ese concepto como devolución o submovimiento.
   */
  byDescription: (page: Page, text: string | RegExp) =>
    movements
      .items(page)
      .filter({ has: page.locator('td.description, .main .description', { hasText: text }) }),
  /** En móvil los filtros van plegados: los despliega si hace falta. */
  openFilters: async (page: Page) => {
    const toggle = page.getByRole('button', { name: /^Filtros/ });
    if ((await toggle.isVisible()) && (await toggle.getAttribute('aria-expanded')) === 'false') {
      await toggle.click();
    }
    return page.getByRole('form', { name: 'Filtros' });
  },
};
