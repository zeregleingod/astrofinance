import { PeriodLabelPipe } from './period-label-pipe';

describe('PeriodLabelPipe', () => {
  it('muestra el mes en texto y el año', () => {
    expect(new PeriodLabelPipe().transform('2026-09')).toBe('septiembre de 2026');
  });
});
