import { formatCents } from '@domain/money/format-cents';
import { CentsPipe } from './cents-pipe';

describe('CentsPipe', () => {
  it('formatea céntimos enteros como importe en euros', () => {
    expect(new CentsPipe().transform(-111070)).toBe(formatCents(-111070));
  });

  it('puede omitir el símbolo del euro', () => {
    expect(new CentsPipe().transform(-111070, false)).toBe('-1.110,70');
  });
});
