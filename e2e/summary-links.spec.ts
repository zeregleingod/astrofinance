import { expect, movements, test } from './fixtures';

test('cada total del resumen lleva a los movimientos que lo forman', async ({ page }) => {
  await page.goto('/demo');
  await expect(page.getByText('septiembre de 2026')).toBeVisible();

  await page.getByRole('link', { name: '-808,94 €' }).click();

  await expect(page).toHaveURL(/\/movimientos\?mes=2026-09&origen=gastos$/);
  await expect(page.getByText('Del resumen: Gastos de septiembre de 2026')).toBeVisible();
  await expect(movements.count(page)).toHaveText(/Movimientos \(\d+ de \d+\)/);
  // El Bizum de octubre que devuelve parte de las cortinas suma en los gastos de septiembre.
  await expect(movements.byDescription(page, 'Bizum recibido - Alex - Cortinas')).toHaveCount(1);
  await expect(movements.item(page, 'Nómina')).toHaveCount(0);

  await page.getByRole('button', { name: 'Quitar el filtro del resumen' }).click();
  await expect(page.getByText('Del resumen:')).toHaveCount(0);
  await expect(movements.count(page)).toHaveText(/Movimientos \(\d+\)/);
});
