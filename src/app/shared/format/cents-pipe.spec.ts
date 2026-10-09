import { formatCents } from '@domain/money/format-cents';
import { CentsPipe } from './cents-pipe';

describe('CentsPipe', () => {
  it('formatea céntimos enteros como importe en euros', () => {
    expect(new CentsPipe().transform(-111070)).toBe(formatCents(-111070));
  });
});
