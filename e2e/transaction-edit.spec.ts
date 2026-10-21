import { type Page } from '@playwright/test';
import { expect, movements, test } from './fixtures';

async function openTransactions(page: Page) {
  await page.goto('/demo');
  await expect(page.getByText('septiembre de 2026')).toBeVisible();
  const openMenu = page.getByRole('button', { name: 'Abrir menú' });
  if (await openMenu.isVisible()) await openMenu.click();
  await page.getByRole('link', { name: 'Movimientos' }).click();
  await expect(movements.items(page).first()).toBeVisible();
}

test('editar un movimiento: concepto, categoría, fecha y observaciones', async ({ page }) => {
  await openTransactions(page);

  const edit = page.getByRole('button', { name: /^Editar movimiento: Gasolinera Demo, / });
  await edit.first().click();
  const dialog = page.getByRole('dialog', { name: 'Editar movimiento' });
  await expect(dialog).toBeVisible();
  // Lo del banco se ve pero no se edita.
  await expect(dialog).toContainText('-55,00');
  await expect(dialog.getByRole('textbox', { name: 'Importe' })).toHaveCount(0);

  await dialog.getByRole('textbox', { name: 'Descripción' }).fill('Gasolina del coche');
  await dialog
    .getByRole('combobox', { name: 'Categoría' })
    .selectOption({ label: 'Variables › Ocio' });
  await dialog.getByRole('textbox', { name: 'Fecha', exact: true }).fill('01/01/2027');
  await dialog.getByRole('textbox', { name: 'Observaciones' }).fill('Viaje a la playa');
  await dialog.getByRole('button', { name: 'Guardar' }).click();

  await expect(dialog).toHaveCount(0);
  const edited = movements.item(page, 'Gasolina del coche');
  await expect(edited).toHaveCount(1);
  await expect(edited).toContainText('Ocio');
  await expect(edited).toContainText('01/01/2027');
  await expect(edited).toContainText('Viaje a la playa');
});

test('cancelar no cambia nada y el foco vuelve al botón', async ({ page }) => {
  await openTransactions(page);
  const before = await movements.count(page).textContent();

  const edit = page.getByRole('button', { name: /^Editar movimiento: Gasolinera Demo, / }).first();
  // Con el teclado: Safari no da el foco a un botón al pulsarlo con el ratón.
  await edit.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Editar movimiento' });
  await dialog.getByRole('textbox', { name: 'Descripción' }).fill('No se guarda');
  await page.keyboard.press('Escape');

  await expect(dialog).toHaveCount(0);
  await expect(edit).toBeFocused();
  await expect(movements.item(page, 'No se guarda')).toHaveCount(0);
  await expect(movements.count(page)).toHaveText(before ?? '');
});
