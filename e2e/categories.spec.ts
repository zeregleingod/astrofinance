import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';

async function openNav(page: Page) {
  const openMenu = page.getByRole('button', { name: 'Abrir menú' });
  if (await openMenu.isVisible()) await openMenu.click();
}

test('configuración › categorías: dar de alta una categoría y sus subcategorías', async ({
  page,
}) => {
  await page.goto('/');
  await openNav(page);
  const settings = page.getByRole('navigation', { name: 'Configuración' });
  await settings.getByRole('link', { name: 'Categorías' }).click();

  await expect(page).toHaveURL(/\/configuracion\/categorias$/);
  await expect(page).toHaveTitle('Categorías · AstroFinance');
  await expect(page.getByRole('rowheader', { name: 'Variables', exact: true })).toBeVisible();

  // Arriba solo se crean categorías principales: nombre y color.
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Mascotas');
  await page.getByLabel('Color', { exact: true }).fill('#ff8800');
  await page.getByRole('button', { name: 'Añadir categoría' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Añadida: Mascotas' })).toBeVisible();

  // Las subcategorías se añaden en la tabla, con su tipo.
  const add = page.getByRole('button', { name: 'Añadir subcategoría: Mascotas' });
  await add.click();
  const name = page.getByRole('textbox', { name: 'Nombre: nueva subcategoría de Mascotas' });
  await expect(name).toBeFocused();
  await name.fill('Veterinario');
  await page
    .getByRole('combobox', { name: 'Tipo: nueva subcategoría de Mascotas' })
    .selectOption({ label: 'Ahorro' });
  await name.press('Enter');

  await expect(page.getByRole('row', { name: /Veterinario/ })).toContainText('Ahorro');
  await expect(add).toBeFocused();

  // Repetir el nombre dentro de la misma categoría no se guarda.
  await add.click();
  await name.fill('veterinario');
  await expect(page.getByText('Ya hay una con ese nombre en el mismo nivel.')).toBeVisible();
  await name.press('Enter');
  await name.press('Escape');
  await expect(name).toHaveCount(0);
  await expect(page.getByRole('rowheader', { name: 'Veterinario' })).toHaveCount(1);

  // Lo que se asigna a un movimiento son las subcategorías.
  await openNav(page);
  await page.getByRole('link', { name: 'Importar extracto' }).click();
  await page.locator('input[type="file"]').setInputFiles('e2e/fixtures/sabadell-enero-2026.xls');
  const category = page.getByRole('combobox').first();
  await expect(category.getByRole('option', { name: 'Mascotas › Veterinario' })).toBeAttached();
  await expect(category.getByRole('option', { name: 'Mascotas', exact: true })).toHaveCount(0);
});

test('editar una subcategoría y una categoría, y eliminarla con sus movimientos', async ({
  page,
}) => {
  await page.goto('/demo');
  await expect(page.getByText('septiembre de 2026')).toBeVisible();
  await openNav(page);
  await page.getByRole('link', { name: 'Categorías' }).click();
  const variables = page.getByRole('row', { name: 'Variables' }).first();
  await expect(variables.locator('.count')).toHaveText(/^[1-9]\d*$/);

  // Subcategoría: nombre y tipo.
  await page.getByRole('button', { name: 'Editar: Variables › Comida' }).click();
  const subName = page.getByRole('textbox', { name: 'Nombre: Variables › Comida' });
  await expect(subName).toBeFocused();
  await subName.fill('Supermercado');
  await page.getByRole('combobox', { name: 'Tipo: Variables › Comida' }).selectOption('ahorro');
  await subName.press('Enter');
  await expect(page.getByRole('row', { name: /Supermercado/ })).toContainText('Ahorro');
  await expect(
    page.getByRole('button', { name: 'Editar: Variables › Supermercado' }),
  ).toBeFocused();

  // Categoría principal: nombre y color, sin tipo.
  await page.getByRole('button', { name: 'Editar: Variables', exact: true }).click();
  await expect(page.getByRole('combobox')).toHaveCount(0);
  await page.getByLabel('Color: Variables').fill('#123456');
  await page.getByRole('textbox', { name: 'Nombre: Variables' }).fill('Día a día');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Guardada: Día a día' })).toBeVisible();
  await expect(
    page.locator('.group-row', { hasText: 'Día a día' }).locator('circle'),
  ).toHaveAttribute('fill', '#123456');

  await page.getByRole('button', { name: 'Eliminar: Día a día', exact: true }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('¿Eliminar «Día a día»?');
  await expect(dialog).toContainText('se quedarán sin categoría');
  await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Eliminar' }).click();

  await expect(page.getByRole('status').filter({ hasText: 'Eliminada: Día a día' })).toBeVisible();
  await expect(page.getByRole('rowheader', { name: 'Día a día', exact: true })).toHaveCount(0);

  // Los movimientos siguen ahí, ahora sin categoría.
  await openNav(page);
  await page.getByRole('link', { name: 'Resumen' }).click();
  await expect(page.getByRole('heading', { level: 3, name: 'Sin categoría' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 3, name: 'Día a día' })).toHaveCount(0);
});

test('entrar en categorías no quita el acceso a la demo', async ({ page }) => {
  await page.goto('/');
  await openNav(page);
  await page.getByRole('link', { name: 'Categorías' }).click();
  await expect(page.getByRole('rowheader', { name: 'Variables', exact: true })).toBeVisible();

  await openNav(page);
  await page.getByRole('link', { name: 'Ver la demo' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Modo demo' })).toBeVisible();
  await expect(page.getByText('septiembre de 2026')).toBeVisible();
});

test('/configuracion lleva a las categorías', async ({ page }) => {
  await page.goto('/configuracion');
  await expect(page).toHaveURL(/\/configuracion\/categorias$/);
  await expect(page.getByRole('heading', { level: 2, name: 'Categorías' })).toBeVisible();
});
