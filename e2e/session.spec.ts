import { exitApp, expect, keepsSession, openDemo, startEmpty, test } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  test.skip(!(await keepsSession(page)), 'Sin OPFS no hay copia de la pestaña (ADR-0031)');
});

/** Entra sin datos en Categorías y añade una categoría principal. */
async function startWithCategory(page: import('@playwright/test').Page, name: string) {
  await startEmpty(page, '/configuracion/categorias');
  await page.getByRole('textbox', { name: 'Nombre (Español)', exact: true }).fill(name);
  await page.getByRole('button', { name: 'Añadir categoría' }).click();
  await expect(page.getByRole('rowheader', { name, exact: true })).toBeVisible();
}

test('recargar la página conserva los datos de la pestaña (ADR-0031)', async ({ page }) => {
  await startWithCategory(page, 'Mascotas');

  // Hay cambios sin descargar: el navegador pregunta antes de recargar, con su aviso.
  const asked = new Promise<string>((resolve) =>
    page.once('dialog', (dialog) => {
      resolve(dialog.type());
      void dialog.accept();
    }),
  );
  await page.reload();
  expect(await asked).toBe('beforeunload');

  await expect(page.getByRole('rowheader', { name: 'Mascotas', exact: true })).toBeVisible();
  await expect(page.locator('app-landing-page')).toHaveCount(0);
  await expect(page).toHaveURL(/\/configuracion\/categorias$/);
});

test('«Salir» avisa, cierra los datos y recargar ya no los recupera', async ({ page }) => {
  await startWithCategory(page, 'Mascotas');
  const openMenu = page.getByRole('button', { name: 'Abrir menú' });
  if (await openMenu.isVisible()) await openMenu.click();

  await page.getByRole('button', { name: 'Salir', exact: true }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('¿Salir de AstroFinance?');
  await expect(dialog).toContainText('Se cerrarán tus datos y volverás a la pantalla de inicio.');
  await expect(dialog).toContainText('Tienes cambios sin descargar: si sales, se perderán.');
  await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByRole('rowheader', { name: 'Mascotas', exact: true })).toBeVisible();

  await exitApp(page);
  // Sin datos abiertos no hay nada que perder: recargar no pregunta y sigue en la landing.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Ver la demo' })).toBeVisible();
});

test('la demo no se conserva al recargar', async ({ page }) => {
  await openDemo(page);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Ver la demo' })).toBeVisible();
});

test('una pestaña nueva no ve los datos de otra', async ({ page, context }) => {
  await startWithCategory(page, 'Mascotas');

  const other = await context.newPage();
  await other.goto('/');
  await expect(other.getByRole('button', { name: 'Ver la demo' })).toBeVisible();
  await other.close();
});
