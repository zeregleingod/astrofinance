import {
  MAX_STATEMENT_BYTES,
  MAX_STATEMENT_ROWS,
  StatementError,
} from '@domain/imports/bank-statement';
import { utils, write } from 'xlsx';
import {
  SABADELL_HOLDER,
  SABADELL_IBAN,
  SABADELL_ROWS,
  sabadellSheet,
} from '../../../testing/sabadell-sheet';
import { createImportHandlers } from './import-handlers';
import { readSheet } from './read-sheet';

type BookType = 'biff8' | 'xlsx' | 'csv';

/** Un fichero real en memoria, con las celdas combinadas del preámbulo del banco. */
function file(bookType: BookType, rows: readonly (readonly unknown[])[] = sabadellSheet()) {
  const sheet = utils.aoa_to_sheet(rows.map((row) => [...row]));
  sheet['!merges'] = [
    { s: { c: 0, r: 0 }, e: { c: 1, r: 0 } },
    { s: { c: 0, r: 2 }, e: { c: 6, r: 2 } },
  ];
  const book = utils.book_new();
  utils.book_append_sheet(book, sheet, 'Hoja1');
  return new Uint8Array(write(book, { bookType, type: 'array' }) as ArrayBuffer);
}

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    if (error instanceof StatementError) return error.code;
    throw error;
  }
  return undefined;
};

describe('readSheet', () => {
  it.each<BookType>(['biff8', 'xlsx'])('lee un %s con textos, números y celdas vacías', (type) => {
    const sheet = readSheet(file(type));

    expect(sheet).toHaveLength(sabadellSheet().length);
    expect(sheet[8]).toEqual(sabadellSheet()[8]);
    expect(sheet[9]?.slice(0, 5)).toEqual(SABADELL_ROWS[0]?.slice(0, 5));
    expect(sheet[16]?.[1]).toBe('ABONO PROMOCIÓN');
    expect(sheet[2]?.every((cell) => cell === null)).toBe(true);
  });

  it('decide el tipo por el contenido: un CSV queda como texto sin interpretar', () => {
    const csv = new TextEncoder().encode(
      'F. Operativa;Concepto;Importe\n30/01/2026;Recibo de la luz;-1.234,56\n',
    );
    expect(readSheet(csv)).toEqual([
      ['F. Operativa', 'Concepto', 'Importe'],
      ['30/01/2026', 'Recibo de la luz', '-1.234,56'],
    ]);
  });

  it('lee un CSV en Windows-1252', () => {
    const latin1 = Uint8Array.from('Concepto\nABONO PROMOCIÓN\n', (char) => char.charCodeAt(0));
    expect(readSheet(latin1)[1]).toEqual(['ABONO PROMOCIÓN']);
  });

  it('no evalúa ni devuelve fórmulas', () => {
    const sheet = utils.aoa_to_sheet([['Importe'], [1]]);
    sheet['A2'] = { t: 'n', f: '1+1', v: 2 };
    sheet['B2'] = { t: 's', f: 'HYPERLINK("http://example.invalid")', v: 'enlace' };
    sheet['!ref'] = 'A1:B2';
    const book = utils.book_new();
    utils.book_append_sheet(book, sheet, 'Hoja1');
    const bytes = new Uint8Array(write(book, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer);

    expect(readSheet(bytes)).toEqual([
      ['Importe', null],
      [2, 'enlace'],
    ]);
  });

  it('rechaza ficheros vacíos, enormes, binarios o corruptos', () => {
    expect(code(() => readSheet(new Uint8Array()))).toBe('fichero-vacio');
    expect(code(() => readSheet(new Uint8Array(MAX_STATEMENT_BYTES + 1)))).toBe(
      'fichero-demasiado-grande',
    );
    expect(code(() => readSheet(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 1, 2])))).toBe(
      'fichero-ilegible',
    );
    // Cabecera de zip sin un libro dentro: un binario disfrazado de .xlsx.
    expect(code(() => readSheet(Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 9, 9, 9, 9])))).toBe(
      'fichero-ilegible',
    );
  });

  it('rechaza hojas con demasiadas filas', () => {
    const rows = Array.from({ length: MAX_STATEMENT_ROWS + 5 }, (_, i) => [i]);
    expect(code(() => readSheet(file('xlsx', rows)))).toBe('fichero-demasiado-grande');
  });
});

describe('readStatement', () => {
  const { readStatement } = createImportHandlers();

  it('convierte el fichero del banco en un extracto listo para revisar', async () => {
    const bytes = file('biff8');
    const statement = await readStatement({
      name: 'C:\\Descargas\\01_BS_ENERO.xls',
      bytes: bytes.buffer,
    });

    expect(statement).toMatchObject({
      fileName: '01_BS_ENERO.xls',
      profileId: 'sabadell',
      ibanLast4: '4321',
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
      errors: [],
      balanceMismatchRows: [],
      openingBalanceCents: 100000,
    });
    expect(statement.fileSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(statement.movements).toHaveLength(SABADELL_ROWS.length);
    expect(statement.movements[5]).toMatchObject({
      opDate: '2026-01-09',
      description: 'ADEUDO RECIBO LUZ DEMO',
      amountCents: -6909,
      balanceAfterCents: 101449,
    });

    const json = JSON.stringify(statement);
    expect(json).not.toContain(SABADELL_HOLDER);
    expect(json).not.toContain(SABADELL_IBAN);
  });

  it('el mismo fichero da siempre las mismas huellas', async () => {
    const hashes = async () =>
      (await readStatement({ name: 'a.xls', bytes: file('biff8').buffer })).movements.map(
        (m) => m.dedupeHash,
      );
    expect(await hashes()).toEqual(await hashes());
  });

  it('rechaza parámetros que no son un fichero', () => {
    const bad = { name: 'a.xls', bytes: 'no soy un buffer' } as unknown as Parameters<
      typeof readStatement
    >[0];
    expect(code(() => readStatement(bad))).toBe('fichero-ilegible');
    expect(code(() => readStatement(undefined as unknown as typeof bad))).toBe('fichero-ilegible');
  });

  it('usa un nombre genérico si no llega ninguno', async () => {
    const statement = await readStatement({ name: '  ', bytes: file('xlsx').buffer });
    expect(statement.fileName).toBe('extracto');
  });
});
