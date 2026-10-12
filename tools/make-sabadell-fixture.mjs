// Genera `e2e/fixtures/sabadell-enero-2026.xls`: un extracto FICTICIO con la misma forma que
// la «Consulta de movimientos» del Banc Sabadell (T6.0). Ningún dato sale de un extracto real:
// los conceptos son plantillas inventadas y los importes salen de un generador con semilla,
// así que el fichero es reproducible. Uso: `node tools/make-sabadell-fixture.mjs`.
import { writeFileSync } from 'node:fs';
import { utils, write } from 'xlsx';

const CARD = '4000XXXXXXXX0001';
const CARD_REF = '4000__0001';

/** Generador congruencial: mismos datos en cada ejecución. */
let seed = 20260131;
const random = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const between = (min, max) => Math.round(min + random() * (max - min));

const SHOPS = [
  'SUPERMERCADO DEMO-BARCELONA',
  'CAFETERIA DEMO-BARCELONA',
  'GASOLINERA DEMO-SABADELL',
  'FARMACIA DEMO-TERRASSA',
  'LIBRERIA DEMO-BARCELONA',
  'RESTAURANTE DEMO-SITGES',
];

/** [día, concepto, días hasta la fecha valor, céntimos, referencia 1, referencia 2] */
const movements = [
  [2, `COMPRA TARJ. ${CARD} BALNEARIO DEMO-ANDORRA`, 3, -8800, '', CARD_REF],
  [2, 'ABONO BIZUM DE ALEX DEMO', 0, 350, '', '000000000001'],
  [2, 'PAGO BIZUM ALEX DEMO', 0, -900, '', '000000000002'],
  [5, 'ABONO PROMOCIÓN', 0, 1000, '', ''],
  [7, 'ADEUDO RECIBO LUZ DEMO', 0, -6909, 'REF-LUZ-0001', ''],
  [8, 'TELEFONOS Operadora Demo', 0, -3990, 'REF-TEL-0001', ''],
  [9, `DEVOLUCION ${CARD} LIBRERIA DEMO-BARCELONA`, 1, 1250, '', CARD_REF],
  [12, 'SEGUROS BANSABADELL HOGAR DEMO', 0, -2415, '', ''],
  [15, 'PARA AHORRO Hucha Demo', 0, -5000, '', ''],
  [20, 'TRASPASO 0000-00000000-00', 0, 15000, '', ''],
  [28, 'NOMINA DE EMPRESA DEMO SL', 0, 185000, '', ''],
  [29, 'TRANSFERENCIA ALEX DEMO', 0, 4200, '', ''],
  [30, 'PRESTAMOS ADEUDO CUOTA N.0000000001 31/01/26', 1, -55746, '', ''],
  [30, 'TRANSFERENCIA A Alex Demo', 0, -6909, '', ''],
  [30, 'TRANSFERENCIA A Hucha Demo', 0, -20000, '', ''],
];
for (let day = 3; day <= 29; day += 1) {
  const shop = SHOPS[between(0, SHOPS.length - 1)];
  movements.push([day, `COMPRA TARJ. ${CARD} ${shop}`, 1, -between(150, 9500), '', CARD_REF]);
}
// Dos cargos idénticos legítimos el mismo día: no deben colapsar al deduplicar.
movements.push([15, `COMPRA TARJ. ${CARD} CAFETERIA DEMO-BARCELONA`, 1, -150, '', CARD_REF]);
movements.push([15, `COMPRA TARJ. ${CARD} CAFETERIA DEMO-BARCELONA`, 1, -150, '', CARD_REF]);

const pad = (n) => String(n).padStart(2, '0');
const date = (day) => `${pad(Math.min(day, 31))}/01/2026`;

// Cronológico para encadenar saldos; el banco exporta del más reciente al más antiguo.
movements.sort((a, b) => a[0] - b[0]);
let balance = 250000;
const rows = movements.map(([day, concept, valueLag, cents, ref1, ref2]) => {
  balance += cents;
  return [date(day), concept, date(day + valueLag), cents / 100, balance / 100, ref1, ref2];
});
rows.reverse();

const sheet = utils.aoa_to_sheet([
  ['Consulta de movimientos'],
  ['17/08/2026 15:30:05'],
  [],
  ['Cuenta: ', 'ES00 0000 0000 0000 0000 4321'],
  ['Divisa: ', 'EUR'],
  ['Titular:', 'TITULAR*FICTICIO DEMO'],
  ['Selección:', 'Desde 01/01/2026 hasta 31/01/2026'],
  [],
  ['F. Operativa', 'Concepto', 'F. Valor', 'Importe', 'Saldo', 'Referencia 1', 'Referencia 2'],
  ...rows,
]);
// Las mismas celdas combinadas que el fichero del banco.
sheet['!merges'] = [
  { s: { c: 0, r: 0 }, e: { c: 1, r: 0 } },
  { s: { c: 0, r: 1 }, e: { c: 1, r: 1 } },
  { s: { c: 0, r: 2 }, e: { c: 6, r: 2 } },
];

const book = utils.book_new();
utils.book_append_sheet(book, sheet, 'Hoja1');
const target = new URL('../e2e/fixtures/sabadell-enero-2026.xls', import.meta.url);
writeFileSync(target, write(book, { bookType: 'biff8', type: 'buffer' }));
console.error(`✓ ${rows.length} movimientos ficticios en ${target.pathname}`);
