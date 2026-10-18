import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';

/** Extracto ficticio con la forma del Banc Sabadell (`tools/make-sabadell-fixture.mjs`). */
const STATEMENT = 'e2e/fixtures/sabadell-enero-2026.xls';
const TOTAL = 44;

async function openNav(page: Page) {
  const openMenu = page.getByRole('button', { name: 'Abrir menú' });
  if (await openMenu.isVisible()) await openMenu.click();
}

async function chooseStatement(page: Page) {
  await page.locator('main input[type="file"]').setInputFiles(STATEMENT);
  await expect(page.getByRole('heading', { name: 'Extracto de enero de 2026' })).toBeVisible();
}

test('importar un extracto: revisar, editar, guardar y verlo en movimientos', async ({ page }) => {
  await page.goto('/');
  await openNav(page);
  await page.getByRole('link', { name: 'Importar extracto' }).click();
  await expect(page.getByRole('button', { name: 'Elegir fichero' })).toBeVisible();

  await chooseStatement(page);
  const review = page.getByRole('table');
  await expect(review.locator('tbody tr')).toHaveCount(TOTAL);
  await expect(page.getByText('Cuenta: Banc Sabadell ·4321')).toBeVisible();
  // Ni el titular ni el IBAN completo del fichero llegan a la pantalla.
  await expect(page.getByText('TITULAR')).toHaveCount(0);
  await expect(page.getByText('ES00 0000')).toHaveCount(0);

  await page.getByRole('textbox', { name: 'Concepto: NOMINA DE EMPRESA DEMO SL' }).fill('Nómina');
  await page.getByRole('textbox', { name: 'Importe: ADEUDO RECIBO LUZ DEMO' }).fill('-70,00');
  await page
    .getByRole('textbox', { name: 'Observaciones: ADEUDO RECIBO LUZ DEMO' })
    .fill('Importe corregido');
  await page.getByRole('checkbox', { name: 'Guardar: ABONO PROMOCIÓN' }).uncheck();

  await page.getByRole('button', { name: `Guardar (${TOTAL - 1})` }).click();
  await expect(page.getByText(`Movimientos guardados: ${TOTAL - 1}.`)).toBeVisible();

  await page.getByRole('link', { name: 'Ver los movimientos' }).click();
  await expect(page).toHaveURL(/\/movimientos\?mes=2026-01$/);
  const table = page.getByRole('table');
  // Se llega filtrando por las fechas del mes importado.
  await expect(table).toContainText(`Movimientos (${TOTAL - 1} de ${TOTAL - 1})`);
  await expect(page.getByRole('form', { name: 'Filtros' }).getByLabel('Desde')).toHaveValue(
    '01/01/2026',
  );
  await expect(table.getByRole('row', { name: /Nómina/ })).toContainText('1.850,00 €');
  const light = table.getByRole('row', { name: /ADEUDO RECIBO LUZ DEMO/ });
  await expect(light).toContainText('-70,00 €');
  await expect(light).toContainText('Importe corregido');
  await expect(table.getByText('ABONO PROMOCIÓN')).toHaveCount(0);
});

test('reimportar el mismo extracto no duplica movimientos', async ({ page }) => {
  await page.goto('/importar');
  await chooseStatement(page);
  await page.getByRole('button', { name: `Guardar (${TOTAL})` }).click();
  await expect(page.getByText(`Movimientos guardados: ${TOTAL}.`)).toBeVisible();

  await page.getByRole('button', { name: 'Importar otro extracto' }).click();
  await chooseStatement(page);

  await expect(page.getByText('No hay ningún movimiento nuevo que guardar.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guardar (0)' })).toBeDisabled();
  await expect(page.locator('tbody tr').first()).toContainText('Ya guardado');
});

test('un fichero que no es un extracto se rechaza con un mensaje claro', async ({ page }) => {
  await page.goto('/importar');
  await page.locator('main input[type="file"]').setInputFiles({
    name: 'notas.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Fecha;Texto\n01/01/2026;Hola\n'),
  });

  await expect(page.getByRole('alert')).toContainText('No se reconoce el formato del fichero');
  await expect(page.getByRole('button', { name: 'Elegir fichero' })).toBeVisible();
});

test('en la demo no se puede importar', async ({ page }) => {
  await page.goto('/demo');
  await expect(page.getByText('septiembre de 2026')).toBeVisible();
  await openNav(page);
  await page.getByRole('link', { name: 'Importar extracto' }).click();

  await expect(page.getByText('En el modo demo no se pueden importar extractos')).toBeVisible();
  await expect(page.locator('main input[type="file"]')).toHaveCount(0);
});
