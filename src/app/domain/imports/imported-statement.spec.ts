import { sabadellSheet, SABADELL_ROWS } from '../../../testing/sabadell-sheet';
import { parseStatement } from './bank-profiles';
import type { StatementMovement } from './bank-statement';
import {
  checkBalances,
  prepareImport,
  statementPeriod,
  withDedupeHashes,
} from './imported-statement';

const FILE = { name: 'enero.xls', sha256: 'a'.repeat(64) };

const movement = (
  row: number,
  opDate: string,
  amountCents: number,
  balanceAfterCents: number | null,
): StatementMovement => ({
  row,
  opDate,
  valueDate: null,
  description: 'Movimiento',
  amountCents,
  balanceAfterCents,
  reference: null,
});

describe('prepareImport', () => {
  it('añade fichero, huellas y comprobación de saldos sin tocar los movimientos', () => {
    const statement = parseStatement(sabadellSheet());
    const imported = prepareImport(statement, FILE);

    expect(imported).toMatchObject({
      fileName: 'enero.xls',
      fileSha256: FILE.sha256,
      profileId: 'sabadell',
      balanceMismatchRows: [],
      openingBalanceCents: 100000,
    });
    expect(imported.movements.map((m) => ({ ...m, dedupeHash: undefined }))).toEqual(
      statement.movements,
    );
    expect(imported.movements.every((m) => /^[0-9a-f]{64}$/.test(m.dedupeHash))).toBe(true);
  });
});

describe('withDedupeHashes', () => {
  const statement = parseStatement(sabadellSheet());
  const hashes = (s = statement) => withDedupeHashes(s).map((m) => m.dedupeHash);

  it('es determinista: reimportar el mismo fichero da las mismas huellas', () => {
    expect(hashes()).toEqual(hashes(parseStatement(sabadellSheet())));
  });

  it('no colapsa dos movimientos idénticos legítimos del mismo día', () => {
    expect(new Set(hashes()).size).toBe(SABADELL_ROWS.length);

    const twins = [movement(10, '2026-01-15', -150, null), movement(11, '2026-01-15', -150, null)];
    const [a, b] = withDedupeHashes({ profileId: 'sabadell', ibanLast4: null, movements: twins });
    expect(a?.dedupeHash).not.toBe(b?.dedupeHash);
  });

  it('no depende de la fila: un extracto solapado reconoce el mismo movimiento', () => {
    const overlapping = parseStatement(sabadellSheet(SABADELL_ROWS.slice(2)));
    expect(hashes(overlapping)).toEqual(hashes().slice(2));
  });

  it('cambia con la cuenta, el banco, la fecha, el importe, el concepto y el saldo', () => {
    const base = { profileId: 'sabadell', ibanLast4: '4321' };
    const one = (over: Partial<StatementMovement> = {}, account = base) =>
      withDedupeHashes({
        ...account,
        movements: [{ ...movement(10, '2026-01-15', -150, 5000), ...over }],
      })[0]?.dedupeHash;

    const variants = [
      one(),
      one({}, { ...base, ibanLast4: '0001' }),
      one({}, { ...base, profileId: 'otro' }),
      one({ opDate: '2026-01-16' }),
      one({ amountCents: -151 }),
      one({ description: 'Otro' }),
      one({ balanceAfterCents: 5001 }),
    ];
    expect(new Set(variants).size).toBe(variants.length);
    expect(one({ row: 99, valueDate: '2026-01-20', reference: 'x' })).toBe(one());
  });
});

describe('checkBalances', () => {
  const chronological = [
    movement(12, '2026-01-02', 500, 1500),
    movement(11, '2026-01-10', -200, 1300),
    movement(10, '2026-01-20', -300, 1000),
  ];

  it('cuadra un extracto descendente o ascendente y deduce el saldo inicial', () => {
    const expected = { balanceMismatchRows: [], openingBalanceCents: 1000 };
    expect(checkBalances([...chronological].reverse())).toEqual(expected);
    expect(checkBalances(chronological)).toEqual(expected);
  });

  it('señala la fila cuyo saldo no encaja con el anterior', () => {
    const broken = chronological.map((m) => (m.row === 11 ? { ...m, balanceAfterCents: 1299 } : m));
    expect(checkBalances([...broken].reverse()).balanceMismatchRows).toEqual([11, 10]);
  });

  it('ordena por saldos cuando todas las fechas coinciden', () => {
    const sameDay = chronological.map((m) => ({ ...m, opDate: '2026-01-02' }));
    expect(checkBalances(sameDay).balanceMismatchRows).toEqual([]);
    expect(checkBalances([...sameDay].reverse()).balanceMismatchRows).toEqual([]);
  });

  it('sin saldos no comprueba nada', () => {
    const noBalances = chronological.map((m) => ({ ...m, balanceAfterCents: null }));
    expect(checkBalances(noBalances)).toEqual({
      balanceMismatchRows: [],
      openingBalanceCents: null,
    });
    expect(checkBalances([])).toEqual({ balanceMismatchRows: [], openingBalanceCents: null });
  });
});

describe('statementPeriod', () => {
  it('da el mes solo si todo el extracto cae en él', () => {
    expect(statementPeriod({ dateFrom: '2026-01-01', dateTo: '2026-01-31' })).toBe('2026-01');
    expect(statementPeriod({ dateFrom: '2025-12-30', dateTo: '2026-01-31' })).toBeNull();
  });
});
