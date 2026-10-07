// Verifica que ESLint rechaza los imports prohibidos entre capas (T0.2).
// Cada caso se lintea como si estuviera en la ruta indicada; ningún fichero
// se escribe en src/.
import { ESLint } from 'eslint';

const cases = [
  // [ruta virtual, código, debe fallar]
  ['src/app/domain/x.ts', "import { inject } from '@angular/core';", true],
  ['src/app/domain/x.ts', "import { of } from 'rxjs';", true],
  ['src/app/domain/x.ts', "import { a } from '@data/repo';", true],
  ['src/app/domain/x.ts', "import { a } from '../data/repo';", true],
  ['src/app/domain/x.ts', "import { a } from '../features/dashboard/dashboard-page';", true],
  ['src/app/domain/x.ts', "import { a } from './ports/repo';", false],
  ['src/app/workers/db.worker.ts', "import { a } from '@data/repo';", true],
  ['src/app/workers/db.worker.ts', "import { Injectable } from '@angular/core';", true],
  ['src/app/workers/db.worker.ts', "import { a } from '@domain/money';", false],
  [
    'src/app/workers/db.worker.ts',
    "import sqlite3InitModule from '@sqlite.org/sqlite-wasm';",
    false,
  ],
  ['src/app/features/dashboard/x.ts', "import { a } from '@workers/protocol';", true],
  ['src/app/features/dashboard/x.ts', "import { a } from '../../workers/protocol';", true],
  ['src/app/features/dashboard/x.ts', "import { a } from '@features/rules/x';", true],
  ['src/app/features/dashboard/x.ts', "import * as XLSX from 'xlsx';", true],
  ['src/app/features/dashboard/x.ts', "import { a } from '@data/db';", false],
  ['src/app/shared/x.ts', "import { a } from '@data/db';", true],
  ['src/app/data/x.ts', "import { a } from '@features/dashboard/x';", true],
  ['src/app/data/x.ts', "import { a } from '@workers/protocol';", false],
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
