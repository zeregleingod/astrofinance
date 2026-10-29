import { type Page } from '@playwright/test';
import { expect, movements, test } from './fixtures';

const STATEMENT = 'e2e/fixtures/sabadell-enero-2026.xls';
const TOTAL = 44;

async function openNav(page: Page) {
  const openMenu = page.getByRole('button', { name: 'Abrir menú' });
  if (await openMenu.isVisible()) await openMenu.click();
}

async function openRules(page: Page) {
  await openNav(page);
  const settings = page.getByRole('navigation', { name: 'Configuración' });
  await settings.getByRole('link', { name: 'Reglas de concepto' }).click();
  await expect(page).toHaveURL(/\/configuracion\/reglas-de-concepto$/);
}

async function addRule(page: Page, operator: string, pattern: string, replacement: string) {
  await page.getByRole('combobox', { name: 'Condición', exact: true }).selectOption({
    label: operator,
  });
  await page.getByRole('textbox', { name: 'Texto', exact: true }).fill(pattern);
  await page.getByRole('textbox', { name: 'Por', exact: true }).fill(replacement);
  await page.getByRole('button', { name: 'Añadir regla' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Regla añadida' })).toBeVisible();
}

test('las reglas cambian el concepto al importar y en los movimientos existentes', async ({
  page,
}) => {
  await page.goto('/importar');
  await page.locator('main input[type="file"]').setInputFiles(STATEMENT);
  await page.getByRole('button', { name: `Guardar (${TOTAL})` }).click();
  await expect(page.getByText(`Movimientos guardados: ${TOTAL}.`)).toBeVisible();

  await openRules(page);
  await expect(page).toHaveTitle('Reglas de concepto · AstroFinance');
  await expect(page.getByText('Todavía no hay ninguna regla.')).toBeVisible();

  // Borra el número de tarjeta y deja el resto del concepto.
  await addRule(page, 'Contiene', '4000XXXXXXXX0001', '');
  await addRule(page, 'Es exactamente', 'nomina de empresa demo sl', 'Nómina');
  const rules = page.getByRole('table', { name: 'Tus reglas' });
  await expect(rules.getByRole('row')).toHaveCount(3);

  const apply = page.getByRole('button', { name: 'Aplicar a movimientos existentes' });
  await apply.click();
  const preview = page.getByRole('table', { name: 'Cambios propuestos' });
  await expect(page.getByRole('heading', { name: 'Cambios propuestos' })).toBeFocused();
  await expect(preview.getByRole('row', { name: /NOMINA DE EMPRESA DEMO SL/ })).toContainText(
    'Nómina',
  );
  await expect(
    preview.getByRole('row', { name: /COMPRA TARJ\. CAFETERIA DEMO-BARCELONA/ }).first(),
  ).toBeVisible();

  await page.getByRole('button', { name: /^Aplicar cambios/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Conceptos cambiados:' })).toBeVisible();
  await apply.click();
  await expect(page.getByText('Ningún concepto cambiaría con las reglas actuales.')).toBeVisible();

  await openNav(page);
  await page.getByRole('link', { name: 'Movimientos' }).click();
  await expect(movements.item(page, /Nómina/).first()).toBeVisible();
  // El concepto del banco no se pierde: las tarjetas lo enseñan debajo del nuevo.
  await expect(
    movements.item(page, /COMPRA TARJ\. CAFETERIA DEMO-BARCELONA/).first(),
  ).toBeVisible();
});

test('al importar, el concepto llega ya cambiado y se puede corregir', async ({ page }) => {
  await page.goto('/configuracion/reglas-de-concepto');
  await addRule(page, 'Es exactamente', 'nomina de empresa demo sl', 'Nómina');

  // Sin recargar: la BD de esta pestaña vive en memoria.
  await openNav(page);
  await page.getByRole('link', { name: 'Importar extracto' }).click();
  await page.locator('main input[type="file"]').setInputFiles(STATEMENT);
  await expect(page.getByRole('heading', { name: 'Extracto de enero de 2026' })).toBeVisible();

  await expect(
    page.getByRole('textbox', { name: 'Concepto: NOMINA DE EMPRESA DEMO SL' }),
  ).toHaveValue('Nómina');
});
