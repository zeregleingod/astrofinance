import { type Page } from '@playwright/test';
import { expect, movements, test } from './fixtures';

async function openNav(page: Page) {
  const openMenu = page.getByRole('button', { name: 'Abrir menú' });
  if (await openMenu.isVisible()) await openMenu.click();
}

test('la barra lateral ofrece ver la demo y la abre', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Todavía no hay movimientos.')).toBeVisible();
  await openNav(page);
  await page.getByRole('link', { name: 'Ver la demo' }).click();

  // En móvil, mientras se cierra el menú, se ven a la vez su aviso y el de la barra superior.
  await expect(page.getByRole('status').filter({ hasText: 'Modo demo' }).first()).toBeVisible();
  await expect(page.getByText('septiembre de 2026')).toBeVisible();
});

test('la demo carga datos ficticios en memoria y se puede recorrer', async ({ page, isMobile }) => {
  await page.goto('/demo');

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('status').filter({ hasText: 'Modo demo' })).toBeVisible();
  await expect(page.getByText('septiembre de 2026')).toBeVisible();
  await expect(page.getByRole('heading', { level: 3, name: 'Hipoteca y vivienda' })).toBeVisible();
  const kpis = page.getByRole('definition');
  await expect(kpis.first()).toHaveText('1.850,00 €');

  await page.getByRole('button', { name: 'Mes anterior' }).click();
  await expect(page).toHaveURL(/\?mes=2026-08$/);
  await expect(page.getByText('agosto de 2026')).toBeVisible();

  await openNav(page);
  await page.getByRole('link', { name: 'Movimientos' }).click();
  await expect(movements.count(page)).toHaveText(/Movimientos \(\d+\)/);
  const curtains = movements.item(page, /Bizum recibido - Alex - Cortinas/);
  if (isMobile) {
    await expect(curtains.locator('.date')).toHaveText('28/09/2026 (fecha modificada)');
    await expect(curtains).toContainText('Fecha original: 03/10/2026');
  } else {
    await expect(curtains.getByRole('cell').nth(0)).toHaveText('28/09/2026 (fecha modificada)');
    await expect(curtains.getByRole('cell').nth(1)).toHaveText('03/10/2026');
  }
});

test('la tabla se ordena por columna y se filtra al escribir', async ({ page, isMobile }) => {
  test.skip(isMobile, 'En móvil no hay tabla: lo cubre mobile.spec.ts');
  await page.goto('/demo');
  await expect(page.getByText('septiembre de 2026')).toBeVisible();
  await openNav(page);
  await page.getByRole('link', { name: 'Movimientos' }).click();
  const table = page.getByRole('table');
  await expect(table).toBeVisible();

  const amount = table.getByRole('columnheader', { name: 'Importe' });
  await amount.getByRole('button').click();
  await expect(amount).toHaveAttribute('aria-sort', 'ascending');
  await expect(table.locator('tbody tr').first()).toContainText('Préstamo hipotecario');
  await amount.getByRole('button').click();
  await expect(amount).toHaveAttribute('aria-sort', 'descending');
  await expect(table.locator('tbody tr').first()).toContainText('Nómina');

  await page.getByRole('searchbox', { name: 'Buscar' }).fill('cortinas');
  await expect(table.locator('tbody tr')).toHaveCount(2);
  await expect(table).toContainText('(2 de');
});

test('los filtros de movimientos no se aplican hasta pulsar «Filtrar»', async ({ page }) => {
  await page.goto('/demo');
  await expect(page.getByText('septiembre de 2026')).toBeVisible();
  await openNav(page);
  await page.getByRole('link', { name: 'Movimientos' }).click();
  const caption = movements.count(page);
  // Ya no va por meses: están los movimientos de los tres de la demo.
  await expect(caption).toHaveText(/Movimientos \(\d+\)/);
  const all = await caption.innerText();
  await expect(movements.item(page, /\/07\/2026/).first()).toBeAttached();

  const filters = await movements.openFilters(page);
  await filters.getByLabel('Año').selectOption({ label: '2026' });
  await filters.getByLabel('Desde').fill('01/08/2026');
  await filters.getByLabel('Hasta').fill('31/08/2026');
  await filters.getByLabel('Categoría', { exact: true }).selectOption({ label: 'Variables' });
  await filters.getByLabel('Subcategoría').selectOption({ label: 'Comida' });
  await filters.getByLabel('Importe máximo').fill('30');
  await expect(caption).toHaveText(all);

  await filters.getByRole('button', { name: 'Filtrar' }).click();
  await expect(caption).toHaveText(/Movimientos \(\d+ de \d+\)/);
  const rows = movements.items(page);
  await expect(rows.first()).toContainText('/08/2026');
  await expect(rows.filter({ hasText: 'Comida' })).toHaveCount(await rows.count());

  // Un rango imposible se explica y no cambia la lista.
  const filtered = await caption.innerText();
  await movements.openFilters(page);
  await filters.getByLabel('Hasta').fill('01/07/2026');
  await filters.getByRole('button', { name: 'Filtrar' }).click();
  await expect(filters.getByRole('alert')).toContainText('no puede ser anterior');
  await expect(caption).toHaveText(filtered);

  await filters.getByRole('button', { name: 'Limpiar filtros' }).click();
  await expect(caption).toHaveText(all);
  // En móvil limpiar también pliega los filtros, para ver la lista entera.
  await movements.openFilters(page);
  await expect(filters.getByLabel('Desde')).toHaveValue('');
});

test('cada movimiento ocupa una sola línea', async ({ page, isMobile }) => {
  test.skip(isMobile, 'En móvil cada movimiento es una tarjeta');
  await page.goto('/demo');
  await expect(page.getByText('septiembre de 2026')).toBeVisible();
  await openNav(page);
  await page.getByRole('link', { name: 'Movimientos' }).click();
  await expect(page.getByRole('table')).toBeVisible();
  // La tabla aparece antes que sus filas: se espera a que estén para medirlas.
  await expect(page.locator('tbody tr').nth(10)).toBeVisible();

  const heights = await page
    .locator('thead tr, tbody tr')
    .evaluateAll((rows) => rows.map((r) => r.getBoundingClientRect().height));
  expect(heights.length).toBeGreaterThan(10);
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);
  expect(Math.max(...heights)).toBeLessThan(56);
});

test('el aviso de la demo no ocupa sitio sobre las páginas', async ({ page, isMobile }) => {
  await page.goto('/demo');
  await expect(page.getByRole('status').filter({ hasText: 'Modo demo' })).toBeVisible();
  const main = await page.locator('main').boundingBox();
  // En escritorio la página empieza arriba del todo; en móvil, bajo la barra de siempre.
  const toolbar = isMobile ? ((await page.locator('mat-toolbar').boundingBox())?.height ?? 0) : 0;
  expect(main?.y).toBe(toolbar);
});

test('salir de la demo descarta los datos', async ({ page }) => {
  await page.goto('/demo');
  await expect(page.getByText('septiembre de 2026')).toBeVisible();

  await openNav(page);
  await page.getByRole('button', { name: 'Salir de la demo' }).click();

  await expect(page.getByText('Modo demo')).toHaveCount(0);
  await expect(page.getByText('Todavía no hay movimientos.')).toBeVisible();
});
