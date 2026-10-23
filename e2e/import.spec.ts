import { type Page } from '@playwright/test';
import { expect, movements, test } from './fixtures';

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
  // Se llega filtrando por las fechas del mes importado.
  await expect(movements.count(page)).toHaveText(`Movimientos (${TOTAL - 1} de ${TOTAL - 1})`);
  await expect((await movements.openFilters(page)).getByLabel('Desde')).toHaveValue('01/01/2026');
  await expect(movements.item(page, /Nómina/)).toContainText('1.850,00 €');
  const light = movements.item(page, /ADEUDO RECIBO LUZ DEMO/);
  await expect(light).toContainText('-70,00 €');
  await expect(light).toContainText('Importe corregido');
  await expect(movements.item(page, 'ABONO PROMOCIÓN')).toHaveCount(0);
});

test('la categoría viene propuesta por las reglas y se puede cambiar', async ({ page }) => {
  await page.goto('/configuracion/reglas-de-categoria');
  await page.getByRole('textbox', { name: 'Texto', exact: true }).fill('recibo luz');
  await page
    .getByRole('combobox', { name: 'Categoría', exact: true })
    .selectOption({ label: 'Suministros › Luz' });
  await page.getByRole('button', { name: 'Añadir regla' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Regla añadida' })).toBeVisible();

  // Sin recargar: la BD de esta pestaña vive en memoria.
  await openNav(page);
  await page.getByRole('link', { name: 'Importar extracto' }).click();
  await chooseStatement(page);

  const light = page.getByRole('combobox', { name: 'Categoría: ADEUDO RECIBO LUZ DEMO' });
  await expect(light.locator('option:checked')).toHaveText('Suministros › Luz');
  await expect(page.getByRole('row', { name: /ADEUDO RECIBO LUZ DEMO/ })).toContainText(
    'Propuesta por una regla',
  );
  await expect(page.getByText(/Categorías propuestas: 1 por tus reglas/)).toBeVisible();

  // Cambiada la única propuesta, ya no queda ninguna que revisar.
  await light.selectOption({ label: 'Variables › Hogar' });
  await expect(page.getByText(/Categorías propuestas/)).toHaveCount(0);
  await expect(page.getByRole('row', { name: /ADEUDO RECIBO LUZ DEMO/ })).not.toContainText(
    'Propuesta por una regla',
  );
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
