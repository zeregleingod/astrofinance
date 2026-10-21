import { type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { expect, movements, test } from './fixtures';

const STATEMENT = 'e2e/fixtures/sabadell-enero-2026.xls';
const TOTAL = 44;
const BACKUP_URL = '/configuracion/copia-de-seguridad';

async function openNav(page: Page) {
  const openMenu = page.getByRole('button', { name: 'Abrir menú' });
  if (await openMenu.isVisible()) await openMenu.click();
}

async function importStatement(page: Page) {
  await page.goto('/importar');
  await page.locator('main input[type="file"]').setInputFiles(STATEMENT);
  await page.getByRole('button', { name: `Guardar (${TOTAL})` }).click();
  await expect(page.getByText(`Movimientos guardados: ${TOTAL}.`)).toBeVisible();
}

async function openBackup(page: Page) {
  await openNav(page);
  const settings = page.getByRole('navigation', { name: 'Configuración' });
  await settings.getByRole('link', { name: 'Copia de seguridad' }).click();
  await expect(page).toHaveURL(new RegExp(`${BACKUP_URL}$`));
}

test.beforeEach(async ({ page }) => {
  // El diálogo nativo de guardado no se puede manejar desde el test: se prueba la descarga.
  await page.addInitScript(() => {
    delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });
});

test('descargar una copia, recargar la página y volver a cargarla', async ({ page }) => {
  await importStatement(page);
  await openBackup(page);
  await expect(page).toHaveTitle('Copia de seguridad · AstroFinance');

  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar copia' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^astrofinance-\d{4}-\d\d-\d\d\.db$/);
  await expect(page.getByRole('status').filter({ hasText: 'Copia descargada' })).toBeVisible();
  const copy = await readFile(await download.path());
  expect(copy.subarray(0, 15).toString('latin1')).toBe('SQLite format 3');

  // Al recargar se pierde lo que había en memoria: no queda nada que descargar.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Descargar copia' })).toBeDisabled();
  await expect(
    page.getByRole('main').getByText('Todavía no hay datos tuyos que guardar.'),
  ).toBeVisible();

  await page
    .locator('main input[type="file"]')
    .setInputFiles({ name: 'mi-copia.db', mimeType: 'application/vnd.sqlite3', buffer: copy });
  await expect(
    page.getByRole('status').filter({ hasText: 'Copia cargada: mi-copia.db.' }),
  ).toContainText(`Movimientos: ${TOTAL}.`);
  await expect(page.getByRole('button', { name: 'Descargar copia' })).toBeEnabled();

  await page.getByRole('link', { name: 'Ver los movimientos' }).click();
  await expect(movements.count(page)).toHaveText(`Movimientos (${TOTAL})`);
});

test('cargar una copia sobre datos propios pide confirmación', async ({ page }) => {
  await importStatement(page);
  await openBackup(page);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar copia' }).click();
  const copy = await readFile(await (await downloading).path());

  const load = page.getByRole('button', { name: 'Cargar copia…' });
  const input = page.locator('main input[type="file"]');
  const file = { name: 'mi-copia.db', mimeType: 'application/vnd.sqlite3', buffer: copy };

  await input.setInputFiles(file);
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('¿Sustituir tus datos por los de la copia?');
  await expect(dialog).toContainText('«mi-copia.db»');
  await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Copia cargada')).toHaveCount(0);

  await input.setInputFiles(file);
  await dialog.getByRole('button', { name: 'Sustituir' }).click();
  await expect(page.getByText('Copia cargada: mi-copia.db.')).toBeVisible();
  await expect(load).toBeEnabled();
});

test('un fichero que no es una copia se rechaza y no toca los datos', async ({ page }) => {
  await page.goto('/demo');
  await expect(page.getByText('septiembre de 2026')).toBeVisible();
  await openBackup(page);
  await expect(page.getByRole('button', { name: 'Descargar copia' })).toBeDisabled();
  await expect(
    page.getByRole('main').getByText('En el modo demo no hay datos tuyos que guardar.'),
  ).toBeVisible();

  await page.locator('main input[type="file"]').setInputFiles(STATEMENT);
  await expect(page.getByRole('alert')).toContainText(
    'El fichero no es una copia de AstroFinance. Tus datos siguen como estaban.',
  );

  await openNav(page);
  await page.getByRole('link', { name: 'Resumen', exact: true }).click();
  await expect(page.getByText('septiembre de 2026')).toBeVisible();
});
