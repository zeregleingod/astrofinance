import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { Router, provideRouter } from '@angular/router';
import { DB_WORKER_FACTORY, DbService } from '@services/db/db-service';
import { inProcessDbWorker } from '../../../testing/in-process-db-worker';
import { ExitButton } from './exit-button';

describe('ExitButton (ADR-0031)', () => {
  async function setup() {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: DB_WORKER_FACTORY, useValue: inProcessDbWorker },
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
    const fixture = TestBed.createComponent(ExitButton);
    const db = TestBed.inject(DbService);
    await db.openLocal();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const dialog = () => document.querySelector<HTMLElement>('[role="alertdialog"]');
    const dialogButton = (name: string) => {
      const found = [...(dialog()?.querySelectorAll('button') ?? [])].find(
        (button) => button.textContent?.trim() === name,
      );
      if (!found) throw new Error(`Sin botón ${name} en el diálogo`);
      return found;
    };
    const settled = async (assertion: () => void) => {
      await vi.waitFor(async () => {
        await fixture.whenStable();
        assertion();
      });
    };
    return { fixture, element, db, dialog, dialogButton, settled };
  }

  it('avisa de que se cierra la aplicación y se pierde lo no guardado; cancelar no sale', async () => {
    const { element, db, dialog, dialogButton, settled } = await setup();

    element.querySelector('button')?.click();
    await settled(() => expect(dialog()).not.toBeNull());

    expect(dialog()?.textContent).toContain('¿Salir de AstroFinance?');
    expect(dialog()?.textContent).toContain(
      'Se cerrarán tus datos y volverás a la pantalla de inicio.',
    );
    expect(dialog()?.textContent).toContain(
      'Todo lo que no esté guardado en una copia descargada se perderá.',
    );
    dialogButton('Cancelar').click();
    await settled(() => expect(dialog()).toBeNull());
    expect(db.ready()).toBe(true);
  });

  it('con cambios sin descargar lo dice; al confirmar cierra los datos y vuelve al inicio', async () => {
    const { element, db, dialog, dialogButton, settled } = await setup();
    await db.createCategory({ parentId: null, name: 'Mascotas', color: null });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');

    element.querySelector('button')?.click();
    await settled(() =>
      expect(dialog()?.textContent).toContain(
        'Tienes cambios sin descargar: si sales, se perderán.',
      ),
    );
    dialogButton('Salir').click();

    await settled(() => expect(db.ready()).toBe(false));
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('en el menú plegado es solo el icono, con su nombre', async () => {
    const { fixture, element } = await setup();
    fixture.componentRef.setInput('rail', true);
    await fixture.whenStable();

    expect(element.querySelector('button[aria-label="Salir"]')).not.toBeNull();
  });
});
