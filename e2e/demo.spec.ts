import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';

async function openNav(page: Page) {
  const openMenu = page.getByRole('button', { name: 'Abrir menú' });
  if (await openMenu.isVisible()) await openMenu.click();
}

test('la barra lateral ofrece ver la demo y la abre', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Todavía no hay movimientos.')).toBeVisible();
  await openNav(page);
  await page.getByRole('link', { name: 'Ver la demo' }).click();

  await expect(page.getByRole('status').filter({ hasText: 'Modo demo' })).toBeVisible();
  await expect(page.getByText('septiembre de 2026')).toBeVisible();
});

test('la demo carga datos ficticios en memoria y se puede recorrer', async ({ page }) => {
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
  await expect(page.getByRole('table')).toContainText('Movimientos de septiembre de 2026');
  const curtains = page.getByRole('row', { name: /Bizum recibido - Alex - Cortinas/ });
  await expect(curtains.getByRole('cell').nth(0)).toHaveText('28/09/2026 (fecha modificada)');
  await expect(curtains.getByRole('cell').nth(1)).toHaveText('03/10/2026');
});

test('la tabla se ordena por columna y se filtra al escribir', async ({ page }) => {
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

test('cada movimiento ocupa una sola línea', async ({ page }) => {
  await page.goto('/demo');
  await expect(page.getByText('septiembre de 2026')).toBeVisible();
  await openNav(page);
  await page.getByRole('link', { name: 'Movimientos' }).click();
  await expect(page.getByRole('table')).toBeVisible();

  const heights = await page
    .locator('thead tr, tbody tr')
    .evaluateAll((rows) => rows.map((r) => r.getBoundingClientRect().height));
  expect(heights.length).toBeGreaterThan(10);
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);
  expect(Math.max(...heights)).toBeLessThan(56);
});

test('salir de la demo descarta los datos', async ({ page }) => {
  await page.goto('/demo');
  await expect(page.getByText('septiembre de 2026')).toBeVisible();

  await page.getByRole('button', { name: 'Salir de la demo' }).click();

  await expect(page.getByText('Modo demo')).toHaveCount(0);
  await expect(page.getByText('Todavía no hay movimientos.')).toBeVisible();
});
