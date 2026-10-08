import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { DB_WORKER_FACTORY, DbService } from '@data/db/db-service';
import { inProcessDbWorker } from '../../../testing/in-process-db-worker';
import { DemoBanner } from './demo-banner';

describe('DemoBanner', () => {
  async function setup() {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: DB_WORKER_FACTORY, useValue: inProcessDbWorker }],
    });
    const fixture = TestBed.createComponent(DemoBanner);
    await fixture.whenStable();
    return {
      fixture,
      element: fixture.nativeElement as HTMLElement,
      db: TestBed.inject(DbService),
    };
  }

  it('no se muestra fuera de la demo', async () => {
    const { element } = await setup();
    expect(element.querySelector('[role="status"]')).toBeNull();
  });

  it('avisa del modo demo y permite salir', async () => {
    const { fixture, element, db } = await setup();
    await db.openDemo();
    await fixture.whenStable();
    expect(element.textContent).toContain('Modo demo: datos ficticios que no se guardan.');

    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    element.querySelector('button')?.click();
    await fixture.whenStable();

    expect(db.mode()).toBeNull();
    expect(navigate).toHaveBeenCalledWith('/');
    expect(element.querySelector('[role="status"]')).toBeNull();
  });
});
