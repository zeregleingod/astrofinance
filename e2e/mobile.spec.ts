import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';

const pages = [
  'Resumen',
  'Resumen anual',
  'Movimientos',
  'Importar extracto',
  'Categorías',
  'Reglas de categoría',
  'Reglas de concepto',
  'Copia de seguridad',
];

test.beforeEach(async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Solo aplica a móvil');
  await page.goto('/demo');
  await expect(page.getByText('septiembre de 2026')).toBeVisible();
});

async function open(page: Page, name: string) {
  await page.getByRole('button', { name: 'Abrir menú' }).click();
  await page.getByRole('link', { name, exact: true }).click();
  await expect(page).toHaveTitle(`${name} · AstroFinance`);
}

test('ninguna página se sale de la pantalla por los lados', async ({ page }) => {
  for (const name of pages) {
    await open(page, name);
    await expect(page.locator('main h2')).toBeVisible();
    // Lo ancho (la hoja anual) se desplaza dentro de su recuadro, no la página entera.
    const overflow = await page
      .locator('main')
      .evaluate((main) => main.scrollWidth - main.clientWidth);
    expect(overflow, name).toBeLessThanOrEqual(0);
    // Solo se desplaza la página: el contenedor de la app no saca una segunda barra.
    const outer = await page
      .locator('mat-sidenav-content')
      .evaluate((el) => el.scrollHeight - el.clientHeight);
    expect(outer, name).toBeLessThanOrEqual(0);
  }
});

test('los movimientos se ven como tarjetas, con los filtros plegados', async ({ page }) => {
  await open(page, 'Movimientos');
  await expect(page.locator('main table')).toHaveCount(0);
  await expect(page.locator('app-transaction-cards li').first()).toBeVisible();

  const toggle = page.getByRole('button', { name: 'Filtros' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('form', { name: 'Filtros' })).toBeHidden();
  await toggle.click();
  await expect(page.getByRole('form', { name: 'Filtros' })).toBeVisible();
});
