import sqlite3InitModule, { type Database, type Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { conceptRuleErrorCode } from '@domain/rules/concept-rule';
import { migrate } from '../migrate';
import { MIGRATIONS } from '../migrations';
import { wrapDatabase, type SqlDb } from '../sql-db';
import {
  applyConceptRules,
  conceptRuleIdParam,
  conceptRuleUpdateParam,
  createConceptRule,
  deleteConceptRule,
  listConceptRules,
  newConceptRuleParam,
  previewConceptRules,
  rewriteDescriptions,
  textsParam,
  updateConceptRule,
} from './concept-rules';
import { updateTransaction } from './transactions';

describe('consultas de reglas de concepto', () => {
  let sqlite3: Sqlite3Static;
  let raw: Database;
  let db: SqlDb;

  const errorCode = (fn: () => unknown) => {
    try {
      fn();
    } catch (error) {
      return conceptRuleErrorCode(error);
    }
    return undefined;
  };
  /** Concepto visible y su origen, por id. */
  const state = () =>
    Object.fromEntries(
      db
        .rows('SELECT id, description, description_source FROM transactions')
        .map((row) => [row['id'], [row['description'], row['description_source']]]),
    );
  const tx = (id: number, original: string, date = '2026-01-05') =>
    db.run(
      `INSERT INTO transactions (id, account_id, op_date, amount_cents, description,
         original_description, origin, import_batch_id, dedupe_hash)
       VALUES (?, 1, ?, -1000, ?, ?, 'importado', 1, ?)`,
      [id, date, original, original, `hash-${id}`.padEnd(16, '0')],
    );
  const add = (operator: string, pattern: string, replacement: string, scope = 'coincidencia') =>
    createConceptRule(db, newConceptRuleParam({ operator, pattern, scope, replacement }));

  beforeAll(async () => {
    sqlite3 = await sqlite3InitModule();
  });

  beforeEach(() => {
    raw = new sqlite3.oo1.DB(':memory:');
    db = wrapDatabase(raw);
    db.run('PRAGMA foreign_keys = ON');
    migrate(db, MIGRATIONS);
    db.run(`INSERT INTO accounts (id, name, kind) VALUES (1, 'Cuenta', 'corriente')`);
    db.run(
      `INSERT INTO import_batches (id, account_id, bank_profile, file_name, file_sha256,
         date_from, date_to, rows_total, rows_new, rows_duplicate, rows_error)
       VALUES (1, 1, 'demo', 'enero.xls', ?, '2026-01-01', '2026-01-31', 3, 3, 0, 0)`,
      ['a'.repeat(64)],
    );
    tx(1, 'TRANSFERENCIA ES12 3456 ALQUILER', '2026-01-03');
    tx(2, 'AMAZON-192903812-022', '2026-01-04');
    tx(3, 'AMAZON-55-1', '2026-01-05');
    db.run(
      `INSERT INTO transactions (id, account_id, op_date, amount_cents, description, origin)
       VALUES (4, 1, '2026-01-06', -100, 'AMAZON A MANO', 'manual')`,
    );
  });

  afterEach(() => raw.close());

  it('da de alta reglas al final, normaliza el texto y cuenta los conceptos que cambian', () => {
    add('contiene', ' es12 3456 ', '');
    add('contiene', 'amazon-', '  Amazon compra ', 'concepto');
    add('exacto', 'nada', 'Otra', 'coincidencia');

    expect(listConceptRules(db)).toEqual([
      expect.objectContaining({ pattern: 'ES12 3456', replacement: '', transactionCount: 1 }),
      expect.objectContaining({
        pattern: 'AMAZON-',
        scope: 'concepto',
        replacement: 'Amazon compra',
        transactionCount: 2,
      }),
      // «Es exactamente» siempre sustituye el concepto entero.
      expect.objectContaining({ operator: 'exacto', scope: 'concepto', transactionCount: 0 }),
    ]);
  });

  it('rechaza reglas no válidas, repetidas o inexistentes', () => {
    add('contiene', 'AMAZON', '');
    expect(errorCode(() => add('contiene', 'amazon', 'X'))).toBe('regla-repetida');
    expect(errorCode(() => add('regex', '.*', 'X'))).toBe('regex-vacia');
    expect(errorCode(() => add('exacto', 'BIZUM', ''))).toBe('sustitucion-vacia');
    expect(
      errorCode(() =>
        updateConceptRule(db, {
          id: 99,
          operator: 'contiene',
          pattern: 'X',
          scope: 'coincidencia',
          replacement: '',
        }),
      ),
    ).toBe('regla-inexistente');
    expect(errorCode(() => deleteConceptRule(db, 99))).toBe('regla-inexistente');
  });

  it('enseña los cambios sin tocar nada y los aplica al confirmar', () => {
    add('contiene', 'ES12 3456', '');
    add('regex', String.raw`^AMAZON-\d+-\d+$`, 'Amazon compra');
    const before = state();

    expect(previewConceptRules(db)).toEqual([
      expect.objectContaining({ transactionId: 3, newDescription: 'Amazon compra' }),
      expect.objectContaining({ transactionId: 2, newDescription: 'Amazon compra' }),
      expect.objectContaining({
        transactionId: 1,
        currentDescription: 'TRANSFERENCIA ES12 3456 ALQUILER',
        newDescription: 'TRANSFERENCIA ALQUILER',
      }),
    ]);
    expect(state()).toEqual(before);

    expect(applyConceptRules(db)).toBe(3);
    expect(state()).toMatchObject({
      1: ['TRANSFERENCIA ALQUILER', 'regla'],
      2: ['Amazon compra', 'regla'],
      3: ['Amazon compra', 'regla'],
    });
    // Sin concepto del banco no hay nada que reescribir.
    expect(state()[4]?.[0]).toBe('AMAZON A MANO');
    expect(previewConceptRules(db)).toEqual([]);
  });

  it('no pisa lo escrito a mano y devuelve el concepto del banco si ya ninguna regla lo cambia', () => {
    const id = add('contiene', 'AMAZON-', 'Amazon', 'concepto');
    applyConceptRules(db);
    updateTransaction(db, {
      id: 2,
      description: 'Regalo',
      bookedDate: '2026-01-04',
      categoryId: null,
      note: null,
    });

    deleteConceptRule(db, id);
    expect(applyConceptRules(db)).toBe(1);
    expect(state()).toMatchObject({
      2: ['Regalo', 'manual'],
      3: ['AMAZON-55-1', 'banco'],
    });
  });

  it('cambiar o eliminar una regla no toca los conceptos hasta aplicarlas', () => {
    const id = add('contiene', 'AMAZON-', 'Amazon', 'concepto');
    applyConceptRules(db);
    updateConceptRule(
      db,
      conceptRuleUpdateParam({
        id,
        operator: 'contiene',
        pattern: 'AMAZON-',
        scope: 'concepto',
        replacement: 'Compra Amazon',
      }),
    );
    expect(state()[2]).toEqual(['Amazon', 'regla']);
    expect(previewConceptRules(db).map((change) => change.newDescription)).toEqual([
      'Compra Amazon',
      'Compra Amazon',
    ]);
  });

  it('propone el concepto de cada texto de un extracto, en orden', () => {
    add('contiene', 'AMAZON-', 'Amazon', 'concepto');
    expect(rewriteDescriptions(db, ['AMAZON-1-2', 'BIZUM'])).toEqual(['Amazon', 'BIZUM']);
  });

  it('comprueba la forma de los parámetros', () => {
    expect(() => newConceptRuleParam(null)).toThrow(RangeError);
    expect(() =>
      newConceptRuleParam({
        operator: 'empieza',
        pattern: 'X',
        scope: 'coincidencia',
        replacement: '',
      }),
    ).toThrow(RangeError);
    expect(() =>
      newConceptRuleParam({ operator: 'contiene', pattern: 'X', scope: 'otro', replacement: '' }),
    ).toThrow(RangeError);
    expect(() =>
      newConceptRuleParam({ operator: 'contiene', pattern: 'X', scope: 'concepto' }),
    ).toThrow(RangeError);
    expect(() => conceptRuleIdParam({ id: 0 })).toThrow(RangeError);
    expect(() => textsParam({ texts: [1] })).toThrow(RangeError);
    expect(textsParam({ texts: ['A'] })).toEqual(['A']);
  });
});
