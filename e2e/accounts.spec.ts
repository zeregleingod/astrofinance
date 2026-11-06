import { type Page } from '@playwright/test';
import { expect, startEmpty, test } from './fixtures';

const STATEMENT = 'e2e/fixtures/sabadell-enero-2026.xls';

async function openAccounts(page: Page) {
  const openMenu = page.getByRole('button', { name: 'Abrir menú' });
  if (await openMenu.isVisible()) await openMenu.click();
  const settings = page.getByRole('navigation', { name: 'Configuración' });
  await settings.getByRole('link', { name: 'Cuentas' }).click();
  await expect(page).toHaveURL(/\/configuracion\/cuentas$/);
  await expect(page).toHaveTitle('Cuentas · AstroFinance');
}

test('crear, renombrar y eliminar cuentas; la del extracto importado no se elimina', async ({
  page,
}) => {
  await startEmpty(page, '/importar');
  await page.locator('main input[type="file"]').setInputFiles(STATEMENT);
  await page.getByRole('button', { name: /^Guardar \(\d+\)$/ }).click();
  await expect(page.getByText(/Movimientos guardados: \d+\./)).toBeVisible();

  await openAccounts(page);
  const imported = page.locator('li.card').filter({ hasText: 'Banc Sabadell' });
  await expect(imported).toHaveCount(1);
  await expect(imported.getByRole('button', { name: /^No se puede eliminar/ })).toHaveAttribute(
    'aria-disabled',
    'true',
  );

  // Alta: el banco se elige por su tarjeta y se le pone nombre.
  const ing = page.getByRole('group', { name: 'Banco' }).getByRole('radio', { name: 'ING' });
  await ing.check();
  await expect(ing).toBeChecked();
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Cuenta nómina');
  await page.getByRole('button', { name: 'Añadir cuenta' }).click();
  await expect(page.getByRole('status')).toHaveText('Cuenta añadida: Cuenta nómina');
  const nomina = page.locator('li.card').filter({ hasText: 'Cuenta nómina' });
  await expect(nomina).toContainText('ING');
  await expect(nomina).toContainText('Sin movimientos');
  await expect(nomina.locator('.badge')).toHaveText('IN');

  // Sin movimientos, el banco también cambia.
  await nomina.getByRole('button', { name: 'Editar: Cuenta nómina' }).click();
  const editor = page.locator('li.card.editing');
  await editor.getByRole('textbox', { name: 'Nombre' }).fill('Nómina');
  await editor.getByRole('combobox', { name: 'Banco' }).selectOption({ label: 'N26' });
  await editor.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('status')).toHaveText('Cuenta guardada: Nómina');
  await expect(page.locator('li.card').filter({ hasText: 'Nómina' })).toContainText('N26');

  await page.getByRole('button', { name: 'Eliminar: Nómina' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Eliminar' }).click();
  await expect(page.getByRole('status')).toHaveText('Cuenta eliminada: Nómina');
  await expect(page.locator('li.card')).toHaveCount(1);
});
