import { enterFrom, expect, test } from './fixtures';

const STATEMENT = 'e2e/fixtures/sabadell-enero-2026.xls';

test('sin BD, cualquier dirección enseña la landing y se entra en esa misma sección', async ({
  page,
}) => {
  await page.goto('/movimientos');
  await expect(page).toHaveTitle('AstroFinance');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tus finanzas, en tu equipo.');
  const actions = page.getByRole('group', { name: 'Cómo empezar' });
  await expect(actions.getByRole('button')).toHaveText(['Abrir mi archivo', 'Ver la demo']);
  await expect(page.getByRole('img', { name: /^Ejemplo con los datos de la demo/ })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toHaveCount(0);

  await enterFrom(page, 'Ver la demo');

  await expect(page).toHaveURL(/\/movimientos$/);
  await expect(page).toHaveTitle('Movimientos · AstroFinance');
  await expect(page.getByRole('status').filter({ hasText: 'Modo demo' }).first()).toBeVisible();
});

test('un fichero que no es una copia se explica y se sigue en la landing', async ({ page }) => {
  await page.goto('/');
  await page.locator('app-landing-page input[type="file"]').setInputFiles(STATEMENT);

  await expect(page.getByRole('alert')).toHaveText('El fichero no es una copia de AstroFinance.');
  await expect(page.getByRole('button', { name: 'Abrir mi archivo' })).toBeEnabled();

  // Se puede entrar de otra forma, y el error no se arrastra.
  await enterFrom(page, 'Empezar sin datos');
  await expect(page.getByText('Todavía no hay movimientos.')).toBeVisible();
});

test('la landing cambia de idioma y de tema sin entrar', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');

  await page.getByRole('button', { name: 'Idioma' }).click();
  await page.getByRole('menuitemradio', { name: 'English' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Your finances, on your own computer.',
  );
  await expect(page.getByRole('button', { name: 'View demo' })).toBeVisible();
  await expect(page.getByText('Mortgage and housing')).toBeVisible();

  await page.getByRole('button', { name: 'Dark mode' }).click();
  await expect(page.locator('html')).toHaveClass(/theme-dark/);
});

test('la landing cabe en el ancho de la pantalla', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Ver la demo' })).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  // Los dos botones se ven sin desplazarse.
  await expect(page.getByRole('button', { name: 'Abrir mi archivo' })).toBeInViewport();
});
