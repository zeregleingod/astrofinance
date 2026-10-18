import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';

async function openYearly(page: Page) {
  await page.goto('/demo');
  await expect(page.getByText('septiembre de 2026')).toBeVisible();
  const openMenu = page.getByRole('button', { name: 'Abrir menú' });
  if (await openMenu.isVisible()) await openMenu.click();
  await page.getByRole('link', { name: 'Resumen anual' }).click();
}

test('el resumen anual muestra la hoja del año y enlaza cada mes a su resumen', async ({
  page,
}) => {
  await openYearly(page);

  await expect(page).toHaveTitle('Resumen anual · AstroFinance');
  const sheet = page.getByRole('region', { name: 'Tabla del resumen anual' });
  const table = sheet.getByRole('table');
  await expect(table).toBeVisible();
  await expect(table.getByRole('rowheader', { name: 'Hipoteca y vivienda' })).toBeVisible();
  await expect(table.getByRole('rowheader', { name: 'Balance' })).toBeVisible();

  await table.getByRole('link', { name: 'agosto' }).click();
  await expect(page).toHaveURL(/\/\?mes=2026-08$/);
  await expect(page.getByText('agosto de 2026')).toBeVisible();
});

test('en una pantalla de 1080 px de alto la hoja del año se ve entera', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Solo aplica a escritorio');
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openYearly(page);
  const sheet = page.getByRole('region', { name: 'Tabla del resumen anual' });
  await expect(sheet.getByRole('rowheader', { name: 'Balance' })).toBeVisible();

  const box = await sheet.boundingBox();
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(1080);
});

test('los nombres de categoría y subcategoría se ven enteros y en una sola línea', async ({
  page,
}) => {
  await openYearly(page);
  const sheet = page.getByRole('region', { name: 'Tabla del resumen anual' });
  await expect(sheet.getByRole('rowheader', { name: 'Balance' })).toBeVisible();

  const names = await sheet.locator('tbody .group-name, tbody th.line-col').evaluateAll((els) =>
    els.map((el) => {
      // Solo el texto: el punto de color no está a la misma altura.
      const tops = [...el.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())
        .flatMap((node) => {
          const range = document.createRange();
          range.selectNodeContents(node);
          return [...range.getClientRects()].map((r) => Math.round(r.top));
        });
      const lines = new Set(tops);
      return {
        name: el.textContent?.trim(),
        cut: el.scrollWidth > el.clientWidth,
        lines: lines.size,
      };
    }),
  );
  expect(names.length).toBeGreaterThan(30);
  for (const name of names) {
    expect(name, name.name).toEqual({ name: name.name, cut: false, lines: 1 });
  }
});

test('las categorías se separan con una línea, como las subcategorías del resumen', async ({
  page,
}) => {
  await openYearly(page);
  const second = page.locator('main tbody').nth(1).locator('tr').first().locator('td').first();
  await expect(second).toBeVisible();
  const border = await second.evaluate((el) => {
    const style = getComputedStyle(el);
    return { width: style.borderTopWidth, style: style.borderTopStyle };
  });
  expect(border).toEqual({ width: '1px', style: 'solid' });
});

test('en pantallas estrechas solo se desplaza la tabla, no la página', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openYearly(page);
  const sheet = page.getByRole('region', { name: 'Tabla del resumen anual' });
  await expect(sheet.getByRole('table')).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  const scrollable = await sheet.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(scrollable).toBe(true);

  // La subcategoría sigue a la vista al desplazar la tabla.
  await sheet.evaluate((el) => el.scrollTo({ left: 600 }));
  const line = sheet.getByRole('rowheader', { name: 'Cuota hipoteca' });
  const [box, region] = await Promise.all([line.boundingBox(), sheet.boundingBox()]);
  expect(box && region && box.x - region.x).toBeLessThan(2);
});
