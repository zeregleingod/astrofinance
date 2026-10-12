import {
  CATEGORY_COLORS,
  CategoryError,
  buildCategoryTree,
  categoryErrorCode,
  categoryNameError,
  groupTransactionCount,
  isCategoryColor,
  nextCategoryColor,
  type CategoryRecord,
} from './category-tree';

describe('categoryNameError', () => {
  it('acepta un nombre nuevo', () => {
    expect(categoryNameError('Mascotas', ['Comida', 'Ocio'])).toBeNull();
    expect(categoryNameError('  Mascotas  ', [])).toBeNull();
  });

  it('exige un nombre', () => {
    expect(categoryNameError('', [])).toBe('nombre-vacio');
    expect(categoryNameError('   ', [])).toBe('nombre-vacio');
  });

  it('limita la longitud a 60 caracteres sin contar los espacios de los extremos', () => {
    expect(categoryNameError('x'.repeat(60), [])).toBeNull();
    expect(categoryNameError(` ${'x'.repeat(60)} `, [])).toBeNull();
    expect(categoryNameError('x'.repeat(61), [])).toBe('nombre-largo');
  });

  it('no permite repetir el nombre de una hermana, sin distinguir mayúsculas', () => {
    expect(categoryNameError('comida', ['Comida'])).toBe('nombre-repetido');
    expect(categoryNameError(' NÓMINA ', ['Nómina'])).toBe('nombre-repetido');
  });
});

describe('colores', () => {
  it('reconoce un color #RRGGBB', () => {
    expect(isCategoryColor('#4f46e5')).toBe(true);
    expect(isCategoryColor('#4F46E5')).toBe(true);
    expect(isCategoryColor('#fff')).toBe(false);
    expect(isCategoryColor('rojo')).toBe(false);
    expect(isCategoryColor('#4F46E5; DROP')).toBe(false);
    expect(isCategoryColor(null)).toBe(false);
  });

  it('propone el primer color que no está en uso', () => {
    expect(nextCategoryColor([])).toBe(CATEGORY_COLORS[0]);
    expect(nextCategoryColor([null, '#4f46e5', '#2E8B57'])).toBe(CATEGORY_COLORS[1]);
  });

  it('cuando se agotan los vuelve a repartir', () => {
    expect(nextCategoryColor([...CATEGORY_COLORS])).toBe(CATEGORY_COLORS[0]);
    expect(nextCategoryColor([...CATEGORY_COLORS, null])).toBe(CATEGORY_COLORS[1]);
  });
});

describe('buildCategoryTree', () => {
  const record = (
    id: number,
    parentId: number | null,
    name: string,
    transactionCount = 0,
  ): CategoryRecord => ({
    id,
    parentId,
    name,
    kind: parentId === null ? null : 'gasto',
    color: parentId === null ? '#112233' : null,
    transactionCount,
  });

  const tree = buildCategoryTree([
    record(1, null, 'Variables', 2),
    record(2, null, 'Suministros'),
    record(3, 2, 'Luz', 4),
    record(4, 1, 'Comida', 7),
    { ...record(5, 1, 'Sueldo'), kind: 'ingreso' },
  ]);

  it('agrupa las subcategorías, con su tipo, bajo su principal en el orden de entrada', () => {
    expect(tree).toEqual([
      {
        id: 1,
        name: 'Variables',
        color: '#112233',
        transactionCount: 2,
        subcategories: [
          { id: 4, name: 'Comida', kind: 'gasto', transactionCount: 7 },
          { id: 5, name: 'Sueldo', kind: 'ingreso', transactionCount: 0 },
        ],
      },
      {
        id: 2,
        name: 'Suministros',
        color: '#112233',
        transactionCount: 0,
        subcategories: [{ id: 3, name: 'Luz', kind: 'gasto', transactionCount: 4 }],
      },
    ]);
  });

  it('sin categorías no hay árbol', () => {
    expect(buildCategoryTree([])).toEqual([]);
  });

  it('una subcategoría sin tipo (el esquema lo impide) se trata como gasto', () => {
    const [group] = buildCategoryTree([record(1, null, 'A'), { ...record(2, 1, 'B'), kind: null }]);
    expect(group?.subcategories[0]?.kind).toBe('gasto');
  });

  it('una principal suma sus movimientos y los de sus subcategorías', () => {
    expect(tree.map(groupTransactionCount)).toEqual([9, 4]);
  });
});

describe('categoryErrorCode', () => {
  it('reconoce el código aunque el error haya cruzado entre hilos', () => {
    expect(categoryErrorCode(new CategoryError('nombre-repetido'))).toBe('nombre-repetido');
    const crossed = Object.assign(new Error('categoria-inexistente'), { name: 'CategoryError' });
    expect(categoryErrorCode(crossed)).toBe('categoria-inexistente');
  });

  it('ignora cualquier otro error', () => {
    expect(categoryErrorCode(new Error('nombre-vacio'))).toBeNull();
    expect(categoryErrorCode(Object.assign(new Error('otro'), { name: 'CategoryError' }))).toBe(
      null,
    );
    expect(categoryErrorCode('nombre-vacio')).toBeNull();
  });
});
