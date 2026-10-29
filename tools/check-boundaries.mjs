// Verifica que ESLint rechaza los imports prohibidos entre capas (T0.2).
// Cada caso se lintea como si estuviera en la ruta indicada; ningún fichero
// se escribe en src/.
import { ESLint } from 'eslint';

const cases = [
  // [ruta virtual, código, debe fallar]
  ['src/app/domain/x.ts', "import { inject } from '@angular/core';", true],
  ['src/app/domain/x.ts', "import { of } from 'rxjs';", true],
  ['src/app/domain/x.ts', "import { a } from '@services/db/db-service';", true],
  ['src/app/domain/x.ts', "import { a } from '../services/db/db-service';", true],
  ['src/app/domain/x.ts', "import { a } from '../pages/dashboard/dashboard-page';", true],
  ['src/app/domain/x.ts', "import { a } from '@ui/texts';", true],
  ['src/app/domain/x.ts', "import { a } from './ports/repo';", false],
  ['src/app/worker/db.worker.ts', "import { a } from '@services/db/db-service';", true],
  ['src/app/worker/db.worker.ts', "import { Injectable } from '@angular/core';", true],
  ['src/app/worker/db.worker.ts', "import { a } from '@domain/money';", false],
  [
    'src/app/worker/db.worker.ts',
    "import sqlite3InitModule from '@sqlite.org/sqlite-wasm';",
    false,
  ],
  ['src/app/services/x.ts', "import { a } from '@pages/dashboard/x';", true],
  ['src/app/services/x.ts', "import { a } from '@ui/texts';", true],
  ['src/app/services/x.ts', "import { a } from '@worker/db/db-handlers';", true],
  ['src/app/services/x/y.ts', "import { a } from '../../worker/db/sql-db';", true],
  ['src/app/services/x.ts', "import { a } from '@worker/rpc/protocol';", false],
  ['src/app/services/x.ts', "import { a } from '@worker/db/db-api';", false],
  ['src/app/services/x/y.ts', "import { a } from '../../worker/import/import-api';", false],
  ['src/app/ui/x.ts', "import { a } from '@services/db/db-service';", true],
  ['src/app/ui/x.ts', "import { a } from '@pages/dashboard/x';", true],
  ['src/app/ui/x.ts', "import { a } from '@domain/money/format-cents';", false],
  ['src/app/pages/dashboard/x.ts', "import { a } from '@worker/rpc/protocol';", true],
  ['src/app/pages/dashboard/x.ts', "import { a } from '../../worker/rpc/protocol';", true],
  ['src/app/pages/dashboard/x.ts', "import { a } from '@pages/yearly/x';", true],
  ['src/app/pages/dashboard/x.ts', "import * as XLSX from 'xlsx';", true],
  ['src/app/pages/dashboard/x.ts', "import { a } from '@services/db/db-service';", false],
  ['src/app/pages/dashboard/x.ts', "import { a } from '@ui/texts';", false],
];

const eslint = new ESLint();
let failures = 0;

for (const [filePath, code, shouldFail] of cases) {
  const [result] = await eslint.lintText(`${code}\n`, { filePath });
  const violated = result.messages.some((m) => m.ruleId === 'no-restricted-imports');
  if (violated !== shouldFail) {
    failures++;
    console.error(`✗ ${filePath}: "${code}" → se esperaba ${shouldFail ? 'error' : 'OK'}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} caso(s) de frontera incorrectos.`);
  process.exit(1);
}
console.error(`✓ ${cases.length} casos de frontera entre capas verificados.`);
