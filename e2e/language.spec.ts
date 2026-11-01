import { expect, test } from './fixtures';

test('el idioma se cambia desde la barra lateral, sin recargar, y se recuerda', async ({
  page,
}) => {
  await page.goto('/demo');
  await expect(page.getByText('septiembre de 2026')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  const openMenu = page.getByRole('button', { name: 'Abrir menú' });
  if (await openMenu.isVisible()) await openMenu.click();

  await page.getByRole('button', { name: 'Idioma' }).click();
  await page.getByRole('menuitemradio', { name: 'English' }).click();

  // La página no se ha recargado: sigue en la demo, ya en inglés.
  await expect(page.getByText('September 2026')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Yearly overview' })).toBeAttached();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page).toHaveTitle('Overview · AstroFinance');
  // Los importes se siguen escribiendo a la española.
  await expect(page.getByText(/\d,\d{2}\s€/).first()).toBeVisible();

  await page.reload();
  await expect(page).toHaveTitle(/· AstroFinance$/);
  await expect(page).not.toHaveTitle(/Resumen/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('en catalán, con los meses del calendario también en catalán', async ({ page }) => {
  await page.goto('/demo');
  await expect(page.getByText('septiembre de 2026')).toBeVisible();
  const openMenu = page.getByRole('button', { name: 'Abrir menú' });
  if (await openMenu.isVisible()) await openMenu.click();

  await page.getByRole('button', { name: 'Idioma' }).click();
  await page.getByRole('menuitemradio', { name: 'Català' }).click();

  await expect(page.getByText('setembre de 2026')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ca');
  await expect(page).toHaveTitle('Resum · AstroFinance');
});

test('las categorías se ven con su nombre en el idioma elegido, si lo tienen', async ({ page }) => {
  await page.goto('/demo');
  await expect(page.getByText('septiembre de 2026')).toBeVisible();
  const main = page.locator('main');
  await expect(main.getByText('Suministros', { exact: true }).first()).toBeVisible();
  const openMenu = page.getByRole('button', { name: 'Abrir menú' });
  if (await openMenu.isVisible()) await openMenu.click();

  await page.getByRole('button', { name: 'Idioma' }).click();
  await page.getByRole('menuitemradio', { name: 'English' }).click();

  await expect(main.getByText('Utilities', { exact: true }).first()).toBeVisible();
  await expect(main.getByText('Suministros', { exact: true })).toHaveCount(0);
});
