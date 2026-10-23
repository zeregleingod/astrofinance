import { type Page } from '@playwright/test';
import { expect, movements, test } from './fixtures';

async function openTransactions(page: Page) {
  await page.goto('/demo');
  await expect(page.getByText('septiembre de 2026')).toBeVisible();
  const menu = page.getByRole('button', { name: 'Abrir menú' });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('link', { name: 'Movimientos' }).click();
  await expect(movements.items(page).first()).toBeVisible();
}

test('vincular a un gasto lo que te devuelven: cada ingreso, por su importe', async ({ page }) => {
  await openTransactions(page);

  await page.getByRole('button', { name: /^Vincular devoluciones: Pizzería Demo, / }).click();
  const dialog = page.getByRole('dialog', { name: 'Devoluciones del gasto' });
  await expect(dialog).toContainText(/Devuelto 0,00\s€ de 32,40\s€/);

  await dialog.getByRole('button', { name: /^Vincular: Transferencia recibida/ }).click();
  // El importe es el del ingreso y no se puede cambiar.
  await expect(dialog.getByRole('textbox')).toHaveCount(0);
  await expect(dialog.getByRole('searchbox')).toHaveCount(1);
  await expect(dialog).toContainText(/Devuelto 25,00\s€ de 32,40\s€/);
  await expect(dialog).toContainText(/Te cuesta 7,40\s€/);
  // Lo que ya no cabe en lo que falta no se ofrece.
  await expect(
    dialog.getByRole('button', { name: /^Vincular: Devolución Tienda de ropa/ }),
  ).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Guardar' }).click();

  await expect(dialog).toHaveCount(0);
  await expect(movements.refunds(page).filter({ hasText: 'Transferencia recibida' })).toContainText(
    /25,00\s€/,
  );
  await expect(
    page.getByRole('button', { name: /^Editar devoluciones: Pizzería Demo, / }),
  ).toHaveCount(1);
});

test('quitar una devolución vuelve a ofrecer el ingreso', async ({ page }) => {
  await openTransactions(page);
  await page.getByRole('button', { name: /^Vincular devoluciones: Pizzería Demo, / }).click();
  const dialog = page.getByRole('dialog', { name: 'Devoluciones del gasto' });

  await dialog.getByRole('button', { name: /^Vincular: Devolución Tienda de ropa/ }).click();
  await expect(dialog).toContainText(/Te cuesta 14,40\s€/);
  await dialog.getByRole('button', { name: /^Quitar devolución: / }).click();
  await expect(dialog).toContainText(/Te cuesta 32,40\s€/);
  await expect(
    dialog.getByRole('button', { name: /^Vincular: Devolución Tienda de ropa/ }),
  ).toHaveCount(1);
});

test('un ingreso dividido devuelve cada gasto con su parte (el Bizum de suministros)', async ({
  page,
}) => {
  await openTransactions(page);

  // Un solo ingreso que cubre dos gastos: se divide en una parte por gasto.
  await page
    .getByRole('button', { name: /^Dividir en submovimientos: Transferencia recibida/ })
    .click();
  const splitDialog = page.getByRole('dialog', { name: 'Dividir en submovimientos' });
  await splitDialog.getByRole('button', { name: 'Añadir submovimiento' }).click();
  const first = splitDialog.getByRole('group', { name: 'Submovimiento 1' });
  await first.getByRole('textbox', { name: 'Concepto' }).fill('Farmacia');
  await first.getByRole('textbox', { name: 'Importe' }).fill('7,91');
  await splitDialog.getByRole('button', { name: 'Añadir submovimiento' }).click();
  const second = splitDialog.getByRole('group', { name: 'Submovimiento 2' });
  await second.getByRole('textbox', { name: 'Concepto' }).fill('Pizza');
  await expect(second.getByRole('textbox', { name: 'Importe' })).toHaveValue('17,09');
  await splitDialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(splitDialog).toHaveCount(0);

  // Cada gasto se vincula con su parte.
  for (const [expense, part, cents] of [
    ['Farmacia Centro', 'FARMACIA', '7,91'],
    ['Pizzería Demo', 'PIZZA', '17,09'],
  ] as const) {
    await page
      .getByRole('button', { name: new RegExp(`^Vincular devoluciones: ${expense}, `) })
      .first()
      .click();
    const dialog = page.getByRole('dialog', { name: 'Devoluciones del gasto' });
    await dialog
      .getByRole('button', { name: new RegExp(`^Vincular: Transferencia recibida.* › ${part}, `) })
      .click();
    await expect(dialog).toContainText(new RegExp(`Devuelto ${cents}\\s€`));
    await dialog.getByRole('button', { name: 'Guardar' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(movements.refunds(page).filter({ hasText: `› ${part}` })).toContainText(
      new RegExp(`${cents}\\s€`),
    );
  }
  // El submovimiento dice qué devuelve.
  await expect(movements.splits(page).filter({ hasText: 'PIZZA' })).toContainText('Devuelve');
});
