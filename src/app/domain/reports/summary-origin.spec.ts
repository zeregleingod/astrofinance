import { summaryOrigin, SUMMARY_TOTALS } from './summary-origin';

describe('summaryOrigin', () => {
  it('reconoce cada total del resumen junto a su mes', () => {
    for (const total of SUMMARY_TOTALS) {
      expect(summaryOrigin('2026-09', total)).toEqual({ period: '2026-09', total });
    }
  });

  it('sin mes válido o sin total conocido no hay origen', () => {
    expect(summaryOrigin(undefined, 'gastos')).toBeNull();
    expect(summaryOrigin('2026-13', 'gastos')).toBeNull();
    expect(summaryOrigin('2026-09', undefined)).toBeNull();
    expect(summaryOrigin('2026-09', 'otros')).toBeNull();
  });
});
