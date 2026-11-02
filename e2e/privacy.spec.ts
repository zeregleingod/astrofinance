import { expect, openDemo, test } from './fixtures';

test('la privacidad se abre desde la landing, sin BD, y se vuelve al inicio', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Privacidad' }).click();

  await expect(page).toHaveURL(/\/privacidad$/);
  await expect(page).toHaveTitle('Privacidad · AstroFinance');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Política de privacidad');
  await expect(page.getByRole('region', { name: 'El alojamiento: GitHub Pages' })).toBeVisible();
  await expect(page.locator('app-landing-page')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toHaveCount(0);

  await page.getByRole('link', { name: 'Volver al inicio' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('button', { name: 'Ver la demo' })).toBeVisible();
});

test('una dirección directa a la privacidad se ve sin entrar, y cambia de idioma', async ({
  page,
}) => {
  await page.goto('/privacidad');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Política de privacidad');

  await page.getByRole('button', { name: 'Idioma' }).click();
  await page.getByRole('menuitemradio', { name: 'English' }).click();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Privacy policy');
  await expect(page).toHaveTitle('Privacy · AstroFinance');
});

test('dentro de la aplicación, la privacidad está al pie del menú', async ({ page }) => {
  await openDemo(page);
  const link = page.getByRole('link', { name: 'Privacidad' });
  // En móvil está en el menú, que hay que abrir.
  if (!(await link.isVisible())) await page.getByRole('button', { name: 'Abrir menú' }).click();
  await link.click();

  await expect(page).toHaveURL(/\/privacidad$/);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Política de privacidad');
  // Se sigue dentro: con los datos de la demo abiertos.
  await expect(page.getByRole('status').filter({ hasText: 'Modo demo' }).first()).toBeAttached();
});
