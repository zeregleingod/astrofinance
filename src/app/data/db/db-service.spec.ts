import { TestBed } from '@angular/core/testing';
import { inProcessDbWorker } from '../../../testing/in-process-db-worker';
import { DB_WORKER_FACTORY, DbService, type DbWorker } from './db-service';

describe('DbService', () => {
  function setup(factory: () => DbWorker = inProcessDbWorker) {
    const created: DbWorker[] = [];
    TestBed.configureTestingModule({
      providers: [
        {
          provide: DB_WORKER_FACTORY,
          useValue: () => {
            const worker = factory();
            created.push(worker);
            return worker;
          },
        },
      ],
    });
    return { db: TestBed.inject(DbService), created };
  }

  it('empieza cerrada y sin modo', () => {
    const { db, created } = setup();
    expect(db.status()).toBe('cerrada');
    expect(db.mode()).toBeNull();
    expect(created).toHaveLength(0);
  });

  it('abre la demo en un worker y permite consultarla', async () => {
    const { db } = setup();
    const opening = db.openDemo();
    expect(db.status()).toBe('abriendo');
    await opening;

    expect(db.status()).toBe('lista');
    expect(db.mode()).toBe('demo');
    expect(await db.periods()).toEqual(['2026-07', '2026-08', '2026-09']);
    expect((await db.monthReport('2026-09')).period).toBe('2026-09');
    expect((await db.transactions('2026-09')).length).toBeGreaterThan(0);
  });

  it('no crea dos workers si se pide abrir la demo dos veces a la vez', async () => {
    const { db, created } = setup();
    await Promise.all([db.openDemo(), db.openDemo()]);
    await db.openDemo();
    expect(created).toHaveLength(1);
  });

  it('al cerrar termina el worker, cambia la versión de datos y rechaza consultas', async () => {
    const { db, created } = setup();
    await db.openDemo();
    const version = db.dataVersion();

    db.close();

    expect(db.status()).toBe('cerrada');
    expect(db.mode()).toBeNull();
    expect(db.dataVersion()).toBeGreaterThan(version);
    expect((created[0] as ReturnType<typeof inProcessDbWorker>).terminated()).toBe(true);
    await expect(db.periods()).rejects.toThrow(/ninguna base de datos/);
  });

  it('pasa a error si el worker no puede abrir la demo', async () => {
    const { db } = setup(() => ({
      postMessage: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      terminate: () => undefined,
    }));
    vi.useFakeTimers();
    const opening = db.openDemo();
    vi.advanceTimersByTime(60_000);
    await expect(opening).rejects.toThrow();
    vi.useRealTimers();
    expect(db.status()).toBe('error');
    expect(db.mode()).toBeNull();
  });
});
