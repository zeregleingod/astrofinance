import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';

test.skip(({ isMobile }) => isMobile, 'Solo en escritorio');

async function openTransactions(page: Page) {
  await page.goto('/demo');
  await expect(page.getByText('septiembre de 2026')).toBeVisible();
  await page.getByRole('link', { name: 'Movimientos' }).click();
}

/** Los contenedores de la app que se desplazan en vertical: solo debe hacerlo la página. */
function scrollbars(page: Page) {
  return page.evaluate(() =>
    ['html', 'body', 'mat-sidenav-container', 'mat-sidenav-content', 'main']
      .map((name) => ({ name, el: document.querySelector(name) }))
      .filter(({ el }) => el !== null && el.scrollHeight > el.clientHeight)
      .map(({ name }) => name),
  );
}

test('se desplaza la página y la búsqueda, los filtros y la cabecera se quedan a la vista', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openTransactions(page);
  const table = page.getByRole('region', { name: 'Tabla de movimientos' });
  await expect(table.locator('tbody tr').nth(50)).toBeAttached();

  // La tabla no tiene barra propia: crece con sus filas y es la página la que se desplaza.
  const sizes = await table.evaluate((el) => ({
    wrap: el.scrollHeight - el.clientHeight,
    main: (el.closest('main')?.scrollHeight ?? 0) - (el.closest('main')?.clientHeight ?? 0),
  }));
  expect(sizes.wrap).toBeLessThanOrEqual(0);
  expect(sizes.main).toBeGreaterThan(0);
  expect(await scrollbars(page)).toEqual(['main']);

  await page.locator('main').evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(table.locator('tbody tr').last()).toBeInViewport();
  const search = page.getByRole('searchbox', { name: 'Buscar' });
  const apply = page.getByRole('button', { name: 'Filtrar' });
  const header = table.getByRole('columnheader', { name: 'Fecha', exact: true });
  await expect(search).toBeInViewport();
  await expect(apply).toBeInViewport();
  await expect(header).toBeInViewport();

  // La cabecera queda justo debajo de los filtros, sin taparlos ni dejar ver filas entre medias.
  const toolbar = await page.locator('main .toolbar').boundingBox();
  const head = await header.boundingBox();
  if (!toolbar || !head) throw new Error('Sin barra o cabecera');
  expect(Math.abs(head.y - (toolbar.y + toolbar.height))).toBeLessThanOrEqual(1);
});

test('los filtros son compactos: con la búsqueda caben en dos filas', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await openTransactions(page);
  const toolbar = await page.locator('main .toolbar-card').boundingBox();
  expect(toolbar?.height ?? 0).toBeLessThanOrEqual(120);
});

test('si la tabla no cabe a lo ancho, los movimientos se ven como tarjetas', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await openTransactions(page);
  await expect(page.locator('app-transaction-cards li').first()).toBeVisible();
  await expect(page.locator('main table')).toHaveCount(0);
  expect(await scrollbars(page)).toEqual(['main']);
  const overflow = await page.locator('main').evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('los botones de los filtros siguen al último filtro, en su misma fila', async ({ page }) => {
  await openTransactions(page);
  const filters = page.getByRole('form', { name: 'Filtros' });

  const last = await filters.locator('mat-form-field').last().boundingBox();
  const apply = await filters.getByRole('button', { name: 'Filtrar' }).boundingBox();
  const clear = await filters.getByRole('button', { name: 'Limpiar filtros' }).boundingBox();
  if (!last || !apply || !clear) throw new Error('Sin filtros a la vista');

  const middle = (box: { y: number; height: number }) => box.y + box.height / 2;
  expect(Math.abs(middle(clear) - middle(last))).toBeLessThan(8);
  expect(Math.abs(middle(apply) - middle(last))).toBeLessThan(8);
  expect(clear.x).toBeGreaterThan(last.x + last.width);
  expect(clear.x - (last.x + last.width)).toBeLessThan(24);
});
