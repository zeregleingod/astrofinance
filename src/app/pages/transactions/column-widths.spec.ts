import { FLEX_MIN, minWidth, moveBorder, parseWidths } from './column-widths';

describe('anchos de las columnas de Movimientos', () => {
  const start = { bookedDate: 132, account: 120, description: 500, category: 180, amount: 112 };

  it('lo que gana una columna lo pierde su vecina', () => {
    expect(moveBorder(start, 'category', 'amount', -30)).toEqual({ category: 150, amount: 142 });
    expect(moveBorder(start, 'bookedDate', 'account', 20)).toEqual({
      bookedDate: 152,
      account: 100,
    });
  });

  it('la descripción no se fija: crece o mengua sola', () => {
    // Su borde derecho: ensancharla estrecha a la de su derecha.
    expect(moveBorder(start, 'description', 'category', 40)).toEqual({ category: 140 });
    // Su borde izquierdo: ensanchar la de su izquierda la estrecha a ella.
    expect(moveBorder(start, 'account', 'description', 40)).toEqual({ account: 160 });
  });

  it('ninguna baja de su mínimo', () => {
    expect(moveBorder(start, 'account', 'description', 1000)).toEqual({
      account: 120 + 500 - FLEX_MIN,
    });
    expect(moveBorder(start, 'account', 'description', -1000)).toEqual({
      account: minWidth('account'),
    });
    expect(moveBorder(start, 'category', 'amount', 1000)).toEqual({
      category: 180 + 112 - minWidth('amount'),
      amount: minWidth('amount'),
    });
  });

  it('sin medidas (la tabla aún no se ha pintado), el borde no se mueve', () => {
    expect(moveBorder({}, 'category', 'amount', 50)).toEqual({
      category: minWidth('category'),
      amount: minWidth('amount'),
    });
    expect(moveBorder({ account: 0, description: 0 }, 'account', 'description', 50)).toEqual({
      account: minWidth('account'),
    });
  });

  it('el importe y la fecha tienen un mínimo mayor que el resto', () => {
    expect(minWidth('amount')).toBeGreaterThan(minWidth('notes'));
    expect(minWidth('bookedDate')).toBeGreaterThan(minWidth('account'));
    expect(minWidth('description')).toBe(FLEX_MIN);
  });

  it('de lo guardado solo vale lo que tiene buena forma', () => {
    expect(parseWidths({ account: 90.4, notes: 200 })).toEqual({ account: 90, notes: 200 });
    expect(
      parseWidths({ account: 10, notes: '200', amount: Number.NaN, description: 300, otra: 5 }),
    ).toEqual({});
    expect(parseWidths({ category: 99_999 })).toEqual({});
    expect(parseWidths(null)).toEqual({});
    expect(parseWidths([120])).toEqual({});
    expect(parseWidths('x')).toEqual({});
  });
});
