import sqlite3InitModule, { type Database, type Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { categoryErrorCode } from '@domain/categories/category-tree';
import { migrate } from '../migrate';
import { MIGRATIONS } from '../migrations';
import { CATEGORY_TEMPLATE, categoryTemplateStatements } from '../seeds/category-template';
import { wrapDatabase, type SqlDb } from '../sql-db';
import {
  categoryIdParam,
  categoryTree,
  categoryUpdateParam,
  createCategory,
  deleteCategory,
  categoryOrderParam,
  newCategoryParam,
  reorderCategories,
  updateCategory,
} from './categories';
import { categoryOptions } from './imports';

describe('consultas de categorías', () => {
  let sqlite3: Sqlite3Static;
  let raw: Database;
  let db: SqlDb;

  const group = (name: string) => {
    const found = categoryTree(db).find((candidate) => candidate.name === name);
    if (!found) throw new Error(`Sin categoría ${name}`);
    return found;
  };
  const sub = (groupName: string, name: string) => {
    const found = group(groupName).subcategories.find((s) => s.name === name);
    if (!found) throw new Error(`Sin subcategoría ${name}`);
    return found;
  };
  const errorCode = (fn: () => unknown) => {
    try {
      fn();
    } catch (error) {
      return categoryErrorCode(error);
    }
    return undefined;
  };

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

  it('devuelve la plantilla como árbol, en su orden: el tipo es de las subcategorías', () => {
    const tree = categoryTree(db);

    expect(tree.map((g) => g.name)).toEqual(CATEGORY_TEMPLATE.map((g) => g.name));
    expect(tree[0]).toMatchObject({
      name: 'Ingresos',
      color: '#2E8B57',
      subcategories: [
        { name: 'Nómina', kind: 'ingreso' },
        { name: 'Ingresos extra', kind: 'ingreso' },
      ],
    });
    expect(tree[0]).not.toHaveProperty('kind');
    expect(group('Ahorro').subcategories.map((s) => s.kind)).toEqual(['ahorro', 'ahorro']);
    expect(
      db.value('SELECT count(*) FROM categories WHERE parent_id IS NULL AND kind IS NOT NULL'),
    ).toBe(0);
  });

  it('añade una categoría principal al final, con su color y sin tipo', () => {
    const id = createCategory(db, { parentId: null, name: '  Mascotas ', color: '#4F46E5' });

    expect(categoryTree(db).at(-1)).toEqual({
      id,
      name: 'Mascotas',
      color: '#4F46E5',
      transactionCount: 0,
      subcategories: [],
    });
    expect(db.value('SELECT kind FROM categories WHERE id = ?', [id])).toBeNull();
  });

  it('añade una subcategoría al final de su principal, con el tipo que se le indique', () => {
    const income = group('Ingresos');
    const id = createCategory(db, { parentId: income.id, name: 'Devoluciones', kind: 'gasto' });

    expect(group('Ingresos').subcategories.at(-1)).toEqual({
      id,
      name: 'Devoluciones',
      kind: 'gasto',
      transactionCount: 0,
    });
    expect(categoryOptions(db).map((option) => option.label)).toContain('Ingresos › Devoluciones');
  });

  it('a un movimiento solo se le pueden asignar subcategorías', () => {
    const pets = createCategory(db, { parentId: null, name: 'Mascotas', color: null });
    const options = categoryOptions(db);

    expect(options.map((option) => option.label)).not.toContain('Mascotas');
    expect(options.map((option) => option.label)).not.toContain('Ingresos');
    expect(options.some((option) => option.id === pets)).toBe(false);
    expect(options).toHaveLength(CATEGORY_TEMPLATE.flatMap((g) => g.children).length);
  });

  it('el mismo nombre vale en principales distintas, pero no entre hermanas', () => {
    const variables = group('Variables');
    createCategory(db, { parentId: variables.id, name: 'Luz', kind: 'gasto' });

    expect(
      errorCode(() => createCategory(db, { parentId: variables.id, name: 'luz', kind: 'gasto' })),
    ).toBe('nombre-repetido');
    expect(
      errorCode(() => createCategory(db, { parentId: null, name: 'VARIABLES', color: null })),
    ).toBe('nombre-repetido');
  });

  it('rechaza nombres vacíos o demasiado largos sin guardar nada', () => {
    const before = db.value('SELECT count(*) FROM categories');

    expect(errorCode(() => createCategory(db, { parentId: null, name: ' ', color: null }))).toBe(
      'nombre-vacio',
    );
    expect(
      errorCode(() => createCategory(db, { parentId: null, name: 'x'.repeat(61), color: null })),
    ).toBe('nombre-largo');
    expect(db.value('SELECT count(*) FROM categories')).toBe(before);
  });

  it('solo hay dos niveles: una subcategoría no puede tener hijas', () => {
    const [salary] = group('Ingresos').subcategories;

    expect(
      errorCode(() =>
        createCategory(db, { parentId: salary?.id ?? 0, name: 'Extra', kind: 'ingreso' }),
      ),
    ).toBe('principal-inexistente');
    expect(
      errorCode(() => createCategory(db, { parentId: 999_999, name: 'Extra', kind: 'ingreso' })),
    ).toBe('principal-inexistente');
  });

  it('el nombre se guarda como dato, no como SQL', () => {
    const evil = `'); DROP TABLE categories; --`;
    const id = createCategory(db, { parentId: null, name: evil, color: null });

    expect(db.value('SELECT name FROM categories WHERE id = ?', [id])).toBe(evil);
  });

  describe('cambios', () => {
    it('cambia el nombre y el color de una categoría principal', () => {
      const variables = group('Variables');
      updateCategory(db, { id: variables.id, name: '  Día a día ', color: '#0EA5E9' });

      expect(group('Día a día')).toMatchObject({ id: variables.id, color: '#0EA5E9' });
      expect(categoryTree(db).map((g) => g.name)).not.toContain('Variables');

      updateCategory(db, { id: variables.id, name: 'Día a día', color: null });
      expect(group('Día a día').color).toBeNull();
    });

    it('cambia el nombre y el tipo de una subcategoría', () => {
      const food = sub('Variables', 'Comida');
      updateCategory(db, { id: food.id, name: 'Supermercado', kind: 'ahorro' });

      expect(sub('Variables', 'Supermercado')).toMatchObject({ id: food.id, kind: 'ahorro' });
    });

    it('vale el propio nombre, pero no el de una hermana', () => {
      const variables = group('Variables');
      updateCategory(db, { id: variables.id, name: 'VARIABLES', color: variables.color });

      expect(group('VARIABLES').id).toBe(variables.id);
      expect(
        errorCode(() => updateCategory(db, { id: variables.id, name: 'ingresos', color: null })),
      ).toBe('nombre-repetido');
      expect(
        errorCode(() => updateCategory(db, { id: variables.id, name: ' ', color: null })),
      ).toBe('nombre-vacio');
      expect(errorCode(() => updateCategory(db, { id: 999_999, name: 'Otra', color: null }))).toBe(
        'categoria-inexistente',
      );
    });

    it('una principal no admite tipo ni una subcategoría color', () => {
      const variables = group('Variables');
      const food = sub('Variables', 'Comida');

      expect(() => updateCategory(db, { id: variables.id, name: 'X', kind: 'gasto' })).toThrow(
        RangeError,
      );
      expect(() => updateCategory(db, { id: food.id, name: 'X', color: '#0EA5E9' })).toThrow(
        RangeError,
      );
      expect(group('Variables').subcategories.map((s) => s.name)).toContain('Comida');
    });
  });

  describe('con movimientos', () => {
    const tx = (categoryId: number, extra = `'manual', NULL`) => {
      db.run(
        `INSERT INTO transactions (account_id, op_date, amount_cents, description, category_id,
           category_source, rule_id, origin)
         VALUES (1, '2026-01-05', -1000, 'Compra', ?, ${extra}, 'manual')`,
        [categoryId],
      );
      return db.lastInsertId();
    };
    const count = (table: string) => Number(db.value(`SELECT count(*) FROM ${table}`));

    beforeEach(() => {
      db.run(`INSERT INTO accounts (name, kind) VALUES ('Cuenta', 'corriente')`);
    });

    it('cuenta los movimientos que usa cada categoría y subcategoría', () => {
      tx(group('Variables').id);
      tx(sub('Variables', 'Comida').id);
      tx(sub('Variables', 'Comida').id);

      expect(group('Variables').transactionCount).toBe(1);
      expect(sub('Variables', 'Comida').transactionCount).toBe(2);
      expect(sub('Variables', 'Ocio').transactionCount).toBe(0);
      expect(group('Ingresos').transactionCount).toBe(0);
    });

    it('al eliminar una subcategoría sus movimientos quedan sin categoría', () => {
      const food = sub('Variables', 'Comida').id;
      const kept = tx(sub('Variables', 'Ocio').id);
      const freed = tx(food);

      expect(deleteCategory(db, food)).toBe(1);

      expect(group('Variables').subcategories.map((s) => s.name)).not.toContain('Comida');
      expect(db.rows('SELECT id, category_id, category_source FROM transactions')).toEqual([
        { id: kept, category_id: sub('Variables', 'Ocio').id, category_source: 'manual' },
        { id: freed, category_id: null, category_source: 'ninguna' },
      ]);
    });

    it('al eliminar una subcategoría sus submovimientos también quedan sin categoría', () => {
      const food = sub('Variables', 'Comida').id;
      const parent = tx(sub('Variables', 'Ocio').id);
      db.run(
        `INSERT INTO transaction_splits (transaction_id, description, category_id, amount_cents)
         VALUES (?, 'PAN', ?, -400)`,
        [parent, food],
      );

      deleteCategory(db, food);

      expect(db.rows('SELECT description, category_id FROM transaction_splits')).toEqual([
        { description: 'PAN', category_id: null },
      ]);
    });

    it('al eliminar una principal se van sus subcategorías y todo lo que dependía de ellas', () => {
      const variables = group('Variables').id;
      const food = sub('Variables', 'Comida').id;
      const salary = sub('Ingresos', 'Nómina').id;
      db.run(
        `INSERT INTO rules (name, priority, operator, pattern, category_id)
         VALUES ('Súper', 1, 'contiene', 'MERCADO', ?)`,
        [food],
      );
      const rule = db.lastInsertId();
      tx(variables);
      tx(food, `'regla', ${rule}`);
      tx(salary);
      db.run(
        `INSERT INTO budgets (category_id, period, amount_cents) VALUES (?, '2026-01', 5000)`,
        [food],
      );
      db.run(
        `INSERT INTO loans (name, kind, installment_cents, installments_total, first_due_date,
           category_id)
         VALUES ('Sofá', 'financiacion', 5000, 12, '2026-01-01', ?)`,
        [variables],
      );
      db.run(
        `INSERT INTO recurring_series (name, source, status, frequency, anchor_date, category_id)
         VALUES ('Gimnasio', 'manual', 'confirmada', 'mensual', '2026-01-01', ?)`,
        [food],
      );

      expect(deleteCategory(db, variables)).toBe(2);

      expect(categoryTree(db).map((g) => g.name)).not.toContain('Variables');
      expect(db.value('SELECT count(*) FROM categories WHERE parent_id = ?', [variables])).toBe(0);
      expect(
        db.rows('SELECT category_id, category_source, rule_id FROM transactions ORDER BY id'),
      ).toEqual([
        { category_id: null, category_source: 'ninguna', rule_id: null },
        { category_id: null, category_source: 'ninguna', rule_id: null },
        { category_id: salary, category_source: 'manual', rule_id: null },
      ]);
      expect(count('transactions')).toBe(3);
      expect(count('rules')).toBe(0);
      expect(count('budgets')).toBe(0);
      expect(db.value('SELECT category_id FROM loans')).toBeNull();
      expect(db.value('SELECT category_id FROM recurring_series')).toBeNull();
    });
  });

  describe('orden', () => {
    const groupIds = () => categoryTree(db).map((g) => g.id);
    const subIds = (name: string) => group(name).subcategories.map((s) => s.id);

    it('reordena las categorías principales y las nuevas van al final', () => {
      const reversed = [...groupIds()].reverse();
      reorderCategories(db, { parentId: null, ids: reversed });
      expect(groupIds()).toEqual(reversed);

      createCategory(db, { parentId: null, name: 'Mascotas', color: null });
      expect(categoryTree(db).at(-1)?.name).toBe('Mascotas');
    });

    it('reordena las subcategorías dentro de su principal sin tocar las demás', () => {
      const [first, second] = categoryTree(db);
      if (!first || !second) throw new Error('Plantilla sin dos categorías');
      const others = subIds(second.name);
      const reversed = [...subIds(first.name)].reverse();

      reorderCategories(db, { parentId: first.id, ids: reversed });

      expect(subIds(first.name)).toEqual(reversed);
      expect(subIds(second.name)).toEqual(others);
      expect(groupIds()[0]).toBe(first.id);
    });

    it('una subcategoría no puede salir de su principal ni quedarse fuera del orden', () => {
      const [first, second] = categoryTree(db);
      if (!first || !second) throw new Error('Plantilla sin dos categorías');
      const own = subIds(first.name);
      const foreign = subIds(second.name)[0] ?? 0;
      const before = categoryTree(db);

      for (const ids of [
        [...own, foreign],
        own.slice(1),
        [...own.slice(1), own[1] ?? 0],
        [first.id, ...own.slice(1)],
      ]) {
        expect(errorCode(() => reorderCategories(db, { parentId: first.id, ids }))).toBe(
          'orden-desfasado',
        );
      }
      expect(errorCode(() => reorderCategories(db, { parentId: null, ids: own }))).toBe(
        'orden-desfasado',
      );
      expect(categoryTree(db)).toEqual(before);
    });

    it('el orden se ve en las opciones de categoría', () => {
      const [first, second] = categoryTree(db);
      if (!first || !second) throw new Error('Plantilla sin dos categorías');
      reorderCategories(db, {
        parentId: null,
        ids: [second.id, first.id, ...groupIds().slice(2)],
      });
      expect(categoryOptions(db)[0]?.label.startsWith(`${second.name} › `)).toBe(true);
    });
  });

  it('eliminar una categoría que no existe es un error', () => {
    expect(errorCode(() => deleteCategory(db, 999_999))).toBe('categoria-inexistente');
  });

  describe('validación de parámetros', () => {
    it('acepta altas bien formadas', () => {
      expect(newCategoryParam({ parentId: null, name: 'Mascotas', color: '#4F46E5' })).toEqual({
        parentId: null,
        name: 'Mascotas',
        color: '#4F46E5',
      });
      expect(newCategoryParam({ name: 'Mascotas', kind: 'sobra' })).toEqual({
        parentId: null,
        name: 'Mascotas',
        color: null,
      });
      expect(newCategoryParam({ parentId: 3, name: 'Luz', kind: 'gasto', color: 'sobra' })).toEqual(
        { parentId: 3, name: 'Luz', kind: 'gasto' },
      );
    });

    it.each([
      ['no es un objeto', null],
      ['nombre no textual', { parentId: null, name: 7 }],
      ['color que no lo es', { parentId: null, name: 'A', color: 'red' }],
      ['subcategoría sin tipo', { parentId: 3, name: 'A' }],
      ['tipo desconocido', { parentId: 3, name: 'A', kind: 'otro' }],
      ['principal no numérica', { parentId: '3', name: 'A', kind: 'gasto' }],
      ['principal negativa', { parentId: -1, name: 'A', kind: 'gasto' }],
    ])('rechaza un alta con %s', (_name, params) => {
      expect(() => newCategoryParam(params)).toThrow(RangeError);
    });

    it('acepta cambios y bajas bien formados', () => {
      expect(categoryUpdateParam({ id: 3, name: 'Luz', color: '#0ea5e9', sobra: 1 })).toEqual({
        id: 3,
        name: 'Luz',
        color: '#0ea5e9',
      });
      expect(categoryUpdateParam({ id: 3, name: 'Luz' })).toEqual({
        id: 3,
        name: 'Luz',
        color: null,
      });
      expect(categoryUpdateParam({ id: 3, name: 'Luz', kind: 'ahorro' })).toEqual({
        id: 3,
        name: 'Luz',
        kind: 'ahorro',
      });
      expect(categoryIdParam({ id: 3 })).toBe(3);
    });

    it('acepta órdenes bien formados', () => {
      expect(categoryOrderParam({ parentId: null, ids: [3, 1, 2] })).toEqual({
        parentId: null,
        ids: [3, 1, 2],
      });
      expect(categoryOrderParam({ parentId: 4, ids: [] })).toEqual({ parentId: 4, ids: [] });
    });

    it.each([
      ['no es un objeto', null],
      ['sin lista', { parentId: null }],
      ['con ids no válidos', { parentId: null, ids: [1, '2'] }],
      ['con una principal no válida', { parentId: 0, ids: [1] }],
    ])('rechaza un orden %s', (_name, params) => {
      expect(() => categoryOrderParam(params)).toThrow(RangeError);
    });

    it.each([null, {}, { id: '3' }, { id: 0 }, { id: 1.5 }])('rechaza el id de %j', (params) => {
      expect(() => categoryIdParam(params)).toThrow(RangeError);
      expect(() => categoryUpdateParam({ ...params, name: 'A' })).toThrow(RangeError);
    });

    it.each([
      ['sin texto', { id: 3, name: 7 }],
      ['con un tipo desconocido', { id: 3, name: 'A', kind: 'otro' }],
      ['con un color que no lo es', { id: 3, name: 'A', color: '#12' }],
    ])('rechaza un cambio %s', (_name, params) => {
      expect(() => categoryUpdateParam(params)).toThrow(RangeError);
    });
  });
});
