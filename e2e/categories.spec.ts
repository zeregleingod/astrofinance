import { type Locator, type Page } from '@playwright/test';
import { expect, test } from './fixtures';

async function openNav(page: Page) {
  const openMenu = page.getByRole('button', { name: 'Abrir menú' });
  if (await openMenu.isVisible()) await openMenu.click();
}

/** Arrastra `handle` con el ratón hasta el borde superior de `target`. */
async function drag(page: Page, handle: Locator, target: Locator) {
  await handle.scrollIntoViewIfNeeded();
  const from = await handle.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error('Sin posición para arrastrar');
  const x = from.x + from.width / 2;
  await page.mouse.move(x, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, from.y + from.height / 2 - 10, { steps: 5 });
  await page.mouse.move(x, to.y + 4, { steps: 20 });
  await page.mouse.up();
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
  await page
    .locator('main input[type="file"]')
    .setInputFiles('e2e/fixtures/sabadell-enero-2026.xls');
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
  await page.getByRole('link', { name: 'Resumen', exact: true }).click();
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
  // En móvil, mientras se cierra el menú, se ven a la vez su aviso y el de la barra superior.
  await expect(page.getByRole('status').filter({ hasText: 'Modo demo' }).first()).toBeVisible();
  await expect(page.getByText('septiembre de 2026')).toBeVisible();
});

test('/configuracion lleva a las categorías', async ({ page }) => {
  await page.goto('/configuracion');
  await expect(page).toHaveURL(/\/configuracion\/categorias$/);
  await expect(page.getByRole('heading', { level: 2, name: 'Categorías' })).toBeVisible();
});

test('las categorías se ordenan arrastrando y el orden se ve en los dos resúmenes', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'El arrastre se prueba con ratón');
  await page.setViewportSize({ width: 1280, height: 1600 });
  await page.goto('/demo');
  await expect(page.getByText('septiembre de 2026')).toBeVisible();
  await openNav(page);
  const settings = page.getByRole('navigation', { name: 'Configuración' });
  await settings.getByRole('link', { name: 'Categorías' }).click();

  const groups = page.locator('tbody.group');
  const groupOf = (name: string) =>
    groups.filter({ has: page.getByRole('rowheader', { name, exact: true }) });
  await expect(groups.first().locator('.group-row .name')).toHaveText('Ingresos');

  // Una categoría se arrastra por su asa con todas sus subcategorías.
  const groupNames = groups.locator('.group-row .name');
  await expect(groupNames.nth(4)).toHaveText('Suministros');
  await drag(
    page,
    groupOf('Transporte').locator('.group-row .drag-handle'),
    groupOf('Suministros'),
  );
  await expect(groupNames.nth(4)).toHaveText('Transporte');
  await expect(groupNames.nth(5)).toHaveText('Suministros');
  await expect(page.getByRole('status').filter({ hasText: 'Movida: Transporte' })).toBeVisible();

  // Una subcategoría, dentro de su categoría.
  const supplies = groupOf('Suministros');
  const names = supplies.locator('tr.sub .name');
  await expect(names.first()).toHaveText('Comunidad de vecinos');
  await drag(
    page,
    supplies.locator('tr.sub').filter({ hasText: 'Luz' }).locator('.drag-handle'),
    supplies.locator('tr.sub').first(),
  );
  await expect(names.nth(0)).toHaveText('Luz');
  await expect(names.nth(1)).toHaveText('Comunidad de vecinos');

  await openNav(page);
  await page.getByRole('link', { name: 'Resumen', exact: true }).click();
  await expect(page.locator('main .group h3').nth(4)).toHaveText('Transporte');
  const monthly = page.locator('main .group').filter({ hasText: 'Suministros' });
  await expect(monthly.locator('h4').nth(0)).toHaveText('Luz');
  await expect(monthly.locator('h4').nth(1)).toHaveText('Comunidad de vecinos');

  await openNav(page);
  await page.getByRole('link', { name: 'Resumen anual' }).click();
  await expect(page.locator('main tbody .group-name').nth(4)).toHaveText('Transporte');
});
