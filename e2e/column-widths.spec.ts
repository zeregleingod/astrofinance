import { type Page } from '@playwright/test';
import { expect, openDemo, test } from './fixtures';

test.skip(({ isMobile }) => isMobile, 'Solo en escritorio: en el móvil se ven fichas');

/** El ancho en pantalla de una columna, por su cabecera. */
async function widthOf(page: Page, name: string): Promise<number> {
  const box = await page.locator('thead th', { hasText: name }).first().boundingBox();
  if (!box) throw new Error(`Sin cabecera ${name}`);
  return box.width;
}

async function openTransactions(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDemo(page, '/movimientos');
  await expect(page.locator('main tbody tr').first()).toBeVisible();
}

test('por defecto la cuenta ocupa menos que las observaciones', async ({ page }) => {
  await openTransactions(page);
  expect(await widthOf(page, 'Cuenta')).toBeLessThan(await widthOf(page, 'Observaciones'));
});

test('arrastrar el borde de una columna cambia su ancho y el de su vecina', async ({ page }) => {
  await openTransactions(page);
  const header = page.locator('thead th', { hasText: 'Cuenta' }).first();
  const border = header.getByRole('separator', { name: 'Ancho de la columna: Cuenta' });
  const before = await widthOf(page, 'Cuenta');
  const tableBefore = (await page.locator('main table').boundingBox())?.width;

  const box = await border.boundingBox();
  if (!box) throw new Error('Sin borde');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();

  await expect
    .poll(async () => Math.abs((await widthOf(page, 'Cuenta')) - (before + 80)))
    .toBeLessThanOrEqual(2);
  // La tabla sigue ocupando lo mismo: lo ganado lo pierde la descripción.
  expect((await page.locator('main table').boundingBox())?.width).toBe(tableBefore);
  // No ha reordenado las columnas.
  await expect(page.locator('thead th[data-key]').nth(1)).toHaveAttribute('data-key', 'account');

  // Con el teclado: las flechas lo mueven y Inicio vuelve a los anchos de siempre.
  await border.focus();
  await page.keyboard.press('ArrowLeft');
  await expect
    .poll(async () => Math.abs((await widthOf(page, 'Cuenta')) - (before + 64)))
    .toBeLessThanOrEqual(2);
  await page.keyboard.press('Home');
  await expect
    .poll(async () => Math.abs((await widthOf(page, 'Cuenta')) - before))
    .toBeLessThanOrEqual(2);
});

test('los anchos se recuerdan al volver a la página', async ({ page }) => {
  await openTransactions(page);
  const border = page.getByRole('separator', { name: 'Ancho de la columna: Cuenta' });
  const before = await widthOf(page, 'Cuenta');
  await border.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');

  await page.getByRole('link', { name: 'Resumen', exact: true }).click();
  await page.getByRole('link', { name: 'Movimientos' }).click();
  await expect(page.locator('main tbody tr').first()).toBeVisible();

  await expect
    .poll(async () => Math.abs((await widthOf(page, 'Cuenta')) - (before + 32)))
    .toBeLessThanOrEqual(2);
});
