import { cardLayout } from './card-layout';

const cards = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe('cardLayout', () => {
  it('reparte las tarjetas por columnas, tres en cada una y en orden', () => {
    expect(cardLayout(cards(9))).toEqual({
      columns: [
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9],
      ],
      rest: [],
    });
  });

  it('deja la última columna incompleta y no crea columnas vacías', () => {
    expect(cardLayout(cards(7))).toEqual({ columns: [[1, 2, 3], [4, 5, 6], [7]], rest: [] });
    expect(cardLayout(cards(2))).toEqual({ columns: [[1, 2]], rest: [] });
    expect(cardLayout([])).toEqual({ columns: [], rest: [] });
  });

  it('las que no caben en las tres columnas quedan para debajo, en orden', () => {
    expect(cardLayout(cards(11)).rest).toEqual([10, 11]);
  });
});
