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
  test.skip(isMobile, 'Solo aplica a escritorio');
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/demo');
  await expect(page.getByText('septiembre de 2026')).toBeVisible();
});

async function open(page: Page, name: string) {
  await page.getByRole('link', { name, exact: true }).click();
  await expect(page).toHaveTitle(`${name} · AstroFinance`);
}

test('todas las páginas tienen la cabecera del mismo tamaño y en el mismo sitio', async ({
  page,
}) => {
  const boxes = [];
  for (const name of pages) {
    await open(page, name);
    const box = await page.locator('main .page-header').boundingBox();
    const title = await page.locator('main h2').boundingBox();
    boxes.push({ name, height: box?.height, top: box?.y, titleTop: title?.y });
  }
  const [first] = boxes;
  for (const box of boxes) {
    expect(box, box.name).toEqual({ ...first, name: box.name });
  }
});

test('las tablas y paneles de configuración son tan anchos como la del resumen anual', async ({
  page,
}) => {
  // La hoja anual ocupa todo el ancho de la página: el ancho común es el suyo.
  await open(page, 'Resumen anual');
  const yearly = await page.locator('main table').boundingBox();
  const width = await page
    .locator('main')
    .evaluate((main) => main.clientWidth - 2 * parseFloat(getComputedStyle(main).paddingLeft));
  expect(Math.round(yearly?.width ?? 0)).toBe(Math.round(width));

  for (const name of ['Categorías', 'Reglas de categoría']) {
    await open(page, name);
    const table = page.locator('main table').first();
    await expect(table).toBeVisible();
    const box = await table.boundingBox();
    expect(Math.round(box?.width ?? 0), name).toBe(Math.round(width));
  }

  await open(page, 'Copia de seguridad');
  const panels = page.locator('main section.panel');
  await expect(panels).toHaveCount(2);
  for (const panel of await panels.all()) {
    const box = await panel.boundingBox();
    expect(Math.round(box?.width ?? 0)).toBe(Math.round(width));
  }
});

test('todas las tablas resaltan la fila bajo el cursor, como el resumen anual', async ({
  page,
}) => {
  const tables = [
    // En el Resumen, cada movimiento de las tarjetas.
    { name: 'Resumen', cell: 'main app-movement-list li' },
    { name: 'Resumen anual', cell: 'main tbody tr td' },
    { name: 'Movimientos', cell: 'main tbody tr td' },
    { name: 'Categorías', cell: 'main tbody tr td' },
    { name: 'Reglas de categoría', cell: 'main tbody tr td' },
  ];
  const colors = new Set<string>();
  for (const { name, cell } of tables) {
    await open(page, name);
    const target = page.locator(cell).nth(1);
    await expect(target).toBeVisible();
    await page.mouse.move(0, 0);
    const before = await target.evaluate((el) => getComputedStyle(el).backgroundColor);
    await target.hover();
    const after = await target.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(after, name).not.toBe(before);
    colors.add(after);
  }
  expect(colors.size).toBe(1);
});

test('el resumen coloca las tarjetas por columnas, tres en cada una', async ({ page }) => {
  const groups = page.locator('main .group');
  await expect(groups.nth(6)).toBeVisible();
  const boxes = await groups.evaluateAll((els) =>
    els.slice(0, 7).map((el) => {
      const { left, top } = el.getBoundingClientRect();
      return { left: Math.round(left), top: Math.round(top) };
    }),
  );
  const [first, second, third, fourth, , , seventh] = boxes;
  // La primera columna: las tres primeras, una debajo de otra.
  expect(second?.left).toBe(first?.left);
  expect(third?.left).toBe(first?.left);
  expect(second?.top).toBeGreaterThan(first?.top ?? 0);
  expect(third?.top).toBeGreaterThan(second?.top ?? 0);
  // La cuarta y la séptima empiezan arriba de la segunda y la tercera columna.
  expect(fourth?.top).toBe(first?.top);
  expect(fourth?.left).toBeGreaterThan(first?.left ?? 0);
  expect(seventh?.top).toBe(first?.top);
  expect(seventh?.left).toBeGreaterThan(fourth?.left ?? 0);
});
