import { TestBed } from '@angular/core/testing';
import { DB_WORKER_FACTORY, DbService } from '@services/db/db-service';
import { inProcessDbWorker } from '../../../testing/in-process-db-worker';
import { LandingGate } from './landing-gate';

describe('LandingGate', () => {
  function setup() {
    TestBed.configureTestingModule({
      providers: [{ provide: DB_WORKER_FACTORY, useValue: inProcessDbWorker }],
    });
    return { gate: TestBed.inject(LandingGate), db: TestBed.inject(DbService) };
  }

  it('sin BD abierta se queda fuera', () => {
    const { gate } = setup();

    expect(gate.inside()).toBe(false);
    expect(gate.entering()).toBeNull();
  });

  it('no entra hasta que termina de abrir, aunque la BD ya esté lista', async () => {
    const { gate, db } = setup();
    let finish: () => void = () => undefined;

    const entering = gate.enter('archivo', async () => {
      await db.openLocal();
      await new Promise<void>((resolve) => (finish = resolve));
    });
    await vi.waitFor(() => expect(db.ready()).toBe(true));
    expect(gate.entering()).toBe('archivo');
    expect(gate.inside()).toBe(false);

    finish();
    await entering;
    expect(gate.inside()).toBe(true);
  });

  it('no empieza otra entrada mientras hay una en marcha', async () => {
    const { gate, db } = setup();
    const second = vi.fn(() => Promise.resolve());

    const first = gate.enter('demo', () => db.openDemo());
    await gate.enter('vacia', second);
    await first;

    expect(second).not.toHaveBeenCalled();
    expect(db.mode()).toBe('demo');
  });

  it('si falla al abrir sigue fuera y se puede volver a intentar', async () => {
    const { gate } = setup();

    await expect(gate.enter('demo', () => Promise.reject(new Error('no')))).rejects.toThrow();

    expect(gate.entering()).toBeNull();
    expect(gate.inside()).toBe(false);
  });

  it('al cerrar la BD (salir de la demo) vuelve a la landing', async () => {
    const { gate, db } = setup();
    await gate.enter('demo', () => db.openDemo());
    expect(gate.inside()).toBe(true);

    db.close();

    expect(gate.inside()).toBe(false);
  });
});
