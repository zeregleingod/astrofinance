// @ts-check
import eslint from '@eslint/js';
import angular from 'angular-eslint';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

/**
 * Fronteras entre capas (ver README de cada carpeta en src/app y docs/adr/0001).
 * Cada capa prohíbe tanto el alias (`@data/...`) como la ruta relativa (`../data/...`).
 */
const layer = (name) => ({
  group: [`@${name}/*`, `**/${name}`, `**/${name}/**`],
  message: `Import prohibido: esta capa no puede depender de "${name}".`,
});
const pkg = (group, why) => ({ group, message: why });

const ANGULAR = pkg(['@angular/*'], 'Esta capa no puede depender de Angular.');
const RXJS = pkg(['rxjs', 'rxjs/*'], 'Esta capa no puede depender de RxJS.');
const SQLITE = pkg(['@sqlite.org/*'], 'SQLite solo se usa dentro de workers.');
const XLSX = pkg(['xlsx', 'xlsx/*'], 'SheetJS solo se usa dentro de workers.');

/** @param {string[]} files @param {object[]} patterns */
const boundary = (files, patterns) => ({
  files,
  ignores: ['**/*.spec.ts'],
  rules: { 'no-restricted-imports': ['error', { patterns }] },
});

export default defineConfig([
  globalIgnores([
    'dist/',
    'coverage/',
    'out-tsc/',
    '.angular/',
    'node_modules/',
    'vendor/',
    'playwright-report/',
    'test-results/',
  ]),
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.strict,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['error', { allow: ['error'] }],
      eqeqeq: ['error', 'always'],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'MemberExpression[property.name=/^(innerHTML|outerHTML)$/]',
          message: 'No uses innerHTML/outerHTML: riesgo de XSS con datos del usuario.',
        },
        {
          selector: 'CallExpression[callee.property.name=/^bypassSecurityTrust/]',
          message: 'No desactives el saneado de Angular.',
        },
        {
          selector: 'CallExpression[callee.name="eval"], NewExpression[callee.name="Function"]',
          message: 'eval/new Function están prohibidos (CSP).',
        },
      ],
    },
  },
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {
      '@angular-eslint/template/no-inline-styles': 'error',
    },
  },
  {
    files: ['**/*.{js,mjs}'],
    extends: [eslint.configs.recommended],
    languageOptions: { globals: { process: 'readonly', console: 'readonly', URL: 'readonly' } },
  },

  // --- Fronteras entre capas ---
  boundary(
    ['src/app/domain/**/*.ts'],
    [
      ANGULAR,
      RXJS,
      SQLITE,
      XLSX,
      layer('core'),
      layer('data'),
      layer('features'),
      layer('shared'),
      layer('workers'),
    ],
  ),
  boundary(
    ['src/app/workers/**/*.ts'],
    [ANGULAR, RXJS, layer('core'), layer('data'), layer('features'), layer('shared')],
  ),
  boundary(['src/app/data/**/*.ts'], [XLSX, layer('features'), layer('shared')]),
  boundary(['src/app/core/**/*.ts'], [SQLITE, XLSX, layer('features'), layer('workers')]),
  boundary(
    ['src/app/shared/**/*.ts'],
    [SQLITE, XLSX, layer('data'), layer('features'), layer('workers')],
  ),
  boundary(
    ['src/app/features/**/*.ts'],
    [
      SQLITE,
      XLSX,
      layer('workers'),
      pkg(['@features/*'], 'Una feature no importa otra feature; extrae lo común a shared/.'),
    ],
  ),

  prettier,
]);
