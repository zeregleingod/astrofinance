import { expect, test } from './fixtures';

test.skip(({ isMobile }) => isMobile, 'En móvil el menú es un panel que se abre y se cierra');

test('el menú lateral se pliega a solo iconos, se despliega y lo recuerda', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Navegación principal' });
  const sidenav = page.locator('mat-sidenav');
  const wide = (await sidenav.boundingBox())?.width ?? 0;

  await page.getByRole('button', { name: 'Plegar menú' }).click();
  await expect(page.getByRole('button', { name: 'Desplegar menú' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expect.poll(async () => (await sidenav.boundingBox())?.width).toBeLessThan(wide / 2);
  // Los enlaces siguen funcionando y conservan su nombre.
  await nav.getByRole('link', { name: 'Movimientos' }).click();
  await expect(page).toHaveURL(/\/movimientos/);
  // El contenido ocupa el sitio que deja la barra.
  await expect
    .poll(async () => (await page.locator('main').boundingBox())?.x)
    .toBeLessThan(wide / 2);

  await page.reload();
  await expect(page.getByRole('button', { name: 'Desplegar menú' })).toBeVisible();

  await page.getByRole('button', { name: 'Desplegar menú' }).click();
  await expect(page.getByRole('button', { name: 'Plegar menú' })).toBeVisible();
  await expect.poll(async () => (await sidenav.boundingBox())?.width).toBe(wide);
});
