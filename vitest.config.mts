import { defineConfig } from 'vitest/config';

/**
 * Configuración complementaria de Vitest. El builder `@angular/build:unit-test`
 * la fusiona con la suya (compilación, entorno jsdom, TestBed).
 */
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'html', 'lcov'],
      thresholds: {
        // El dominio es TypeScript puro y se desarrolla con TDD estricto.
        'src/app/domain/**': {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90,
        },
      },
    },
  },
});
