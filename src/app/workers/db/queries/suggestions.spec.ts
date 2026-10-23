import sqlite3InitModule, { type Database, type Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { migrate } from '../migrate';
import { MIGRATIONS } from '../migrations';
import { categoryTemplateStatements } from '../seeds/category-template';
import { wrapDatabase, type SqlDb } from '../sql-db';
import { categoryOptions } from './imports';
import { createRule } from './rules';
import { suggestCategoriesFor, suggestionRequestParam } from './suggestions';

describe('sugerencias de categoría', () => {
  let sqlite3: Sqlite3Static;
  let raw: Database;
  let db: SqlDb;
  let superId: number;
  let luzId: number;

  const idOf = (suffix: string) => {
    const found = categoryOptions(db).find((option) => option.label.endsWith(suffix));
    if (!found) throw new Error(`Sin categoría ${suffix}`);
    return found.id;
  };
  const classified = (description: string, categoryId: number, original: string | null = null) =>
    db.run(
      `INSERT INTO transactions (account_id, op_date, amount_cents, description,
         original_description, category_id, category_source, origin)
       VALUES (1, '2026-01-10', -2500, ?, ?, ?, 'manual', 'manual')`,
      [description, original, categoryId],
    );
  const request = (...texts: string[]) => ({
    institution: 'Banc Sabadell',
    ibanLast4: '4321',
    movements: texts.map((text) => ({ text, amountCents: -1500 })),
  });

  beforeAll(async () => {
    sqlite3 = await sqlite3InitModule();
  });

  beforeEach(() => {
    raw = new sqlite3.oo1.DB(':memory:');
    db = wrapDatabase(raw);
    db.run('PRAGMA foreign_keys = ON');
    migrate(db, MIGRATIONS);
    for (const { sql, bind } of categoryTemplateStatements()) db.run(sql, bind);
    db.run(
      `INSERT INTO accounts (id, name, institution, kind, iban_last4)
       VALUES (1, 'Sabadell', 'Banc Sabadell', 'corriente', '4321')`,
    );
    superId = categoryOptions(db)[0]?.id ?? 0;
    luzId = categoryOptions(db)[1]?.id ?? 0;
  });

  afterEach(() => raw.close());

  it('propone por las reglas y, si ninguna encaja, por el historial', () => {
    classified('Compra semanal', superId, 'COMPRA TARJ. 4000XXXXXXXX0001 MERCADONA VALENCIA');
    const ruleId = createRule(db, { operator: 'contiene', pattern: 'luz', categoryId: luzId });

    expect(
      suggestCategoriesFor(
        db,
        request(
          'ADEUDO RECIBO LUZ DEMO',
          'COMPRA TARJ. 5402XXXXXXXX9999 MERCADONA ALZIRA',
          'FARMACIA LOPEZ',
        ),
      ),
    ).toEqual([
      { source: 'regla', categoryId: luzId, ruleId },
      { source: 'sugerencia', categoryId: superId },
      null,
    ]);
  });

  it('aprende del concepto del banco, no del que ha escrito el usuario', () => {
    classified('MERCADONA', superId, 'BAZAR CHINO CENTRO');

    expect(suggestCategoriesFor(db, request('BAZAR CHINO CENTRO', 'MERCADONA'))).toEqual([
      { source: 'sugerencia', categoryId: superId },
      null,
    ]);
  });

  it('no propone categorías archivadas', () => {
    classified('Bazar', superId, 'BAZAR CHINO CENTRO');
    db.run('UPDATE categories SET archived = 1 WHERE id = ?', [superId]);

    expect(suggestCategoriesFor(db, request('BAZAR CHINO CENTRO'))).toEqual([null]);
  });

  it('una regla de otra cuenta no se aplica', () => {
    createRule(db, { operator: 'contiene', pattern: 'luz', categoryId: luzId });
    db.run('INSERT INTO accounts (id, name, kind) VALUES (2, ?, ?)', ['Otra', 'corriente']);
    db.run('UPDATE rules SET account_id = 2');

    expect(suggestCategoriesFor(db, request('ADEUDO RECIBO LUZ DEMO'))).toEqual([null]);
    db.run('UPDATE rules SET account_id = 1');
    expect(suggestCategoriesFor(db, request('ADEUDO RECIBO LUZ DEMO'))[0]).toMatchObject({
      source: 'regla',
    });
  });

  it('sin historial ni reglas no propone nada', () => {
    expect(idOf('Nómina')).toBeGreaterThan(0);
    expect(suggestCategoriesFor(db, request('MERCADONA'))).toEqual([null]);
  });

  describe('validación de parámetros', () => {
    it('acepta una petición bien formada tal cual', () => {
      const valid = request('MERCADONA');
      expect(suggestionRequestParam(structuredClone(valid))).toEqual(valid);
    });

    it.each([
      ['no es un objeto', null],
      ['sin movimientos', { institution: 'Banco', ibanLast4: null, movements: 'x' }],
      ['sin entidad', { institution: '', ibanLast4: null, movements: [] }],
      ['IBAN completo', { institution: 'Banco', ibanLast4: 'ES00', movements: [] }],
      [
        'importe decimal',
        { institution: 'Banco', ibanLast4: null, movements: [{ text: 'A', amountCents: 1.5 }] },
      ],
      [
        'concepto vacío',
        { institution: 'Banco', ibanLast4: null, movements: [{ text: ' ', amountCents: 1 }] },
      ],
    ])('rechaza una petición con %s', (_name, params) => {
      expect(() => suggestionRequestParam(params)).toThrow(RangeError);
    });
  });
});
