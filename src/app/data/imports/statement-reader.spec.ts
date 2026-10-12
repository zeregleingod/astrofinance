import { TestBed } from '@angular/core/testing';
import { MAX_STATEMENT_BYTES, statementErrorCode } from '@domain/imports/bank-statement';
import { inProcessImportWorker, sabadellFile } from '../../../testing/in-process-import-worker';
import type { InProcessWorker } from '../../../testing/in-process-worker';
import { IMPORT_WORKER_FACTORY, StatementReader } from './statement-reader';

describe('StatementReader', () => {
  function setup() {
    const created: InProcessWorker[] = [];
    TestBed.configureTestingModule({
      providers: [
        {
          provide: IMPORT_WORKER_FACTORY,
          useValue: () => {
            const worker = inProcessImportWorker();
            created.push(worker);
            return worker;
          },
        },
      ],
    });
    return { reader: TestBed.inject(StatementReader), created };
  }

  const failure = (promise: Promise<unknown>) =>
    promise.then(
      () => undefined,
      (error: unknown) => statementErrorCode(error),
    );

  it('lee el extracto en un worker que se destruye al terminar', async () => {
    const { reader, created } = setup();

    const statement = await reader.read(sabadellFile());

    expect(statement).toMatchObject({
      fileName: 'enero.xls',
      profileId: 'sabadell',
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
    });
    expect(statement.movements).toHaveLength(8);
    expect(created).toHaveLength(1);
    expect(created[0]?.terminated()).toBe(true);
  });

  it('devuelve el motivo si el fichero no es un extracto, y también destruye el worker', async () => {
    const { reader, created } = setup();

    expect(await failure(reader.read(sabadellFile([['Fecha', 'Texto']])))).toBe(
      'formato-desconocido',
    );
    expect(await failure(reader.read(new File([], 'vacio.xls')))).toBe('fichero-vacio');
    expect(created.map((worker) => worker.terminated())).toEqual([true, true]);
  });

  it('no llega a leer un fichero demasiado grande', async () => {
    const { reader, created } = setup();
    const huge = new File([new Uint8Array(MAX_STATEMENT_BYTES + 1)], 'enorme.xls');

    expect(await failure(reader.read(huge))).toBe('fichero-demasiado-grande');
    expect(created).toHaveLength(0);
  });
});
