import { IsoDatePipe } from './iso-date-pipe';

describe('IsoDatePipe', () => {
  it('convierte AAAA-MM-DD a dd/mm/aaaa', () => {
    expect(new IsoDatePipe().transform('2026-09-03')).toBe('03/09/2026');
  });
});
