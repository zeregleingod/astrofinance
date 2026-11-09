import { type Page } from '@playwright/test';
import {
  expect,
  goByMenu,
  movements,
  openDemo,
  startEmpty,
  startWithAccount,
  test,
} from './fixtures';

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
  await startWithAccount(page, '/importar', 'Cuenta Sabadell');
  await page.locator('main input[type="file"]').setInputFiles(STATEMENT);
  await page.getByRole('button', { name: /^Guardar \(\d+\)$/ }).click();
  await expect(page.getByText(/Movimientos guardados: \d+\./)).toBeVisible();

  await openAccounts(page);
  const imported = page.locator('li.card').filter({ hasText: 'Cuenta Sabadell' });
  await expect(imported).toHaveCount(1);
  // El extracto le ha dado el final del IBAN.
  await expect(imported).toContainText('4321');
  await expect(imported.getByRole('button', { name: /^No se puede eliminar/ })).toHaveAttribute(
    'aria-disabled',
    'true',
  );

  // Alta: el banco se elige por su tarjeta, con su logotipo, y se le pone nombre.
  const ing = page.getByRole('group', { name: 'Banco' }).getByRole('radio', { name: 'ING' });
  await ing.check();
  await expect(ing).toBeChecked();
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Cuenta nómina');
  await page.getByRole('button', { name: 'Añadir cuenta' }).click();
  await expect(page.getByRole('status')).toHaveText('Cuenta añadida: Cuenta nómina');
  const nomina = page.locator('li.card').filter({ hasText: 'Cuenta nómina' });
  await expect(nomina).toContainText('ING');
  await expect(nomina).toContainText('Sin movimientos');
  await expect(nomina.locator('img.badge')).toHaveAttribute('src', 'banks/ing.webp');

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

test('la cuenta se elige en el menú lateral y todo lo que se ve es de ella', async ({ page }) => {
  await openDemo(page, '/movimientos');
  const openMenu = page.getByRole('button', { name: 'Abrir menú' });
  if (await openMenu.isVisible()) await openMenu.click();
  const picker = page.locator('app-account-picker').getByRole('combobox', { name: 'Cuenta' });
  await expect(picker.locator('option:checked')).toHaveText('Cuenta principal');
  await expect(movements.item(page, 'Traspaso a Hucha emergencias').first()).toBeAttached();

  await picker.selectOption({ label: 'Hucha viajes' });
  await expect(picker.locator('option:checked')).toHaveText('Hucha viajes');
  await expect(movements.item(page, 'Traspaso a Hucha emergencias')).toHaveCount(0);
  await expect(movements.item(page, 'Traspaso a Hucha viajes').first()).toBeAttached();
});

test('sin cuentas, importar enseña los primeros pasos y lleva a crearlas', async ({ page }) => {
  await startWithAccount(page, '/configuracion/cuentas', 'Temporal');
  await page.getByRole('button', { name: 'Eliminar: Temporal' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Eliminar' }).click();
  await expect(page.getByRole('status')).toHaveText('Cuenta eliminada: Temporal');

  await goByMenu(page, '/importar');
  await expect(
    page.getByRole('heading', { name: 'Crea tu primera cuenta para importar sus extractos' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Elegir fichero' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Crear mi primera cuenta' }).click();
  await expect(page).toHaveURL(/\/configuracion\/cuentas$/);
});

test('primeros pasos: sin cuenta invitan a crearla y, con ella, a importar', async ({ page }) => {
  await startEmpty(page);
  await expect(
    page.getByRole('heading', { name: 'Crea tu primera cuenta para ver el resumen del mes' }),
  ).toBeVisible();
  // En el menú lateral, el hueco de la cuenta, sin enlaces.
  await expect(page.locator('app-account-picker a')).toHaveCount(0);

  await page.getByRole('link', { name: 'Crear mi primera cuenta' }).click();
  await expect(page).toHaveURL(/\/configuracion\/cuentas$/);
  await page
    .getByRole('group', { name: 'Banco' })
    .getByRole('radio', { name: 'Banc Sabadell' })
    .check();
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Cuenta nómina');
  await page.getByRole('button', { name: 'Añadir cuenta' }).click();
  await expect(page.getByRole('status')).toHaveText('Cuenta añadida: Cuenta nómina');

  await goByMenu(page, '/anual');
  await expect(
    page.getByRole('heading', { name: '«Cuenta nómina» está lista para su primer extracto' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Importar el primer extracto' }).click();
  await expect(page).toHaveURL(/\/importar$/);
  await expect(page.getByRole('combobox', { name: 'Cuenta de destino' })).toBeVisible();
});
