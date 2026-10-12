import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { provideRouter } from '@angular/router';
import { DB_WORKER_FACTORY, DbService } from '@data/db/db-service';
import { FileSaver, type FileToSave } from '@data/files/file-saver';
import { inProcessDbWorker } from '../../../testing/in-process-db-worker';
import { BackupPage } from './backup-page';

describe('BackupPage', () => {
  async function setup(mode: 'demo' | 'local' | 'cerrada' = 'cerrada') {
    const saved: { file: FileToSave; bytes: Uint8Array<ArrayBuffer> }[] = [];
    const saver = {
      cancel: false,
      async save(file: FileToSave, content: () => Promise<Uint8Array<ArrayBuffer>>) {
        if (this.cancel) return false;
        saved.push({ file, bytes: await content() });
        return true;
      },
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: DB_WORKER_FACTORY, useValue: inProcessDbWorker },
        { provide: FileSaver, useValue: saver },
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
    const db = TestBed.inject(DbService);
    if (mode === 'demo') await db.openDemo();
    if (mode === 'local') await db.openLocal();
    const fixture = TestBed.createComponent(BackupPage);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    const settled = async (assertion: () => void) => {
      await vi.waitFor(async () => {
        await fixture.whenStable();
        assertion();
      });
    };
    const button = (name: string) => {
      const found = [...element.querySelectorAll<HTMLButtonElement>('button')].find(
        (b) => text(b) === name,
      );
      if (!found) throw new Error(`Sin botón ${name}`);
      return found;
    };
    const choose = async (file: File) => {
      const input = element.querySelector<HTMLInputElement>('input[type="file"]');
      if (!input) throw new Error('Sin selector de fichero');
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change'));
      await fixture.whenStable();
    };
    const status = () => text(element.querySelector('[role="status"]'));
    const alert = () => text(element.querySelector('[role="alert"]'));
    const dialog = () => document.querySelector('mat-dialog-container');
    const dialogButton = (name: string) => {
      const found = [...(dialog()?.querySelectorAll('button') ?? [])].find((b) => text(b) === name);
      if (!found) throw new Error(`Sin botón ${name} en el diálogo`);
      return found;
    };
    /** Una copia de la demo, como la que descargaría el usuario. */
    const demoCopy = async (name = 'astrofinance-2026-10-01.db') => {
      const source = TestBed.runInInjectionContext(() => new DbService());
      await source.openDemo();
      const bytes = await source.exportFile();
      source.close();
      return new File([bytes], name);
    };

    return {
      db,
      saver,
      saved,
      fixture,
      element,
      settled,
      button,
      choose,
      status,
      alert,
      dialog,
      dialogButton,
      demoCopy,
    };
  }

  const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim();

  it('sin datos del usuario no hay nada que descargar, y lo explica', async () => {
    const { button, element } = await setup('local');

    const download = button('Descargar copia');
    expect(download.disabled).toBe(true);
    const reason = element.querySelector(`#${download.getAttribute('aria-describedby')}`);
    expect(text(reason)).toBe('Todavía no hay datos tuyos que guardar.');
    expect(text(element)).toContain('se pierden al recargar o cerrar la página');
  });

  it('en la demo no se descarga nada, pero se puede cargar una copia', async () => {
    const { button, element } = await setup('demo');

    expect(button('Descargar copia').disabled).toBe(true);
    expect(text(element)).toContain('En el modo demo no hay datos tuyos que guardar.');
    expect(button('Cargar copia…').disabled).toBe(false);
  });

  it('descarga una copia con la fecha en el nombre', async () => {
    const { db, button, saved, settled, status } = await setup('local');
    await db.createCategory({ parentId: null, name: 'Mascotas', color: null });
    await settled(() => expect(button('Descargar copia').disabled).toBe(false));

    button('Descargar copia').click();

    await settled(() =>
      expect(status()).toMatch(/Copia descargada: astrofinance-\d{4}-\d\d-\d\d\.db/),
    );
    expect(saved).toHaveLength(1);
    expect(saved[0]?.file).toMatchObject({
      extension: '.db',
      description: 'Copia de AstroFinance',
    });
    expect(new TextDecoder().decode(saved[0]?.bytes.slice(0, 15))).toBe('SQLite format 3');
  });

  it('si se cancela el diálogo de guardado no anuncia nada', async () => {
    const { db, button, saver, settled, status, alert } = await setup('local');
    await db.createCategory({ parentId: null, name: 'Mascotas', color: null });
    await settled(() => expect(button('Descargar copia').disabled).toBe(false));
    saver.cancel = true;

    button('Descargar copia').click();

    await settled(() => expect(button('Descargar copia').disabled).toBe(false));
    expect(status()).toBe('');
    expect(alert()).toBeUndefined();
  });

  it('carga una copia sin preguntar si no hay nada que perder', async () => {
    const { db, choose, demoCopy, dialog, settled, status, element } = await setup();

    await choose(await demoCopy());

    await settled(() => expect(status()).toContain('Copia cargada: astrofinance-2026-10-01.db.'));
    expect(status()).toMatch(/Movimientos: [1-9]\d*\./);
    expect(dialog()).toBeNull();
    expect(db.mode()).toBe('local');
    expect(await db.periods()).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(element.querySelector('a[href="/movimientos"]')).not.toBeNull();
  });

  it('pide confirmación antes de sustituir datos del usuario', async () => {
    const { db, choose, demoCopy, dialog, dialogButton, settled, status } = await setup('local');
    await db.createCategory({ parentId: null, name: 'Mascotas', color: null });
    const copy = await demoCopy();

    await choose(copy);
    await settled(() => expect(text(dialog())).toContain('¿Sustituir tus datos'));
    expect(text(dialog())).toContain('«astrofinance-2026-10-01.db»');
    dialogButton('Cancelar').click();
    await settled(() => expect(dialog()).toBeNull());
    expect((await db.categoryTree()).at(-1)?.name).toBe('Mascotas');
    expect(status()).toBe('');

    await choose(copy);
    await settled(() => expect(dialog()).not.toBeNull());
    dialogButton('Sustituir').click();
    await settled(() => expect(status()).toContain('Copia cargada'));
    expect((await db.categoryTree()).map((group) => group.name)).not.toContain('Mascotas');
  });

  it('explica por qué no vale un fichero y deja los datos como estaban', async () => {
    const { db, choose, settled, alert } = await setup('demo');

    await choose(new File(['fecha;concepto;importe'], 'extracto.csv'));

    await settled(() =>
      expect(alert()).toBe(
        'El fichero no es una copia de AstroFinance. Tus datos siguen como estaban.',
      ),
    );
    expect(db.mode()).toBe('demo');
    expect((await db.periods()).length).toBe(3);
  });
});
