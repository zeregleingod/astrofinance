import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DB_WORKER_FACTORY, DbService } from '@services/db/db-service';
import { IMPORT_WORKER_FACTORY } from '@services/import/statement-reader';
import { inProcessDbWorker } from '../../../testing/in-process-db-worker';
import { inProcessImportWorker, sabadellFile } from '../../../testing/in-process-import-worker';
import { sabadellSheet } from '../../../testing/sabadell-sheet';
import { ImportPage } from './import-page';

describe('ImportPage', () => {
  async function setup() {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: DB_WORKER_FACTORY, useValue: inProcessDbWorker },
        { provide: IMPORT_WORKER_FACTORY, useValue: inProcessImportWorker },
      ],
    });
    const db = TestBed.inject(DbService);
    const fixture = TestBed.createComponent(ImportPage);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    const settled = async (assertion: () => void) => {
      await vi.waitFor(async () => {
        await fixture.whenStable();
        assertion();
      });
    };
    const choose = async (file: File) => {
      const input = element.querySelector<HTMLInputElement>('input[type="file"]');
      if (!input) throw new Error('Sin selector de fichero');
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change'));
      await settled(() => expect(element.querySelector('mat-progress-bar')).toBeNull());
    };
    const rows = () => [...element.querySelectorAll('tbody tr')];
    const row = (concept: string) => {
      const found = rows().find((r) => r.querySelector(`[aria-label="Concepto: ${concept}"]`));
      if (!found) throw new Error(`Sin fila para ${concept}`);
      return found;
    };
    const field = (concept: string, label: string) => {
      const control = row(concept).querySelector<HTMLInputElement | HTMLSelectElement>(
        `[aria-label="${label}: ${concept}"]`,
      );
      if (!control) throw new Error(`Sin campo ${label}`);
      return control;
    };
    const type = async (concept: string, label: string, value: string) => {
      const control = field(concept, label);
      control.value = value;
      control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? 'change' : 'input'));
      await fixture.whenStable();
    };
    const button = (name: string) =>
      [...element.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
        text(b)?.startsWith(name),
      );
    const summary = () =>
      Object.fromEntries(
        [...element.querySelectorAll('.summary div')].map((div) => [
          text(div.querySelector('dt')),
          Number(text(div.querySelector('dd'))),
        ]),
      );
    return { db, fixture, element, settled, choose, rows, row, field, type, button, summary };
  }

  const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim();

  const LUZ = 'ADEUDO RECIBO LUZ DEMO';
  const NOMINA = 'NOMINA DE EMPRESA DEMO SL';

  it('pide un fichero y avisa de que nada se guarda hasta confirmar', async () => {
    const { element, db } = await setup();

    expect(text(element)).toContain('hasta que pulses «Guardar» no se guarda nada');
    expect(text(element)).toContain('Bancos admitidos: Banc Sabadell');
    expect(element.querySelector('input[type="file"]')?.getAttribute('accept')).toBe(
      '.xls,.xlsx,.csv',
    );
    expect(element.querySelector('table')).toBeNull();
    expect(db.status()).toBe('cerrada');
  });

  it('en la demo no deja importar', async () => {
    const { element, db, fixture } = await setup();
    await db.openDemo();
    await fixture.whenStable();

    expect(text(element)).toContain('En el modo demo no se pueden importar extractos');
    expect(element.querySelector('input[type="file"]')).toBeNull();
  });

  it('detecta el mes y muestra los movimientos sin haber guardado nada', async () => {
    const { element, db, choose, rows, field, summary } = await setup();

    await choose(sabadellFile());

    expect(text(element.querySelector('h3'))).toBe('Extracto de enero de 2026');
    expect(text(element)).toContain('Cuenta: Banc Sabadell ·4321 — Fichero: enero.xls');
    expect(summary()).toEqual({
      Movimientos: 8,
      'Se guardarán': 8,
      'Ya guardados': 0,
      Descartados: 0,
      'Por corregir': 0,
    });
    expect(rows()).toHaveLength(8);
    expect(text(rows()[1]?.querySelector('td.date'))).toBe('30/01/2026');
    expect(field(LUZ, 'Concepto').value).toBe(LUZ);
    expect(field(LUZ, 'Importe').value).toBe('-69,09');
    expect(rows().every((r) => text(r.querySelector('.badge')) === 'Nuevo')).toBe(true);

    expect(db.mode()).toBe('local');
    expect(await db.periods()).toEqual([]);
    expect([...field(LUZ, 'Categoría').querySelectorAll('option')].map(text).slice(0, 3)).toEqual([
      'Sin categoría',
      'Ingresos › Nómina',
      'Ingresos › Ingresos extra',
    ]);
  });

  it('guarda lo revisado: conceptos, importes, categoría, observaciones y descartes', async () => {
    const { element, db, choose, type, field, row, button, summary, settled } = await setup();
    await choose(sabadellFile());

    await type(LUZ, 'Concepto', 'Luz de enero');
    await type(LUZ, 'Importe', '-70');
    await type(LUZ, 'Observaciones', 'Revisar la tarifa');
    const salary = [...field(NOMINA, 'Categoría').querySelectorAll('option')].find(
      (option) => text(option) === 'Ingresos › Nómina',
    );
    await type(NOMINA, 'Categoría', salary?.value ?? '');
    field('ABONO PROMOCIÓN', 'Guardar').click();
    await settled(() => expect(summary()['Descartados']).toBe(1));

    expect(text(row(LUZ).querySelector('.badge'))).toBe('Editado');
    expect(text(row(LUZ).querySelector('.original'))).toBe(`Banco: ${LUZ}`);
    expect(text(row('ABONO PROMOCIÓN').querySelector('.badge'))).toBe('Descartado');
    expect(field('ABONO PROMOCIÓN', 'Concepto').disabled).toBe(true);
    expect(text(button('Guardar'))).toContain('(7)');

    button('Guardar')?.click();
    await settled(() => expect(text(element)).toContain('Movimientos guardados: 7.'));

    expect(text(element)).toContain('Cuenta: Banc Sabadell ·4321.');
    const link = element.querySelector<HTMLAnchorElement>('a[href^="/movimientos"]');
    expect(link?.getAttribute('href')).toBe('/movimientos?mes=2026-01');

    const saved = await db.transactions('2026-01');
    expect(saved).toHaveLength(7);
    expect(saved.find((tx) => tx.description === 'Luz de enero')).toMatchObject({
      amountCents: -7000,
      note: 'Revisar la tarifa',
      accountName: 'Banc Sabadell ·4321',
    });
    expect(saved.find((tx) => tx.description === NOMINA)).toMatchObject({
      categoryName: 'Ingresos',
      subcategoryName: 'Nómina',
    });
    expect(saved.some((tx) => tx.description === 'ABONO PROMOCIÓN')).toBe(false);
  });

  it('propone la categoría por las reglas y por los movimientos parecidos ya guardados', async () => {
    const { element, db, choose, type, field, row, button, settled } = await setup();
    const CAFE = 'COMPRA TARJ. 4000XXXXXXXX0001 CAFETERIA DEMO-BARCELONA';
    await db.openLocal();
    const options = await db.categoryOptions();
    const idOf = (label: string) => String(options.find((o) => o.label === label)?.id);
    await db.createRule({
      operator: 'contiene',
      pattern: 'LUZ',
      categoryId: Number(idOf('Suministros › Luz')),
    });

    // Un extracto anterior en el que el usuario clasificó la cafetería a mano.
    await choose(
      sabadellFile(
        sabadellSheet([
          ['20/12/2025', 'COMPRA TARJ. 4000XXXXXXXX0001 CAFETERIA DEMO-SANTS', '20/12/2025', -2],
        ]),
        'diciembre.xls',
      ),
    );
    await type(
      'COMPRA TARJ. 4000XXXXXXXX0001 CAFETERIA DEMO-SANTS',
      'Categoría',
      idOf('Variables › Restaurantes'),
    );
    button('Guardar')?.click();
    await settled(() => expect(text(element)).toContain('Movimientos guardados: 1.'));
    button('Importar otro extracto')?.click();
    await settled(() => expect(element.querySelector('input[type="file"]')).not.toBeNull());

    await choose(sabadellFile());

    expect(field(LUZ, 'Categoría').value).toBe(idOf('Suministros › Luz'));
    expect(text(row(LUZ).querySelector('.suggested'))).toBe('Propuesta por una regla');
    expect(field(CAFE, 'Categoría').value).toBe(idOf('Variables › Restaurantes'));
    expect(text(row(CAFE).querySelector('.suggested'))).toBe('Sugerida por movimientos parecidos');
    expect(field(CAFE, 'Categoría').getAttribute('aria-describedby')).toBe(
      row(CAFE).querySelector('.suggested')?.id,
    );
    expect(field(NOMINA, 'Categoría').value).toBe('');
    expect(row(NOMINA).querySelector('.suggested')).toBeNull();
    expect(text(element)).toContain(
      'Categorías propuestas: 1 por tus reglas · 2 por movimientos parecidos.',
    );

    // Cambiar la propuesta la hace del usuario: deja de marcarse como propuesta.
    await type(LUZ, 'Categoría', idOf('Variables › Hogar'));
    expect(row(LUZ).querySelector('.suggested')).toBeNull();
    expect(field(LUZ, 'Categoría').hasAttribute('aria-describedby')).toBe(false);
    expect(text(element)).toContain('Categorías propuestas: 0 por tus reglas');

    button('Guardar')?.click();
    await settled(() => expect(text(element)).toContain('Movimientos guardados: 8.'));
    const saved = await db.transactions('2026-01');
    expect(saved.filter((tx) => tx.subcategoryName === 'Restaurantes')).toHaveLength(2);
    expect(saved.find((tx) => tx.description === LUZ)?.subcategoryName).toBe('Hogar');
  });

  it('restaura el concepto y el importe del banco', async () => {
    const { choose, type, field, row, fixture } = await setup();
    await choose(sabadellFile());
    await type(LUZ, 'Concepto', 'Otra cosa');
    await type(LUZ, 'Importe', '-1,00');

    row(LUZ).querySelector<HTMLButtonElement>('button.restore')?.click();
    await fixture.whenStable();

    expect(field(LUZ, 'Concepto').value).toBe(LUZ);
    expect(field(LUZ, 'Importe').value).toBe('-69,09');
    expect(row(LUZ).querySelector('.original')).toBeNull();
  });

  it('no deja guardar mientras haya un dato no válido', async () => {
    const { element, db, choose, type, field, row, button, summary } = await setup();
    await choose(sabadellFile());

    await type(LUZ, 'Importe', 'sesenta');
    await type(NOMINA, 'Concepto', '  ');

    expect(field(LUZ, 'Importe').getAttribute('aria-invalid')).toBe('true');
    expect(field(LUZ, 'Importe').getAttribute('aria-describedby')).toBe('field-help');
    expect(field(NOMINA, 'Concepto').getAttribute('aria-invalid')).toBe('true');
    expect(text(row(LUZ).querySelector('.badge'))).toBe('Revisar');
    expect(summary()).toMatchObject({ 'Se guardarán': 6, 'Por corregir': 2 });
    expect(text(element.querySelector('#field-help'))).toContain('Corrige los movimientos');
    expect(button('Guardar')?.disabled).toBe(true);

    button('Guardar')?.click();
    expect(await db.periods()).toEqual([]);

    await type(LUZ, 'Importe', '-60,00');
    await type(NOMINA, 'Concepto', 'Nómina');
    expect(field(LUZ, 'Importe').getAttribute('aria-invalid')).toBe('false');
    expect(button('Guardar')?.disabled).toBe(false);
  });

  it('al reimportar el mismo extracto no hay nada nuevo que guardar', async () => {
    const { element, db, choose, rows, button, summary, settled, field } = await setup();
    await choose(sabadellFile());
    button('Guardar')?.click();
    await settled(() => expect(text(element)).toContain('Movimientos guardados: 8.'));

    button('Importar otro extracto')?.click();
    await settled(() => expect(element.querySelector('input[type="file"]')).not.toBeNull());
    await choose(sabadellFile());

    expect(summary()).toMatchObject({ 'Se guardarán': 0, 'Ya guardados': 8 });
    expect(rows().every((r) => text(r.querySelector('.badge')) === 'Ya guardado')).toBe(true);
    expect(field(LUZ, 'Guardar').disabled).toBe(true);
    expect(text(element)).toContain('No hay ningún movimiento nuevo que guardar.');
    expect(button('Guardar')?.disabled).toBe(true);
    expect(await db.transactions('2026-01')).toHaveLength(8);
  });

  it('cancelar descarta la revisión sin guardar nada', async () => {
    const { element, db, choose, button, fixture } = await setup();
    await choose(sabadellFile());

    button('Cancelar')?.click();
    await fixture.whenStable();

    expect(element.querySelector('table')).toBeNull();
    expect(element.querySelector('input[type="file"]')).not.toBeNull();
    expect(await db.periods()).toEqual([]);
  });

  it('explica por qué no se puede leer un fichero y deja elegir otro', async () => {
    const { element, choose } = await setup();

    await choose(sabadellFile([['Fecha', 'Texto']], 'otro.xls'));

    expect(text(element.querySelector('[role="alert"]'))).toContain(
      'No se reconoce el formato del fichero',
    );
    expect(element.querySelector('table')).toBeNull();
    expect(element.querySelector('input[type="file"]')).not.toBeNull();
  });

  it('avisa de las filas ilegibles y de los saldos que no cuadran', async () => {
    const { element, choose, summary } = await setup();
    const sheet = [
      ['F. Operativa', 'Concepto', 'Importe', 'Saldo'],
      ['12/01/2026', 'Tercero', -10, 70],
      ['11/01/2026', 'Segundo', -10, 85],
      ['10/01/2026', 'Sin importe', 'n/d', 90],
      ['05/02/2026', 'Primero', -10, 90],
    ];

    await choose(sabadellFile(sheet));

    expect(text(element.querySelector('h3'))).toBe('Extracto del 11/01/2026 al 05/02/2026');
    expect(summary()['Movimientos']).toBe(3);
    expect(text(element)).toContain('no se importarán: fila 4 (importe).');
    expect(text(element)).toContain('Los saldos no cuadran en estas filas del fichero');
  });
});
