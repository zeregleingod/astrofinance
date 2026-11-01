import { setLanguage } from '@ui/texts';
import { PeriodLabelPipe } from './period-label-pipe';

describe('PeriodLabelPipe', () => {
  afterEach(() => setLanguage('es'));

  it('muestra el mes en texto y el año', () => {
    expect(new PeriodLabelPipe().transform('2026-09')).toBe('septiembre de 2026');
  });

  it('en inglés, con el mes en mayúscula y sin «de»', () => {
    setLanguage('en');

    expect(new PeriodLabelPipe().transform('2026-09')).toBe('September 2026');
  });

  it('en catalán', () => {
    setLanguage('ca');

    expect(new PeriodLabelPipe().transform('2026-10')).toBe('octubre de 2026');
  });
});
