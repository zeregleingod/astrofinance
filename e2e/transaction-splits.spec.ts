import { type Page } from '@playwright/test';
import { expect, movements, test } from './fixtures';

async function openMenu(page: Page) {
  const menu = page.getByRole('button', { name: 'Abrir menú' });
  if (await menu.isVisible()) await menu.click();
}

async function openTransactions(page: Page) {
  await page.goto('/demo');
  await expect(page.getByText('septiembre de 2026')).toBeVisible();
  await openMenu(page);
  await page.getByRole('link', { name: 'Movimientos' }).click();
  await expect(movements.items(page).first()).toBeVisible();
}

test('dividir un movimiento en submovimientos: cada uno cuenta en su subcategoría', async ({
  page,
}) => {
  await openTransactions(page);
  const before = await movements.count(page).textContent();

  await page
    .getByRole('button', { name: /^Dividir en submovimientos: Gasolinera Demo, / })
    .first()
    .click();
  const dialog = page.getByRole('dialog', { name: 'Dividir en submovimientos' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(/Repartido 0,00\s€ de 55,00\s€/);

  await dialog.getByRole('button', { name: 'Añadir submovimiento' }).click();
  const first = dialog.getByRole('group', { name: 'Submovimiento 1' });
  // Propone lo que queda sin dividir y lleva el foco al concepto.
  await expect(first.getByRole('textbox', { name: 'Concepto' })).toBeFocused();
  await expect(first.getByRole('textbox', { name: 'Importe' })).toHaveValue('55,00');
  await first.getByRole('textbox', { name: 'Concepto' }).fill('Gasolina coche');
  await first.getByRole('textbox', { name: 'Importe' }).fill('30');
  await expect(dialog).toContainText(
    /Resto sin dividir\s*Se queda en Transporte › Gasolina\s*25,00\s€/,
  );

  await dialog.getByRole('button', { name: 'Añadir submovimiento' }).click();
  const second = dialog.getByRole('group', { name: 'Submovimiento 2' });
  await second.getByRole('textbox', { name: 'Concepto' }).fill('Lavado');
  await second
    .getByRole('combobox', { name: 'Subcategoría' })
    .selectOption({ label: 'Variables › Hogar' });
  await expect(second.getByRole('textbox', { name: 'Importe' })).toHaveValue('25,00');
  await expect(dialog).toContainText('Todo repartido');
  await dialog.getByRole('button', { name: 'Guardar' }).click();

  await expect(dialog).toHaveCount(0);
  // El movimiento sigue siendo uno, con la etiqueta «Dividido» y sus submovimientos debajo.
  await expect(movements.count(page)).toHaveText(before ?? '');
  await expect(movements.splits(page).filter({ hasText: 'GASOLINA COCHE' })).toHaveCount(1);
  await expect(movements.splits(page).filter({ hasText: 'LAVADO' })).toContainText('Hogar');
  await expect(
    page.getByRole('button', { name: /^Editar submovimientos: Gasolinera Demo, / }),
  ).toHaveCount(1);

  // En el resumen del mes, cada submovimiento sale en la línea de su subcategoría.
  await openMenu(page);
  await page.getByRole('link', { name: 'Resumen', exact: true }).click();
  await expect(page.getByText('septiembre de 2026')).toBeVisible();
  await expect(page.getByText('LAVADO')).toBeVisible();
  await expect(page.getByText('GASOLINA COCHE')).toBeVisible();
});

test('no deja guardar si los submovimientos suman más que el movimiento', async ({ page }) => {
  await openTransactions(page);
  await page
    .getByRole('button', { name: /^Dividir en submovimientos: Gasolinera Demo, / })
    .first()
    .click();
  const dialog = page.getByRole('dialog', { name: 'Dividir en submovimientos' });

  await dialog.getByRole('button', { name: 'Añadir submovimiento' }).click();
  const item = dialog.getByRole('group', { name: 'Submovimiento 1' });
  await item.getByRole('textbox', { name: 'Concepto' }).fill('Demasiado');
  await item.getByRole('textbox', { name: 'Importe' }).fill('60');
  await expect(dialog).toContainText('Los submovimientos suman más que el movimiento');
  await expect(dialog).toContainText(/Sobran 5,00\s€/);
  await dialog.getByRole('button', { name: 'Guardar' }).click();

  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(movements.splits(page).filter({ hasText: 'DEMASIADO' })).toHaveCount(0);
});

test('un movimiento vinculado no se divide: el botón dice por qué', async ({ page }) => {
  await openTransactions(page);
  const transfer = movements
    .item(page, 'Traspaso a Hucha viajes')
    .filter({ hasText: 'Cuenta principal' })
    .first();
  const split = transfer.getByRole('button', {
    name: /^No se puede dividir un movimiento vinculado: /,
  });
  await expect(split).toHaveAttribute('aria-disabled', 'true');
  await split.click({ force: true });
  await expect(page.getByRole('dialog', { name: 'Dividir en submovimientos' })).toHaveCount(0);
});
