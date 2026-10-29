import sqlite3InitModule, { type Database, type Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { ruleErrorCode } from '@domain/rules/rule';
import { migrate } from '../migrate';
import { MIGRATIONS } from '../migrations';
import { wrapDatabase, type SqlDb } from '../sql-db';
import {
  applyRules,
  createRule,
  deleteRule,
  listRules,
  newRuleParam,
  previewRules,
  ruleIdParam,
  ruleUpdateParam,
  updateRule,
} from './rules';

describe('consultas de reglas', () => {
  let sqlite3: Sqlite3Static;
  let raw: Database;
  let db: SqlDb;

  const COMIDA = 2;
  const LUZ = 3;
  const NOMINA = 5;

  const errorCode = (fn: () => unknown) => {
    try {
      fn();
    } catch (error) {
      return ruleErrorCode(error);
    }
    return undefined;
  };
  /** Categoría, origen de la categoría y regla de cada movimiento, por su concepto visible. */
  const state = () =>
    Object.fromEntries(
      db
        .rows('SELECT description, category_id, category_source, rule_id FROM transactions')
        .map((row) => [
          row['description'],
          [row['category_id'], row['category_source'], row['rule_id']],
        ]),
    );
  const tx = (description: string, amount: number, categoryId: number | null, source: string) =>
    db.run(
      `INSERT INTO transactions (account_id, op_date, amount_cents, description,
         original_description, category_id, category_source, origin, import_batch_id, dedupe_hash)
       VALUES (1, '2026-01-05', ?, ?, ?, ?, ?, 'importado', 1, ?)`,
      [amount, description, description, categoryId, source, `hash-${description}`.padEnd(16, '0')],
    );

  beforeAll(async () => {
    sqlite3 = await sqlite3InitModule();
  });

  beforeEach(() => {
    raw = new sqlite3.oo1.DB(':memory:');
    db = wrapDatabase(raw);
    db.run('PRAGMA foreign_keys = ON');
    migrate(db, MIGRATIONS);
    db.run(`INSERT INTO categories (id, name) VALUES (1, 'Variables'), (4, 'Ingresos')`);
    db.run(
      `INSERT INTO categories (id, parent_id, name, kind) VALUES
         (${COMIDA}, 1, 'Comida', 'gasto'), (${LUZ}, 1, 'Luz', 'gasto'),
         (${NOMINA}, 4, 'Nómina', 'ingreso')`,
    );
    db.run(`INSERT INTO accounts (id, name, kind) VALUES (1, 'Cuenta', 'corriente')`);
    db.run(
      `INSERT INTO import_batches (id, account_id, bank_profile, file_name, file_sha256,
         date_from, date_to, rows_total, rows_new, rows_duplicate, rows_error)
       VALUES (1, 1, 'demo', 'enero.xls', ?, '2026-01-01', '2026-01-31', 4, 4, 0, 0)`,
      ['a'.repeat(64)],
    );
    tx('COMPRA SUPERMERCADO BARRIO', -2500, null, 'ninguna');
    tx('RECIBO LUZ DEMO', -6000, null, 'ninguna');
    tx('NOMINA EMPRESA DEMO', 185000, null, 'ninguna');
    tx('SUPERMERCADO EN VACACIONES', -4000, LUZ, 'manual');
  });

  afterEach(() => raw.close());

  describe('alta, cambio y borrado', () => {
    it('da de alta reglas al final y las lista en orden', () => {
      const first = createRule(db, {
        operator: 'contiene',
        pattern: '  supermercado ',
        categoryId: COMIDA,
      });
      createRule(db, { operator: 'regex', pattern: '^recibo (luz|gas)', categoryId: LUZ });

      expect(listRules(db)).toEqual([
        {
          id: first,
          operator: 'contiene',
          pattern: 'SUPERMERCADO',
          categoryId: COMIDA,
          categoryLabel: 'Variables › Comida',
          transactionCount: 0,
        },
        expect.objectContaining({ operator: 'regex', categoryLabel: 'Variables › Luz' }),
      ]);
    });

    it('rechaza textos que no valen, condiciones repetidas y categorías no asignables', () => {
      createRule(db, { operator: 'contiene', pattern: 'Supermercado', categoryId: COMIDA });
      const create = (operator: 'contiene' | 'regex', pattern: string, categoryId = COMIDA) =>
        errorCode(() => createRule(db, { operator, pattern, categoryId }));

      expect(create('contiene', '  ')).toBe('patron-vacio');
      expect(create('regex', '(')).toBe('regex-invalida');
      expect(create('regex', '(a+)+')).toBe('regex-peligrosa');
      expect(create('contiene', 'SUPERMERCADO')).toBe('regla-repetida');
      // Una categoría principal solo agrupa; una que no existe, tampoco.
      expect(create('contiene', 'luz', 1)).toBe('categoria-inexistente');
      expect(create('contiene', 'luz', 999)).toBe('categoria-inexistente');
      expect(listRules(db)).toHaveLength(1);
    });

    it('cambia una regla sin que su propia condición cuente como repetida', () => {
      const id = createRule(db, { operator: 'contiene', pattern: 'luz', categoryId: COMIDA });
      const other = createRule(db, { operator: 'contiene', pattern: 'gas', categoryId: LUZ });

      updateRule(db, { id, operator: 'exacto', pattern: 'luz', categoryId: LUZ });
      updateRule(db, { id, operator: 'exacto', pattern: 'luz', categoryId: LUZ });

      expect(listRules(db)[0]).toMatchObject({ operator: 'exacto', categoryId: LUZ });
      expect(
        errorCode(() =>
          updateRule(db, { id: other, operator: 'exacto', pattern: 'LUZ', categoryId: LUZ }),
        ),
      ).toBe('regla-repetida');
      expect(
        errorCode(() =>
          updateRule(db, { id: 999, operator: 'exacto', pattern: 'x', categoryId: LUZ }),
        ),
      ).toBe('regla-inexistente');
    });

    it('al eliminar una regla, lo que clasificó conserva su categoría', () => {
      const id = createRule(db, { operator: 'contiene', pattern: 'luz', categoryId: LUZ });
      applyRules(db);

      deleteRule(db, id);

      expect(listRules(db)).toEqual([]);
      expect(state()['RECIBO LUZ DEMO']).toEqual([LUZ, 'regla', null]);
      expect(errorCode(() => deleteRule(db, id))).toBe('regla-inexistente');
    });
  });

  describe('aplicar a los movimientos existentes', () => {
    it('la vista previa enseña los cambios sin tocar nada', () => {
      createRule(db, { operator: 'contiene', pattern: 'supermercado', categoryId: COMIDA });
      createRule(db, { operator: 'empieza', pattern: 'nomina', categoryId: NOMINA });
      const before = state();

      expect(previewRules(db)).toEqual([
        {
          transactionId: expect.any(Number),
          date: '2026-01-05',
          description: 'NOMINA EMPRESA DEMO',
          amountCents: 185000,
          currentCategory: null,
          newCategory: 'Ingresos › Nómina',
          ruleOperator: 'empieza',
          rulePattern: 'NOMINA',
        },
        expect.objectContaining({
          description: 'COMPRA SUPERMERCADO BARRIO',
          newCategory: 'Variables › Comida',
        }),
      ]);
      expect(state()).toEqual(before);
    });

    it('aplica los cambios, sin pisar lo clasificado a mano', () => {
      const market = createRule(db, {
        operator: 'contiene',
        pattern: 'supermercado',
        categoryId: COMIDA,
      });

      expect(applyRules(db)).toBe(1);

      expect(state()).toEqual({
        'COMPRA SUPERMERCADO BARRIO': [COMIDA, 'regla', market],
        'RECIBO LUZ DEMO': [null, 'ninguna', null],
        'NOMINA EMPRESA DEMO': [null, 'ninguna', null],
        'SUPERMERCADO EN VACACIONES': [LUZ, 'manual', null],
      });
      expect(listRules(db)[0]?.transactionCount).toBe(1);
      // Ya no queda nada por cambiar.
      expect(previewRules(db)).toEqual([]);
      expect(applyRules(db)).toBe(0);
    });

    it('cambia lo sugerido por el historial, pero nunca lo clasificado a mano', () => {
      tx('SUPERMERCADO DEL BARRIO 2', -1500, LUZ, 'sugerencia');
      const market = createRule(db, {
        operator: 'contiene',
        pattern: 'supermercado',
        categoryId: COMIDA,
      });

      expect(applyRules(db)).toBe(2);
      expect(state()).toMatchObject({
        'SUPERMERCADO DEL BARRIO 2': [COMIDA, 'regla', market],
        'SUPERMERCADO EN VACACIONES': [LUZ, 'manual', null],
      });
    });

    it('vuelve a clasificar lo que puso una regla si la regla cambia', () => {
      const id = createRule(db, {
        operator: 'contiene',
        pattern: 'supermercado',
        categoryId: COMIDA,
      });
      applyRules(db);
      updateRule(db, { id, operator: 'contiene', pattern: 'supermercado', categoryId: LUZ });

      expect(previewRules(db)).toEqual([
        expect.objectContaining({
          description: 'COMPRA SUPERMERCADO BARRIO',
          currentCategory: 'Variables › Comida',
          newCategory: 'Variables › Luz',
        }),
      ]);
      expect(applyRules(db)).toBe(1);
      expect(state()['COMPRA SUPERMERCADO BARRIO']).toEqual([LUZ, 'regla', id]);
    });

    it('compara con el concepto del banco, no con el que haya escrito el usuario', () => {
      db.run(`UPDATE transactions SET description = 'La compra' WHERE description LIKE 'COMPRA%'`);
      createRule(db, { operator: 'contiene', pattern: 'supermercado barrio', categoryId: COMIDA });

      expect(previewRules(db).map((change) => change.description)).toEqual(['La compra']);
    });

    it('sin reglas no hay nada que aplicar', () => {
      expect(previewRules(db)).toEqual([]);
      expect(applyRules(db)).toBe(0);
    });
  });

  it('valida los parámetros que llegan del hilo principal', () => {
    const valid = { id: 3, operator: 'exacto', pattern: 'luz', categoryId: 2 };
    expect(newRuleParam(valid)).toEqual({ operator: 'exacto', pattern: 'luz', categoryId: 2 });
    expect(ruleUpdateParam(valid)).toEqual(valid);
    expect(ruleIdParam({ id: 3 })).toBe(3);

    expect(() => newRuleParam(null)).toThrow(RangeError);
    expect(() => newRuleParam({ ...valid, operator: 'parecido' })).toThrow(RangeError);
    expect(() => newRuleParam({ ...valid, pattern: 7 })).toThrow(RangeError);
    expect(() => newRuleParam({ ...valid, categoryId: '2 OR 1=1' })).toThrow(RangeError);
    expect(() => ruleUpdateParam({ ...valid, id: 0 })).toThrow(RangeError);
    expect(() => ruleIdParam({})).toThrow(RangeError);
  });
});
