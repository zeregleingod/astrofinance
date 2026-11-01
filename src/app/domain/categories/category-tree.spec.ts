import {
  CATEGORY_COLORS,
  CategoryError,
  buildCategoryTree,
  categoryErrorCode,
  categoryNameError,
  categoryNamesError,
  categoryTranslationError,
  cleanTranslations,
  isLanguageCode,
  localizedName,
  groupTransactionCount,
  isCategoryColor,
  isReorderOf,
  moveItem,
  nextCategoryColor,
  type CategoryNames,
  type CategoryRecord,
} from './category-tree';

const names = (defaultName: string, translations: Record<string, string> = {}): CategoryNames => ({
  defaultName,
  translations,
});

describe('nombres en varios idiomas (ADR-0028)', () => {
  const food = names('Comida', { en: 'Food', ca: 'Menjar' });
  const leisure = names('Ocio');

  it('cada idioma ve su traducción o, si no la hay, el nombre por defecto', () => {
    expect(localizedName(food, 'en')).toBe('Food');
    expect(localizedName(food, 'es')).toBe('Comida');
    expect(localizedName(leisure, 'en')).toBe('Ocio');
  });

  it('solo guarda las traducciones que dicen algo: sin vacías ni iguales al nombre', () => {
    expect(cleanTranslations('Comida', { en: ' Food ', ca: '  ', es: 'comida' })).toEqual({
      en: 'Food',
    });
  });

  it('una traducción vacía vale: es no traducir', () => {
    expect(categoryTranslationError('  ', 'en', [food])).toBeNull();
  });

  it('una traducción no pasa de 60 caracteres', () => {
    expect(categoryTranslationError('x'.repeat(61), 'en', [])).toBe('traduccion-larga');
  });

  it('una traducción no repite el nombre que tiene una hermana en ese idioma', () => {
    expect(categoryTranslationError('food', 'en', [food])).toBe('traduccion-repetida');
    expect(categoryTranslationError('Ocio', 'en', [leisure])).toBe('traduccion-repetida');
    // En catalán la hermana se llama «Menjar»: «Food» está libre.
    expect(categoryTranslationError('Food', 'ca', [food])).toBeNull();
  });

  it('valida todos los nombres de una categoría frente a los de sus hermanas', () => {
    expect(categoryNamesError(names('Mascotas', { en: 'Pets' }), [food, leisure])).toBeNull();
    expect(categoryNamesError(names('comida'), [food])).toBe('nombre-repetido');
    expect(categoryNamesError(names('Mascotas', { en: 'Food' }), [food])).toBe(
      'traduccion-repetida',
    );
    // Sin traducción al inglés se vería «Food» dos veces en inglés.
    expect(categoryNamesError(names('Food'), [food])).toBe('nombre-repetido');
    // Con su propia traducción al inglés, ya no.
    expect(categoryNamesError(names('Food', { en: 'Groceries' }), [food])).toBeNull();
  });

  it('reconoce los códigos de idioma de dos letras', () => {
    expect(['es', 'en', 'ca'].every(isLanguageCode)).toBe(true);
    expect(['EN', 'eng', '', 3].some(isLanguageCode)).toBe(false);
  });
});

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
    defaultName: name,
    translations: {},
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
        defaultName: 'Variables',
        translations: {},
        color: '#112233',
        transactionCount: 2,
        subcategories: [
          { id: 4, ...names('Comida'), name: 'Comida', kind: 'gasto', transactionCount: 7 },
          { id: 5, ...names('Sueldo'), name: 'Sueldo', kind: 'ingreso', transactionCount: 0 },
        ],
      },
      {
        id: 2,
        name: 'Suministros',
        defaultName: 'Suministros',
        translations: {},
        color: '#112233',
        transactionCount: 0,
        subcategories: [
          { id: 3, ...names('Luz'), name: 'Luz', kind: 'gasto', transactionCount: 4 },
        ],
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

describe('moveItem', () => {
  it('lleva un elemento a otra posición sin tocar la lista original', () => {
    const ids = [1, 2, 3, 4];
    expect(moveItem(ids, 0, 2)).toEqual([2, 3, 1, 4]);
    expect(moveItem(ids, 3, 0)).toEqual([4, 1, 2, 3]);
    expect(moveItem(ids, 1, 1)).toEqual([1, 2, 3, 4]);
    expect(ids).toEqual([1, 2, 3, 4]);
  });

  it('ajusta los índices fuera de la lista a sus extremos', () => {
    expect(moveItem([1, 2, 3], 0, 9)).toEqual([2, 3, 1]);
    expect(moveItem([1, 2, 3], 2, -1)).toEqual([3, 1, 2]);
    expect(moveItem([1, 2, 3], 7, 0)).toEqual([1, 2, 3]);
  });
});

describe('isReorderOf', () => {
  it('acepta los mismos ids en otro orden', () => {
    expect(isReorderOf([3, 1, 2], [1, 2, 3])).toBe(true);
    expect(isReorderOf([], [])).toBe(true);
  });

  it('rechaza que falte, sobre o se repita alguno', () => {
    expect(isReorderOf([1, 2], [1, 2, 3])).toBe(false);
    expect(isReorderOf([1, 2, 3, 4], [1, 2, 3])).toBe(false);
    expect(isReorderOf([1, 1, 2], [1, 2, 3])).toBe(false);
    expect(isReorderOf([1, 2, 9], [1, 2, 3])).toBe(false);
  });
});
