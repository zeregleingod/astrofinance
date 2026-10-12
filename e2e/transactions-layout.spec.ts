import { expect, test } from './fixtures';

// En pantallas estrechas o bajas la tabla conserva un alto mínimo y es la página la que se desplaza.
test.skip(({ viewport }) => (viewport?.width ?? 0) < 1000, 'Solo en escritorio');

test('la tabla de movimientos llega al final de la ventana y se desplaza por dentro', async ({
  page,
}) => {
  await page.goto('/demo');
  await expect(page.getByText('septiembre de 2026')).toBeVisible();
  await page.getByRole('link', { name: 'Movimientos' }).click();
  const rows = page.getByRole('region', { name: 'Tabla de movimientos' });
  await expect(rows.locator('tbody tr').first()).toBeVisible();

  // La página no se desplaza: lo hace la tabla, por dentro.
  const overflowing = await page.evaluate(() =>
    ['html', 'body', 'mat-sidenav-container', 'mat-sidenav-content', 'main']
      .map((name) => ({ name, el: document.querySelector(name) }))
      .filter(({ el }) => el !== null && el.scrollHeight > el.clientHeight)
      .map(({ name }) => name),
  );
  expect(overflowing).toEqual([]);

  const box = await rows.evaluate((el) => ({
    bottom: el.getBoundingClientRect().bottom,
    window: window.innerHeight,
    scrollable: el.scrollHeight - el.clientHeight,
    // Sin estilos que la escondan, la barra de la tabla es la que el navegador pone en cualquier caja.
    scrollbar:
      getComputedStyle(el).scrollbarWidth === getComputedStyle(document.body).scrollbarWidth,
  }));
  // Queda solo el margen inferior de la página.
  expect(box.window - box.bottom).toBeGreaterThanOrEqual(0);
  expect(box.window - box.bottom).toBeLessThanOrEqual(32);
  expect(box.scrollable).toBeGreaterThan(0);
  // La barra vertical de la tabla está a la vista.
  expect(box.scrollbar).toBe(true);

  // Al desplazar las filas la cabecera sigue a la vista.
  await rows.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(rows.locator('tbody tr').last()).toBeInViewport();
  await expect(rows.getByRole('columnheader', { name: 'Fecha', exact: true })).toBeInViewport();
});

test('los botones de los filtros siguen al último filtro, en su misma fila', async ({ page }) => {
  await page.goto('/demo');
  await expect(page.getByText('septiembre de 2026')).toBeVisible();
  await page.getByRole('link', { name: 'Movimientos' }).click();
  const filters = page.getByRole('form', { name: 'Filtros' });

  const last = await filters.locator('mat-form-field').last().boundingBox();
  const apply = await filters.getByRole('button', { name: 'Filtrar' }).boundingBox();
  const clear = await filters.getByRole('button', { name: 'Limpiar filtros' }).boundingBox();
  if (!last || !apply || !clear) throw new Error('Sin filtros a la vista');

  const middle = (box: { y: number; height: number }) => box.y + box.height / 2;
  expect(Math.abs(middle(clear) - middle(last))).toBeLessThan(8);
  expect(Math.abs(middle(apply) - middle(last))).toBeLessThan(8);
  expect(clear.x).toBeGreaterThan(last.x + last.width);
  expect(clear.x - (last.x + last.width)).toBeLessThan(24);
});
