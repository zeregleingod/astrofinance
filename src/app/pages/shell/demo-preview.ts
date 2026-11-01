/** Las categorías de la vista previa; sus nombres están en `TEXTS.landing.groups`. */
export type PreviewGroup = 'housing' | 'loans' | 'variable' | 'utilities';

/**
 * El último mes de la demo tal y como lo enseña el Resumen, para la tarjeta de la landing: los
 * totales del mes y los cuatro bloques de más gasto. Son cifras fijas porque en la landing todavía
 * no hay BD; `demo-data.spec.ts` comprueba que siguen siendo las de la demo.
 */
export const DEMO_PREVIEW = {
  period: '2026-09',
  incomeCents: 185000,
  expenseCents: -80894,
  savingsCents: 20000,
  groups: [
    { key: 'housing', totalCents: -28757 },
    { key: 'loans', totalCents: -27694 },
    { key: 'variable', totalCents: -11793 },
    { key: 'utilities', totalCents: -6500 },
  ],
} as const satisfies {
  period: string;
  incomeCents: number;
  expenseCents: number;
  savingsCents: number;
  groups: readonly { key: PreviewGroup; totalCents: number }[];
};
