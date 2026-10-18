import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { Router, provideRouter } from '@angular/router';
import { DB_WORKER_FACTORY, DbService } from '@data/db/db-service';
import { FileSaver, type FileToSave } from '@data/files/file-saver';
import { inProcessDbWorker } from '../../../testing/in-process-db-worker';
import { BackupQuickActions } from './backup-quick-actions';

describe('BackupQuickActions', () => {
  async function setup(mode: 'demo' | 'local' | 'cerrada' = 'cerrada') {
    const saved: FileToSave[] = [];
    const saver = {
      async save(file: FileToSave, content: () => Promise<Uint8Array<ArrayBuffer>>) {
        await content();
        saved.push(file);
        return true;
      },
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'movimientos', children: [] }]),
        { provide: DB_WORKER_FACTORY, useValue: inProcessDbWorker },
        { provide: FileSaver, useValue: saver },
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
    const db = TestBed.inject(DbService);
    if (mode === 'demo') await db.openDemo();
    if (mode === 'local') await db.openLocal();
    const fixture = TestBed.createComponent(BackupQuickActions);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    const settled = async (assertion: () => void) => {
      await vi.waitFor(async () => {
        await fixture.whenStable();
        assertion();
      });
    };
    const button = (label: string) => {
      const found = element.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
      if (!found) throw new Error(`Sin botón ${label}`);
      return found;
    };
    const choose = async (file: File) => {
      const input = element.querySelector<HTMLInputElement>('input[type="file"]');
      if (!input) throw new Error('Sin selector de fichero');
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change'));
      await fixture.whenStable();
    };
    const snackBar = () => text(document.querySelector('mat-snack-bar-container'));
    const snackBarButton = () =>
      document.querySelector<HTMLButtonElement>('mat-snack-bar-container button');
    const demoCopy = async () => {
      const source = TestBed.runInInjectionContext(() => new DbService());
      await source.openDemo();
      const bytes = await source.exportFile();
      source.close();
      return new File([bytes], 'astrofinance-2026-10-01.db');
    };

    return { db, saved, settled, button, choose, snackBar, snackBarButton, demoCopy };
  }

  const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim();

  it('sin datos del usuario la descarga está bloqueada y la carga no', async () => {
    const { button } = await setup('demo');

    expect(button('Descargar una copia').getAttribute('aria-disabled')).toBe('true');
    expect(button('Cargar una copia').getAttribute('aria-disabled')).not.toBe('true');
  });

  it('descarga una copia y lo anuncia', async () => {
    const { db, button, saved, settled, snackBar } = await setup('local');
    await db.createCategory({ parentId: null, name: 'Mascotas', color: null });
    await settled(() =>
      expect(button('Descargar una copia').getAttribute('aria-disabled')).not.toBe('true'),
    );

    button('Descargar una copia').click();

    await settled(() =>
      expect(snackBar()).toMatch(/Copia descargada: astrofinance-\d{4}-\d\d-\d\d\.db/),
    );
    expect(saved).toHaveLength(1);
  });

  it('carga una copia y ofrece ir a los movimientos', async () => {
    const { db, choose, demoCopy, settled, snackBar, snackBarButton } = await setup();

    await choose(await demoCopy());

    await settled(() => expect(snackBar()).toContain('Copia cargada: astrofinance-2026-10-01.db.'));
    expect(db.mode()).toBe('local');
    snackBarButton()?.click();
    await settled(() => expect(TestBed.inject(Router).url).toBe('/movimientos'));
  });

  it('avisa si el fichero no es una copia y deja los datos como estaban', async () => {
    const { db, choose, settled, snackBar } = await setup('demo');

    await choose(new File(['fecha;concepto;importe'], 'extracto.csv'));

    await settled(() =>
      expect(snackBar()).toContain(
        'El fichero no es una copia de AstroFinance. Tus datos siguen como estaban.',
      ),
    );
    expect(db.mode()).toBe('demo');
  });
});
