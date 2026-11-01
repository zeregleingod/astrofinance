import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { provideRouter } from '@angular/router';
import { BackupService } from '@services/backup/backup-service';
import { DB_WORKER_FACTORY, DbService, type DbWorker } from '@services/db/db-service';
import { setLanguage } from '@ui/texts';
import { inProcessDbWorker } from '../../../testing/in-process-db-worker';
import { LandingGate } from './landing-gate';
import { LandingPage } from './landing-page';

describe('LandingPage (ADR-0029)', () => {
  async function setup(worker: () => DbWorker = inProcessDbWorker) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: DB_WORKER_FACTORY, useValue: worker },
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
    const fixture = TestBed.createComponent(LandingPage);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const settled = async (assertion: () => void) => {
      await vi.waitFor(async () => {
        await fixture.whenStable();
        assertion();
      });
    };
    const button = (name: string) => {
      const found = [...element.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
        text(b).endsWith(name),
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
    /** Una copia de la demo, como la que descargaría el usuario. */
    const demoCopy = async () => {
      const source = TestBed.runInInjectionContext(() => new DbService());
      await source.openDemo();
      const bytes = await source.exportFile();
      source.close();
      return new File([bytes], 'astrofinance-2026-10-01.db');
    };
    return {
      db: TestBed.inject(DbService),
      gate: TestBed.inject(LandingGate),
      element,
      settled,
      button,
      choose,
      demoCopy,
      alert: () => text(element.querySelector('[role="alert"]')),
    };
  }

  it('presenta la aplicación con sus tres formas de entrar', async () => {
    const { element } = await setup();

    expect(text(element.querySelector('h1'))).toBe('Tus finanzas, en tu equipo.');
    const group = element.querySelector('[role="group"]');
    expect(group?.getAttribute('aria-label')).toBe('Cómo empezar');
    expect([...(group?.querySelectorAll('button') ?? [])].map(text)).toEqual([
      'Abrir mi archivo',
      'Ver la demo',
    ]);
    expect(element.querySelector('input[type="file"]')?.getAttribute('accept')).toBe('.db');
    expect(text(element.querySelector('.more button'))).toBe('Empezar sin datos');
  });

  it('enseña el último mes de la demo, descrito como una imagen', async () => {
    const { element } = await setup();

    const art = element.querySelector('figure');
    expect(art?.getAttribute('role')).toBe('img');
    expect(art?.getAttribute('aria-label')).toBe(
      'Ejemplo con los datos de la demo: septiembre de 2026',
    );
    expect([...element.querySelectorAll('.kpis dd')].map(text)).toEqual([
      '1.850,00 €',
      '-808,94 €',
      '200,00 €',
    ]);
    expect([...element.querySelectorAll('.groups .name')].map(text)).toEqual([
      'Hipoteca y vivienda',
      'Préstamos y financiaciones',
      'Variables',
      'Suministros',
    ]);
    // La barra del bloque de más gasto llena su hueco; las demás, en proporción.
    const bars = [...element.querySelectorAll<HTMLProgressElement>('.groups progress')];
    expect(bars[0]?.value).toBe(bars[0]?.max);
    expect(bars[3]?.value).toBe(6500);
  });

  it('cambia de idioma en vivo, también los nombres de la vista previa', async () => {
    const { element, settled } = await setup();

    setLanguage('en');
    try {
      await settled(() =>
        expect(text(element.querySelector('h1'))).toBe('Your finances, on your own computer.'),
      );
      expect(text(element.querySelector('.groups .name'))).toBe('Mortgage and housing');
    } finally {
      setLanguage('es');
    }
  });

  it('«Ver la demo» abre la demo y entra', async () => {
    const { db, gate, button, settled } = await setup();

    button('Ver la demo').click();
    expect(gate.entering()).toBe('demo');

    await settled(() => expect(gate.inside()).toBe(true));
    expect(db.mode()).toBe('demo');
  });

  it('«Empezar sin datos» abre una BD vacía del usuario', async () => {
    const { db, gate, button, settled } = await setup();

    button('Empezar sin datos').click();

    await settled(() => expect(gate.inside()).toBe(true));
    expect(db.mode()).toBe('local');
    expect(db.hasUserData()).toBe(false);
  });

  it('carga el fichero elegido sin preguntar y entra', async () => {
    const { db, gate, choose, demoCopy, settled } = await setup();

    await choose(await demoCopy());

    await settled(() => expect(gate.inside()).toBe(true));
    expect(db.mode()).toBe('local');
    expect(db.hasUserData()).toBe(true);
    // El resultado ya se ha anunciado: no se queda para la página de copias.
    expect(TestBed.inject(BackupService).notice()).toBeNull();
  });

  it('un fichero que no vale se explica y no deja ninguna BD abierta', async () => {
    const { db, gate, choose, alert, settled } = await setup();

    await choose(new File(['no es sqlite'], 'notas.db'));

    await settled(() => expect(alert()).toBe('El fichero no es una copia de AstroFinance.'));
    expect(db.status()).toBe('cerrada');
    expect(gate.inside()).toBe(false);
  });

  it('si la demo no se abre lo dice y se queda en la landing', async () => {
    // El navegador no puede crear el worker de la BD.
    const broken = (): DbWorker => {
      throw new Error('Sin worker');
    };
    const { gate, button, alert, settled } = await setup(broken);

    button('Ver la demo').click();

    await settled(() => expect(alert()).toBe('No se ha podido abrir la demo.'));
    expect(gate.inside()).toBe(false);
  });
});

function text(element: Element | null | undefined): string {
  return element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}
