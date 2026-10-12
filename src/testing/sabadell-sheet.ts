import type { RawCell, RawSheet } from '@domain/imports/bank-statement';

type Row = RawCell[];

/** Datos que el perfil debe descartar: un test falla si llegan al resultado. */
export const SABADELL_HOLDER = 'TITULAR*FICTICIO DEMO';
export const SABADELL_IBAN = 'ES00 0000 0000 0000 0000 4321';

/**
 * Extracto ficticio con la forma exacta de la «Consulta de movimientos» del Banc Sabadell
 * (enero de 2026): preámbulo de 8 filas, cabecera y movimientos en orden descendente, fechas
 * como texto, importes numéricos y referencias vacías como `''`. Los saldos cuadran al céntimo.
 */
export const SABADELL_ROWS: readonly Row[] = [
  ['30/01/2026', 'TRANSFERENCIA A Hucha Demo', '30/01/2026', -200, 2104.03, '', ''],
  [
    '30/01/2026',
    'PRESTAMOS ADEUDO CUOTA N.0000000001 31/01/26',
    '31/01/2026',
    -557.46,
    2304.03,
    '',
    '',
  ],
  ['28/01/2026', 'NOMINA DE EMPRESA DEMO SL', '28/01/2026', 1850, 2861.49, '', ''],
  [
    '15/01/2026',
    'COMPRA TARJ. 4000XXXXXXXX0001 CAFETERIA DEMO-BARCELONA',
    '16/01/2026',
    -1.5,
    1011.49,
    '',
    '4000__0001',
  ],
  [
    '15/01/2026',
    'COMPRA TARJ. 4000XXXXXXXX0001 CAFETERIA DEMO-BARCELONA',
    '16/01/2026',
    -1.5,
    1012.99,
    '',
    '4000__0001',
  ],
  ['09/01/2026', 'ADEUDO RECIBO LUZ DEMO', '09/01/2026', -69.09, 1014.49, 'REF-LUZ', ''],
  ['02/01/2026', 'ABONO BIZUM DE ALEX DEMO', '02/01/2026', 3.5, 1083.58, '', '000000000001'],
  ['02/01/2026', 'ABONO PROMOCIÓN', '02/01/2026', 80.08, 1080.08, '', ''],
];

export function sabadellSheet(rows: readonly Row[] = SABADELL_ROWS): RawSheet {
  return [
    ['Consulta de movimientos', null, null, null, null, null, null],
    ['17/08/2026 15:30:05', null, null, null, null, null, null],
    [null, null, null, null, null, null, null],
    ['Cuenta: ', SABADELL_IBAN, null, null, null, null, null],
    ['Divisa: ', 'EUR', null, null, null, null, null],
    ['Titular:', SABADELL_HOLDER, null, null, null, null, null],
    ['Selección:', 'Desde 01/01/2026 hasta 31/01/2026', null, null, null, null, null],
    [null, null, null, null, null, null, null],
    ['F. Operativa', 'Concepto', 'F. Valor', 'Importe', 'Saldo', 'Referencia 1', 'Referencia 2'],
    ...rows,
  ];
}
