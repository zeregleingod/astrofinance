import sqlite3InitModule, { type Database, type Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { parseStatement } from '@domain/imports/bank-profiles';
import type { ImportBatchInput } from '@domain/imports/import-batch';
import { createDraft, draftToBatch, editDraft } from '@domain/imports/import-draft';
import { prepareImport } from '@domain/imports/imported-statement';
import { SABADELL_ROWS, sabadellSheet } from '../../../../testing/sabadell-sheet';
import { migrate } from '../migrate';
import { MIGRATIONS } from '../migrations';
import { categoryTemplateStatements } from '../seeds/category-template';
import { wrapDatabase, type SqlDb } from '../sql-db';
import {
  categoryOptions,
  commitImport,
  existingDedupeHashes,
  hashesParam,
  importBatchParam,
} from './imports';
import { listPeriods, monthTransactions } from './reports';

describe('consultas de importación', () => {
  let sqlite3: Sqlite3Static;
  let raw: Database;
  let db: SqlDb;

  const statement = prepareImport(parseStatement(sabadellSheet()), {
    name: 'enero.xls',
    sha256: 'c'.repeat(64),
  });
  const batch = (existing: readonly string[] = []): ImportBatchInput =>
    draftToBatch(statement, createDraft(statement, new Set(existing)));
  const count = (table: string) => Number(db.value(`SELECT count(*) FROM ${table}`));

  beforeAll(async () => {
    sqlite3 = await sqlite3InitModule();
  });

  beforeEach(() => {
    raw = new sqlite3.oo1.DB(':memory:');
    db = wrapDatabase(raw);
    db.run('PRAGMA foreign_keys = ON');
    migrate(db, MIGRATIONS);
    for (const { sql, bind } of categoryTemplateStatements()) db.run(sql, bind);
  });

  afterEach(() => raw.close());

  it('guarda el lote: cuenta nueva, lote y movimientos con su concepto original', () => {
    const result = commitImport(db, batch());

    expect(result).toEqual({
      inserted: SABADELL_ROWS.length,
      duplicates: 0,
      accountName: 'Banc Sabadell ·4321',
      periods: ['2026-01'],
    });
    expect(db.rows('SELECT * FROM accounts')).toMatchObject([
      {
        name: 'Banc Sabadell ·4321',
        institution: 'Banc Sabadell',
        kind: 'corriente',
        iban_last4: '4321',
        opening_balance_cents: 100000,
        opening_date: '2026-01-02',
      },
    ]);
    expect(db.rows('SELECT * FROM import_batches')).toMatchObject([
      {
        bank_profile: 'sabadell',
        file_name: 'enero.xls',
        file_sha256: 'c'.repeat(64),
        date_from: '2026-01-01',
        date_to: '2026-01-31',
        rows_total: 8,
        rows_new: 8,
        rows_duplicate: 0,
        rows_error: 0,
        status: 'confirmado',
      },
    ]);
    expect(db.rows(`SELECT * FROM transactions WHERE description LIKE 'PRESTAMOS%'`)).toMatchObject(
      [
        {
          op_date: '2026-01-30',
          value_date: '2026-01-31',
          period: '2026-01',
          amount_cents: -55746,
          balance_after_cents: 230403,
          description: 'PRESTAMOS ADEUDO CUOTA N.0000000001 31/01/26',
          original_description: 'PRESTAMOS ADEUDO CUOTA N.0000000001 31/01/26',
          note: null,
          category_id: null,
          category_source: 'ninguna',
          origin: 'importado',
        },
      ],
    );
    expect(listPeriods(db)).toEqual(['2026-01']);
    expect(monthTransactions(db, '2026-01')).toHaveLength(8);
  });

  it('guarda lo editado en la revisión sin perder el concepto del banco', () => {
    const category = categoryOptions(db).find((option) => option.label.endsWith('Nómina'));
    let draft = createDraft(statement, new Set());
    draft = editDraft(draft, 2, {
      description: 'Nómina de enero',
      amountText: '1.900,00',
      note: 'Con atrasos',
      categoryId: category?.id ?? null,
    });
    draft = editDraft(draft, 0, { included: false });

    expect(commitImport(db, draftToBatch(statement, draft)).inserted).toBe(7);
    expect(
      db.rows(`SELECT * FROM transactions WHERE original_description LIKE 'NOMINA%'`),
    ).toMatchObject([
      {
        description: 'Nómina de enero',
        original_description: 'NOMINA DE EMPRESA DEMO SL',
        amount_cents: 190000,
        note: 'Con atrasos',
        category_id: category?.id,
        category_source: 'manual',
      },
    ]);
  });

  it('reimportar el mismo fichero no añade nada', () => {
    commitImport(db, batch());
    const hashes = statement.movements.map((m) => m.dedupeHash);

    expect(existingDedupeHashes(db, hashes).sort()).toEqual([...hashes].sort());
    expect(existingDedupeHashes(db, ['0'.repeat(64)])).toEqual([]);
    expect(existingDedupeHashes(db, [])).toEqual([]);

    // Aunque la pantalla no supiera que ya estaban guardados, no se duplican.
    expect(commitImport(db, batch())).toEqual({
      inserted: 0,
      duplicates: 8,
      accountName: 'Banc Sabadell ·4321',
      periods: [],
    });
    expect(commitImport(db, batch(hashes))).toMatchObject({ inserted: 0, duplicates: 8 });
    expect(count('transactions')).toBe(8);
    expect(count('import_batches')).toBe(1);
    expect(count('accounts')).toBe(1);
  });

  it('un extracto solapado solo añade lo nuevo, en la misma cuenta', () => {
    const first = prepareImport(parseStatement(sabadellSheet(SABADELL_ROWS.slice(3))), {
      name: 'quincena.xls',
      sha256: 'd'.repeat(64),
    });
    commitImport(db, draftToBatch(first, createDraft(first, new Set())));

    expect(commitImport(db, batch())).toMatchObject({ inserted: 3, duplicates: 5 });
    expect(count('transactions')).toBe(8);
    expect(count('accounts')).toBe(1);
    expect(
      db.rows('SELECT rows_total, rows_new, rows_duplicate FROM import_batches ORDER BY id'),
    ).toEqual([
      { rows_total: 5, rows_new: 5, rows_duplicate: 0 },
      { rows_total: 8, rows_new: 3, rows_duplicate: 5 },
    ]);
  });

  it('es todo o nada: si un movimiento falla no queda ni la cuenta', () => {
    const good = batch();
    const broken = {
      ...good,
      rows: good.rows.map((row, i) => (i === 4 ? { ...row, categoryId: 999_999 } : row)),
    };

    expect(() => commitImport(db, broken)).toThrow(/FOREIGN KEY/i);
    expect(count('transactions')).toBe(0);
    expect(count('import_batches')).toBe(0);
    expect(count('accounts')).toBe(0);
  });

  it('el concepto original no se puede modificar después', () => {
    commitImport(db, batch());
    db.run(`UPDATE transactions SET description = 'Editado'`);
    expect(() => db.run(`UPDATE transactions SET original_description = 'Otro'`)).toThrow(
      /concepto original/,
    );
    expect(() => db.run('UPDATE transactions SET original_description = NULL')).toThrow(
      /concepto original/,
    );
  });

  it('el texto del banco se guarda como dato, no como SQL', () => {
    const evil = `'); DROP TABLE transactions; --`;
    const good = batch();
    const [first] = good.rows;
    commitImport(db, {
      ...good,
      fileName: evil,
      rows: first ? [{ ...first, description: evil, originalDescription: evil, note: evil }] : [],
    });

    expect(db.value('SELECT description FROM transactions')).toBe(evil);
    expect(db.value('SELECT file_name FROM import_batches')).toBe(evil);
  });

  it('lista las categorías asignables con su grupo', () => {
    const labels = categoryOptions(db).map((option) => option.label);
    expect(labels.slice(0, 3)).toEqual([
      'Ingresos › Nómina',
      'Ingresos › Ingresos extra',
      'Ahorro › Aportación a ahorro',
    ]);
    expect(new Set(categoryOptions(db).map((option) => option.id)).size).toBe(labels.length);
  });

  describe('validación de parámetros', () => {
    it('acepta un lote bien formado tal cual', () => {
      expect(importBatchParam(structuredClone(batch()))).toEqual(batch());
      expect(hashesParam({ hashes: ['a'.repeat(64)] })).toEqual(['a'.repeat(64)]);
    });

    it.each([
      ['no es un objeto', () => null],
      ['sin filas', (b: ImportBatchInput) => ({ ...b, rows: 'x' })],
      ['perfil vacío', (b: ImportBatchInput) => ({ ...b, profileId: ' ' })],
      ['IBAN completo', (b: ImportBatchInput) => ({ ...b, ibanLast4: 'ES0000000000' })],
      ['hash de fichero corto', (b: ImportBatchInput) => ({ ...b, fileSha256: 'abc' })],
      ['fecha imposible', (b: ImportBatchInput) => ({ ...b, dateFrom: '2026-02-30' })],
      ['saldo con decimales', (b: ImportBatchInput) => ({ ...b, openingBalanceCents: 1.5 })],
      ['recuento negativo', (b: ImportBatchInput) => ({ ...b, duplicateCount: -1 })],
      ['fila que no es objeto', (b: ImportBatchInput) => ({ ...b, rows: [7] })],
      ['importe decimal', (b: ImportBatchInput) => withRow(b, { amountCents: 12.5 })],
      ['importe cero', (b: ImportBatchInput) => withRow(b, { amountCents: 0 })],
      ['concepto vacío', (b: ImportBatchInput) => withRow(b, { description: '' })],
      ['concepto enorme', (b: ImportBatchInput) => withRow(b, { description: 'x'.repeat(501) })],
      ['fecha valor inválida', (b: ImportBatchInput) => withRow(b, { valueDate: 'ayer' })],
      ['categoría no numérica', (b: ImportBatchInput) => withRow(b, { categoryId: '3' })],
      ['huella inválida', (b: ImportBatchInput) => withRow(b, { dedupeHash: 'zz' })],
    ])('rechaza un lote con %s', (_name, alter) => {
      expect(() => importBatchParam(alter(batch()))).toThrow(RangeError);
    });

    it('rechaza huellas que no lo son', () => {
      expect(() => hashesParam({ hashes: ['corta'] })).toThrow(RangeError);
      expect(() => hashesParam({ hashes: 'x' })).toThrow(RangeError);
      expect(() => hashesParam(undefined)).toThrow(RangeError);
    });
  });
});

function withRow(batch: ImportBatchInput, change: Record<string, unknown>) {
  return { ...batch, rows: batch.rows.map((row, i) => (i === 0 ? { ...row, ...change } : row)) };
}
