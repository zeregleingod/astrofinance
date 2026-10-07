import { expect, test } from './fixtures';

test('la app carga y muestra el título', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('AstroFinance');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('AstroFinance');
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
