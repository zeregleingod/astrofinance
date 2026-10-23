import { checkRefunds, refundSavePlan, refundSourceKey, type RefundLink } from './refund';

const link = (
  reimbursementTxId: number,
  amountCents: number,
  reimbursementSplitId: number | null = null,
): RefundLink => ({ reimbursementTxId, reimbursementSplitId, amountCents });

describe('devoluciones de un gasto', () => {
  // Lo que cada Bizum tiene libre (sin contar lo que ya devuelve de este gasto).
  const available = new Map([
    ['1:', 3000],
    ['2:', 3000],
    ['3:', 5000],
    // Una parte (el submovimiento 31) del ingreso 3.
    ['3:31', 1500],
  ]);

  describe('checkRefunds', () => {
    it('suma lo devuelto y dice lo que cuesta el gasto de verdad', () => {
      expect(checkRefunds(-12000, [link(1, 3000), link(2, 3000)], available)).toEqual({
        lines: [[], []],
        refundedCents: 6000,
        costCents: 6000,
        exceeds: false,
        valid: true,
      });
    });

    it('no deja devolver más de lo que costó', () => {
      expect(checkRefunds(-5000, [link(1, 3000), link(3, 2001)], available)).toMatchObject({
        refundedCents: 5001,
        costCents: -1,
        exceeds: true,
        valid: false,
      });
    });

    it('cada devolución, mayor que cero, en céntimos y sin pasar de lo que el ingreso tiene libre', () => {
      const result = checkRefunds(
        -20000,
        [link(1, 0), link(2, 3001), link(3, 12.5), link(9, 100)],
        available,
      );
      expect(result.lines).toEqual([['amount'], ['available'], ['amount'], ['available']]);
      expect(result.valid).toBe(false);
    });

    it('un mismo ingreso no se vincula dos veces', () => {
      expect(checkRefunds(-20000, [link(1, 100), link(1, 100)], available).lines).toEqual([
        [],
        ['duplicate'],
      ]);
    });

    it('sin devoluciones el gasto cuesta entero', () => {
      expect(checkRefunds(-4500, [], available)).toMatchObject({
        refundedCents: 0,
        costCents: 4500,
        valid: true,
      });
    });
  });

  describe('refundSavePlan', () => {
    const current = [link(1, 3000), link(2, 3000), link(3, 1000)];

    it('borra las que faltan, cambia las que siguen y añade las nuevas', () => {
      const plan = refundSavePlan(current, [link(1, 3000), link(3, 1500), link(4, 200)]);
      expect(plan.deletes).toEqual([link(2, 3000)]);
      expect(plan.updates).toEqual([link(1, 3000), link(3, 1500)]);
      expect(plan.inserts).toEqual([link(4, 200)]);
    });

    it('baja antes de subir, para no pasar nunca del gasto por el camino', () => {
      const plan = refundSavePlan(current, [link(1, 1000), link(2, 5000), link(3, 1000)]);
      expect(plan.updates.map((l) => l.reimbursementTxId)).toEqual([1, 3, 2]);
    });
  });

  describe('origen: un ingreso entero o un submovimiento suyo', () => {
    it('cada origen tiene su clave y su importe libre', () => {
      expect(refundSourceKey(link(3, 0))).toBe('3:');
      expect(refundSourceKey(link(3, 0, 31))).toBe('3:31');
      expect(checkRefunds(-20000, [link(3, 5000), link(3, 1500, 31)], available).valid).toBe(true);
      expect(checkRefunds(-20000, [link(3, 1501, 31)], available).lines).toEqual([['available']]);
    });

    it('el mismo ingreso y una parte suya son orígenes distintos al guardar', () => {
      const plan = refundSavePlan([link(3, 1000)], [link(3, 1000), link(3, 1500, 31)]);
      expect(plan.deletes).toEqual([]);
      expect(plan.inserts).toEqual([link(3, 1500, 31)]);
    });
  });
});
