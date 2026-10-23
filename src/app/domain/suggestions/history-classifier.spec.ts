import {
  conceptTokens,
  suggestFromHistory,
  trainClassifier,
  type LabeledConcept,
} from './history-classifier';

const SUPER = 11;
const CAFE = 12;
const LUZ = 13;
const REEMBOLSOS = 21;

const spent = (text: string, categoryId: number): LabeledConcept => ({
  text,
  amountCents: -1250,
  categoryId,
});

const HISTORY: readonly LabeledConcept[] = [
  spent('COMPRA TARJ. 4000XXXXXXXX0001 MERCADONA VALENCIA', SUPER),
  spent('COMPRA TARJ. 4000XXXXXXXX0001 MERCADONA VALENCIA', SUPER),
  spent('COMPRA TARJ. 4000XXXXXXXX0001 CAFETERIA DEMO-BARCELONA', CAFE),
  spent('ADEUDO RECIBO LUZ DEMO', LUZ),
  { text: 'ABONO BIZUM DE ALEX DEMO', amountCents: 350, categoryId: REEMBOLSOS },
];

/** La categoría que se sugiere para un gasto (o un ingreso, con importe positivo). */
const suggest = (text: string, amountCents = -990, history = HISTORY) =>
  suggestFromHistory(trainClassifier(history), { text, amountCents })?.categoryId ?? null;

describe('conceptTokens', () => {
  it('se queda con las palabras que distinguen el concepto', () => {
    expect(conceptTokens('COMPRA TARJ. 4000XXXXXXXX0001 CAFETERIA DEMO-BARCELONA')).toEqual([
      'cafeteria',
      'demo',
      'barcelona',
    ]);
  });

  it('descarta números, referencias, fechas y palabras de menos de tres letras', () => {
    expect(conceptTokens('PRESTAMOS ADEUDO CUOTA N.0000000001 31/01/26 DE LA ES')).toEqual([
      'prestamos',
      'cuota',
    ]);
  });

  it('no distingue mayúsculas ni acentos', () => {
    expect(conceptTokens('Panadería Peñón')).toEqual(conceptTokens('PANADERIA PENON'));
  });
});

describe('suggestFromHistory', () => {
  it('sugiere la categoría de un concepto ya clasificado', () => {
    expect(suggest('ADEUDO RECIBO LUZ DEMO')).toBe(LUZ);
  });

  it('reconoce el comercio aunque cambien la tarjeta, la ciudad o la referencia', () => {
    expect(suggest('COMPRA TARJ. 5402XXXXXXXX9999 MERCADONA ALZIRA')).toBe(SUPER);
    expect(suggest('COMPRA TARJ. 4000XXXXXXXX0001 CAFETERIA DEMO-MADRID')).toBe(CAFE);
  });

  it('tolera pequeñas diferencias en el nombre', () => {
    expect(suggest('COMPRA MERCADONA S.A. 2')).toBe(SUPER);
  });

  it('un gasto solo aprende de gastos y un ingreso de ingresos', () => {
    expect(suggest('ABONO BIZUM DE ALEX DEMO', 500)).toBe(REEMBOLSOS);
    expect(suggest('ABONO BIZUM DE ALEX DEMO', -500)).toBeNull();
    expect(suggest('ADEUDO RECIBO LUZ DEMO', 6909)).toBeNull();
  });

  it('se decide por la categoría que más se repite entre los parecidos', () => {
    const history = [
      spent('BAZAR CHINO CENTRO', SUPER),
      spent('BAZAR CHINO CENTRO', SUPER),
      spent('BAZAR CHINO CENTRO', SUPER),
      spent('BAZAR CHINO CENTRO', CAFE),
    ];
    expect(suggest('BAZAR CHINO CENTRO', -500, history)).toBe(SUPER);
  });

  it('no sugiere nada si los parecidos no se ponen de acuerdo', () => {
    const history = [spent('BAZAR CHINO CENTRO', SUPER), spent('BAZAR CHINO CENTRO', CAFE)];
    expect(suggest('BAZAR CHINO CENTRO', -500, history)).toBeNull();
  });

  it('no sugiere nada para un concepto que no se parece a ninguno', () => {
    expect(suggest('FARMACIA LOPEZ')).toBeNull();
    expect(suggest('COMPRA TARJ. 4000XXXXXXXX0001 GASOLINERA DEMO')).toBeNull();
  });

  it('las palabras que el banco pone en todo no bastan para parecerse', () => {
    expect(suggest('ADEUDO RECIBO GIMNASIO')).toBeNull();
    expect(suggest('ADEUDO RECIBO LUZ IBERDROLA')).toBe(LUZ);
  });

  it('no sugiere nada sin historial ni para un concepto sin palabras útiles', () => {
    expect(suggest('MERCADONA', -500, [])).toBeNull();
    expect(suggest('COMPRA TARJ. 4000XXXXXXXX0001')).toBeNull();
  });

  it('da más confianza a lo idéntico que a lo parecido', () => {
    const classifier = trainClassifier(HISTORY);
    const same = suggestFromHistory(classifier, {
      text: 'COMPRA TARJ. 4000XXXXXXXX0001 MERCADONA VALENCIA',
      amountCents: -990,
    });
    const similar = suggestFromHistory(classifier, {
      text: 'COMPRA TARJ. 5402XXXXXXXX9999 MERCADONA ALZIRA',
      amountCents: -990,
    });
    expect(same?.confidence).toBeCloseTo(1);
    expect(similar?.confidence).toBeLessThan(same?.confidence ?? 0);
    expect(similar?.confidence).toBeGreaterThan(0);
  });
});
