import { expect, test } from './fixtures';

test('la app carga y muestra el título', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Resumen · AstroFinance');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('AstroFinance');
});

test('la barra lateral lista las secciones y marca la activa', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Navegación principal' });
  const openMenu = page.getByRole('button', { name: 'Abrir menú' });
  if (await openMenu.isVisible()) {
    await openMenu.click();
  }
  await expect(nav.getByRole('link', { name: 'Resumen' })).toHaveAttribute('aria-current', 'page');
});

test('la CSP no permite unsafe-inline ni unsafe-eval en scripts', async ({ page }) => {
  const response = await page.goto('/');
  const header = response?.headers()['content-security-policy'] ?? '';
  const meta =
    (await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')) ??
    '';

  for (const policy of [header, meta]) {
    expect(policy).not.toBe('');
    const directives = new Map(
      policy
        .split(';')
        .map((d) => d.trim().split(/\s+/))
        .filter((parts) => parts[0])
        .map(([name, ...values]) => [name, values] as const),
    );
    const scriptSrc = directives.get('script-src') ?? directives.get('default-src') ?? [];
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
    expect(directives.get('object-src')).toEqual(["'none'"]);
    expect(directives.get('default-src')).toEqual(["'self'"]);
  }
});

test('el interruptor de modo oscuro cambia el tema en caliente y se recuerda', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const openMenu = page.getByRole('button', { name: 'Abrir menú' });
  if (await openMenu.isVisible()) {
    await openMenu.click();
  }
  const toggle = page.getByRole('switch', { name: 'Modo oscuro' });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');

  await toggle.click();

  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('html')).toHaveClass(/theme-dark/);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/theme-dark/);
});
