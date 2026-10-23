import {
  checkSplits,
  normalizeSplitLine,
  splitSavePlan,
  type SplitLine,
} from './transaction-split';

const line = (amountCents: number, extra: Partial<SplitLine> = {}): SplitLine => ({
  id: null,
  description: 'REGALO',
  categoryId: 7,
  amountCents,
  ...extra,
});

describe('submovimientos', () => {
  describe('checkSplits', () => {
    it('acepta partes del mismo signo que no pasan del total y da lo que queda sin dividir', () => {
      expect(checkSplits(-10000, [line(-6000), line(-2500)])).toEqual({
        lines: [[], []],
        exceeds: false,
        unsplitCents: -1500,
        valid: true,
      });
    });

    it('dividir el total entero no deja resto', () => {
      expect(checkSplits(-10000, [line(-6000), line(-4000)])).toMatchObject({
        unsplitCents: 0,
        valid: true,
      });
    });

    it('vale igual para un ingreso', () => {
      expect(checkSplits(5000, [line(2000), line(3000)])).toMatchObject({ valid: true });
    });

    it('no deja pasarse del importe del movimiento', () => {
      expect(checkSplits(-10000, [line(-6000), line(-4001)])).toMatchObject({
        exceeds: true,
        unsplitCents: 1,
        valid: false,
      });
    });

    it('exige concepto, importe distinto de cero y el signo del movimiento', () => {
      const result = checkSplits(-10000, [
        line(-100, { description: '   ' }),
        line(0),
        line(500),
        line(-100, { description: 'X'.repeat(501) }),
      ]);
      expect(result.lines).toEqual([['description'], ['amount'], ['sign'], ['description']]);
      expect(result.valid).toBe(false);
    });

    it('no admite importes con decimales (siempre céntimos enteros)', () => {
      expect(checkSplits(-10000, [line(-10.5)]).lines).toEqual([['amount']]);
    });

    it('una lista vacía deja el movimiento sin dividir', () => {
      expect(checkSplits(-10000, [])).toEqual({
        lines: [],
        exceeds: false,
        unsplitCents: -10000,
        valid: true,
      });
    });
  });

  describe('normalizeSplitLine', () => {
    it('quita los espacios de los extremos y pone el concepto en mayúsculas', () => {
      expect(normalizeSplitLine(line(-100, { description: '  cojín salón ' }))).toEqual(
        line(-100, { description: 'COJÍN SALÓN' }),
      );
    });
  });

  describe('splitSavePlan', () => {
    const current = [
      { id: 1, amountCents: -3000 },
      { id: 2, amountCents: -5000 },
      { id: 3, amountCents: -1000 },
    ];

    it('conserva los que siguen, da de alta los nuevos y borra los que faltan', () => {
      const plan = splitSavePlan(current, [
        line(-3000, { id: 1 }),
        line(-2000),
        line(-1000, { id: 3 }),
      ]);
      expect(plan.deletes).toEqual([2]);
      expect(plan.updates.map((u) => u.id)).toEqual([1, 3]);
      expect(plan.inserts).toEqual([line(-2000)]);
    });

    it('reduce antes de aumentar, para no pasar nunca del total por el camino', () => {
      const plan = splitSavePlan(current, [
        line(-6000, { id: 1 }),
        line(-2000, { id: 2 }),
        line(-1000, { id: 3 }),
      ]);
      expect(plan.updates.map((u) => [u.id, u.amountCents])).toEqual([
        [2, -2000],
        [3, -1000],
        [1, -6000],
      ]);
    });

    it('rechaza ids que no son de este movimiento o repetidos', () => {
      expect(() => splitSavePlan(current, [line(-100, { id: 9 })])).toThrow(RangeError);
      expect(() => splitSavePlan(current, [line(-100, { id: 1 }), line(-100, { id: 1 })])).toThrow(
        RangeError,
      );
    });
  });
});
