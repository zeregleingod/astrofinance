import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';

const STATEMENT = 'e2e/fixtures/sabadell-enero-2026.xls';
const TOTAL = 44;

async function openNav(page: Page) {
  const openMenu = page.getByRole('button', { name: 'Abrir menú' });
  if (await openMenu.isVisible()) await openMenu.click();
}

async function openRules(page: Page) {
  await openNav(page);
  const settings = page.getByRole('navigation', { name: 'Configuración' });
  await settings.getByRole('link', { name: 'Reglas de categoría' }).click();
  await expect(page).toHaveURL(/\/configuracion\/reglas-de-categoria$/);
}

async function addRule(page: Page, operator: string, pattern: string, category: string) {
  await page.getByRole('combobox', { name: 'Condición', exact: true }).selectOption({
    label: operator,
  });
  await page.getByRole('textbox', { name: 'Texto', exact: true }).fill(pattern);
  await page.getByRole('combobox', { name: 'Categoría', exact: true }).selectOption({
    label: category,
  });
  await page.getByRole('button', { name: 'Añadir regla' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Regla añadida' })).toBeVisible();
}

test('crear reglas, ver los cambios, cancelar y después confirmar', async ({ page }) => {
  await page.goto('/importar');
  await page.locator('input[type="file"]').setInputFiles(STATEMENT);
  await page.getByRole('button', { name: `Guardar (${TOTAL})` }).click();
  await expect(page.getByText(`Movimientos guardados: ${TOTAL}.`)).toBeVisible();

  await openRules(page);
  await expect(page).toHaveTitle('Reglas de categoría · AstroFinance');
  await expect(page.getByText('Todavía no hay ninguna regla.')).toBeVisible();
  const apply = page.getByRole('button', { name: 'Aplicar a movimientos existentes' });
  await expect(apply).toBeDisabled();

  await addRule(page, 'Contiene', 'nomina', 'Ingresos › Nómina');
  await addRule(page, 'Expresión regular', '^adeudo recibo (luz|gas)', 'Suministros › Luz');
  const rules = page.getByRole('table', { name: 'Tus reglas' });
  await expect(rules.getByRole('row')).toHaveCount(3);

  // Una expresión que no vale no se guarda.
  await page.getByRole('textbox', { name: 'Texto', exact: true }).fill('(a+)+');
  await expect(page.getByText('podría no terminar nunca')).toBeVisible();
  await page.getByRole('textbox', { name: 'Texto', exact: true }).fill('');

  await apply.click();
  const preview = page.getByRole('table', { name: 'Cambios propuestos' });
  await expect(page.getByRole('heading', { name: 'Cambios propuestos' })).toBeFocused();
  const salary = preview.getByRole('row', { name: /NOMINA DE EMPRESA DEMO SL/ });
  await expect(salary).toContainText('Sin categoría');
  await expect(salary).toContainText('Ingresos › Nómina');
  await expect(preview.getByRole('row', { name: /ADEUDO RECIBO LUZ DEMO/ })).toContainText(
    'Suministros › Luz',
  );

  // Cancelar no cambia nada.
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(preview).toHaveCount(0);
  await expect(apply).toBeFocused();
  await expect(rules.getByRole('row', { name: /NOMINA/ }).locator('.count')).toHaveText('0');

  await apply.click();
  await page.getByRole('button', { name: /^Aplicar cambios/ }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Movimientos categorizados:' }),
  ).toBeVisible();
  await expect(preview).toHaveCount(0);
  await expect(rules.getByRole('row', { name: /NOMINA/ }).locator('.count')).toHaveText('1');

  // Ya no queda nada por cambiar.
  await apply.click();
  await expect(
    page.getByText('Ningún movimiento cambiaría de categoría con las reglas actuales.'),
  ).toBeVisible();

  await openNav(page);
  await page.getByRole('link', { name: 'Movimientos' }).click();
  await expect(
    page.getByRole('table').getByRole('row', { name: /NOMINA DE EMPRESA DEMO SL/ }),
  ).toContainText('Nómina');
});

test('editar y eliminar una regla en la tabla', async ({ page }) => {
  await page.goto('/demo');
  await expect(page.getByText('septiembre de 2026')).toBeVisible();
  await openRules(page);
  const rules = page.getByRole('table', { name: 'Tus reglas' });
  await expect(rules.getByRole('row')).toHaveCount(4);

  await page.getByRole('button', { name: 'Editar: Contiene «GASOLINERA»' }).click();
  const pattern = page.getByRole('textbox', { name: 'Texto: Contiene «GASOLINERA»' });
  await expect(pattern).toBeFocused();
  await page
    .getByRole('combobox', { name: 'Condición: Contiene «GASOLINERA»' })
    .selectOption({ label: 'Es exactamente' });
  await pattern.fill('Gasolinera Demo');
  await pattern.press('Enter');
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Regla guardada: Es exactamente «GASOLINERA DEMO»' }),
  ).toBeVisible();
  const edit = page.getByRole('button', { name: 'Editar: Es exactamente «GASOLINERA DEMO»' });
  await expect(edit).toBeFocused();

  // Escape cancela la edición sin guardar.
  await edit.click();
  await page.getByRole('textbox', { name: /^Texto: / }).fill('Otra cosa');
  await page.getByRole('textbox', { name: /^Texto: / }).press('Escape');
  await expect(rules.getByRole('row', { name: /GASOLINERA DEMO/ })).toBeVisible();

  await page.getByRole('button', { name: 'Eliminar: Es exactamente «GASOLINERA DEMO»' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('¿Eliminar la regla Es exactamente «GASOLINERA DEMO»?');
  await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Eliminar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Regla eliminada' })).toBeVisible();
  await expect(rules.getByRole('row')).toHaveCount(3);
});
