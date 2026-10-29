import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { DB_WORKER_FACTORY, DbService } from '@data/db/db-service';
import type { ImportRowInput } from '@domain/imports/import-batch';
import { inProcessDbWorker } from '../../../testing/in-process-db-worker';
import { ConceptRulesPage } from './concept-rules-page';

describe('ConceptRulesPage', () => {
  /** Movimiento importado con su concepto del banco. */
  const row = (description: string, day: number): ImportRowInput => ({
    opDate: `2026-01-${String(day).padStart(2, '0')}`,
    valueDate: null,
    amountCents: -1000 * day,
    balanceAfterCents: null,
    description,
    originalDescription: description,
    descriptionSource: 'banco',
    note: null,
    bankReference: null,
    categoryId: null,
    categorySource: 'ninguna',
    ruleId: null,
    dedupeHash: String(day).repeat(64).slice(0, 64),
  });

  async function setup() {
    TestBed.configureTestingModule({
      providers: [
        { provide: DB_WORKER_FACTORY, useValue: inProcessDbWorker },
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
    const db = TestBed.inject(DbService);
    await db.openLocal();
    await db.commitImport({
      profileId: 'demo',
      institution: 'Banco Demo',
      ibanLast4: '1234',
      fileName: 'enero.xls',
      fileSha256: 'f'.repeat(64),
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
      openingBalanceCents: 0,
      rows: [
        row('TRANSFERENCIA ES12 3456 ALQUILER', 1),
        row('AMAZON-192903812-022', 2),
        row('AMAZON-55-1', 3),
      ],
      duplicateCount: 0,
      errorCount: 0,
    });
    const fixture = TestBed.createComponent(ConceptRulesPage);
    const element = fixture.nativeElement as HTMLElement;

    const settled = async (assertion: () => void) => {
      await vi.waitFor(async () => {
        await fixture.whenStable();
        assertion();
      });
    };
    /** Las reglas de la tabla como [condición, texto, sustitución, movimientos]. */
    const rules = () =>
      [...element.querySelectorAll('table.rules tbody tr:not(.editing)')].map((tr) =>
        [...tr.querySelectorAll('td, th')].slice(0, 4).map((cell) => text(cell)),
      );
    /** Los cambios propuestos como [concepto actual, concepto nuevo]. */
    const changes = () =>
      [...element.querySelectorAll('.preview tbody tr')].map((tr) => {
        const cells = [...tr.querySelectorAll('td, th')].map((cell) => text(cell));
        return [cells[1], cells[2]];
      });
    const button = (name: string) => {
      const found = [...element.querySelectorAll<HTMLButtonElement>('button')].find(
        (b) => b.getAttribute('aria-label') === name || text(b)?.startsWith(name),
      );
      if (!found) throw new Error(`Sin botón ${name}`);
      return found;
    };
    /** Un campo (del formulario de alta o del editor de la fila) por su nombre accesible. */
    const field = (label: string) => {
      const labelled = [...element.querySelectorAll('label')].find(
        (l) => text(l.querySelector('span')) === label,
      );
      const control =
        labelled?.querySelector<HTMLInputElement | HTMLSelectElement>('input, select') ??
        element.querySelector<HTMLInputElement | HTMLSelectElement>(`[aria-label="${label}"]`);
      if (!control) throw new Error(`Sin campo ${label}`);
      return control;
    };
    const fill = async (label: string, value: string) => {
      const control = field(label);
      control.value = value;
      control.dispatchEvent(new Event('input', { bubbles: true }));
      control.dispatchEvent(new Event('change', { bubbles: true }));
      await fixture.whenStable();
    };
    /** Elige en un desplegable la opción con ese texto. */
    const pick = async (label: string, option: string) => {
      const found = [...field(label).querySelectorAll('option')].find((o) => text(o) === option);
      if (!found) throw new Error(`Sin opción ${option}`);
      await fill(label, found.value);
    };
    const submit = async () => {
      element.querySelector<HTMLButtonElement>('.fields button[type="submit"]')?.click();
      await fixture.whenStable();
    };
    const status = () => text(element.querySelector('.done[role="status"]'));
    const alerts = () => [...element.querySelectorAll('.alert')].map((a) => text(a));
    const dialog = () => document.querySelector('mat-dialog-container');
    const dialogButton = (name: string) => {
      const found = [...(dialog()?.querySelectorAll('button') ?? [])].find((b) => text(b) === name);
      if (!found) throw new Error(`Sin botón ${name} en el diálogo`);
      return found;
    };
    /** Da de alta una regla desde el formulario de arriba. */
    const add = async (operator: string, pattern: string, replacement: string, scope?: string) => {
      await pick('Condición', operator);
      await fill('Texto', pattern);
      if (scope) await pick('Sustituye', scope);
      await fill('Por', replacement);
      await submit();
    };

    await settled(() => expect(element.querySelector('#new-concept-rule-title')).not.toBeNull());
    return {
      db,
      fixture,
      element,
      settled,
      rules,
      changes,
      button,
      field,
      fill,
      pick,
      submit,
      status,
      alerts,
      dialog,
      dialogButton,
      add,
    };
  }

  const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim();

  afterEach(() => document.querySelector('.cdk-overlay-container')?.replaceChildren());

  it('sin reglas lo dice', async () => {
    const { element, rules } = await setup();

    expect(rules()).toEqual([]);
    expect(text(element)).toContain('Todavía no hay ninguna regla.');
  });

  it('da de alta reglas y cuenta los conceptos que cambia cada una', async () => {
    const { add, rules, settled, status, field } = await setup();

    await add('Contiene', ' es12 3456 ', '');
    await settled(() => expect(rules()).toEqual([['Contiene', 'ES12 3456', '', '1']]));
    expect(status()).toBe('Regla añadida: Contiene «ES12 3456»');
    expect(field('Texto').value).toBe('');

    await add('Contiene', 'amazon-', 'Amazon compra', 'Todo el concepto');
    await settled(() => expect(rules()).toHaveLength(2));
    expect(rules()[1]).toEqual(['Contiene', 'AMAZON-', 'Todo el concepto por Amazon compra', '2']);
  });

  it('«Es exactamente» no pregunta qué sustituye y exige una sustitución', async () => {
    const { pick, fill, submit, alerts, element, rules } = await setup();

    await pick('Condición', 'Es exactamente');
    expect([...element.querySelectorAll('label span')].map((span) => text(span))).not.toContain(
      'Sustituye',
    );
    await fill('Texto', 'BIZUM');
    await submit();

    expect(alerts()).toEqual(['Escribe el concepto que debe quedar: no puede quedarse vacío.']);
    expect(rules()).toEqual([]);
  });

  it('no guarda expresiones que no valen o que coinciden con nada', async () => {
    const { pick, fill, alerts, settled } = await setup();

    await pick('Condición', 'Expresión regular');
    await fill('Texto', '(amazon');
    await settled(() => expect(alerts()[0]).toBe('La expresión regular no es válida.'));
    await fill('Texto', 'X*');
    await settled(() => expect(alerts()[0]).toContain('coincide también con un texto vacío'));
  });

  it('edita una regla en su fila', async () => {
    const { add, button, fill, rules, settled, status, fixture } = await setup();
    await add('Contiene', 'ES12 3456', '');
    await settled(() => expect(rules()).toHaveLength(1));

    button('Editar: Contiene «ES12 3456»').click();
    await fixture.whenStable();
    await fill('Por: Contiene «ES12 3456»', 'cuenta');
    button('Guardar').click();

    await settled(() => expect(rules()).toEqual([['Contiene', 'ES12 3456', 'cuenta', '1']]));
    expect(status()).toBe('Regla guardada: Contiene «ES12 3456»');
  });

  it('enseña los cambios, no toca nada al cancelar y los aplica al confirmar', async () => {
    const { add, button, changes, rules, settled, status, db, element } = await setup();
    await add('Expresión regular', String.raw`^AMAZON-\d+-\d+$`, 'Amazon compra');
    await settled(() => expect(rules()).toHaveLength(1));
    await add('Contiene', 'ES12 3456', '');
    await settled(() => expect(rules()).toHaveLength(2));

    button('Aplicar a movimientos existentes').click();
    await settled(() => expect(changes()).toHaveLength(3));
    expect(changes()).toEqual([
      ['AMAZON-55-1', 'Amazon compra'],
      ['AMAZON-192903812-022', 'Amazon compra'],
      ['TRANSFERENCIA ES12 3456 ALQUILER', 'TRANSFERENCIA ALQUILER'],
    ]);

    button('Cancelar').click();
    await settled(() => expect(element.querySelector('.preview')).toBeNull());
    expect((await db.allTransactions()).map((tx) => tx.description)).toContain('AMAZON-55-1');

    button('Aplicar a movimientos existentes').click();
    await settled(() => expect(changes()).toHaveLength(3));
    button('Aplicar cambios').click();
    await settled(() => expect(status()).toBe('Conceptos cambiados: 3.'));
    expect((await db.allTransactions()).map((tx) => tx.description).sort()).toEqual([
      'Amazon compra',
      'Amazon compra',
      'TRANSFERENCIA ALQUILER',
    ]);
  });

  it('elimina una regla tras confirmarlo', async () => {
    const { add, button, rules, settled, status, dialog, dialogButton } = await setup();
    await add('Contiene', 'ES12 3456', '');
    await settled(() => expect(rules()).toHaveLength(1));

    button('Eliminar: Contiene «ES12 3456»').click();
    await settled(() => expect(dialog()).not.toBeNull());
    expect(text(dialog())).toContain('Movimientos cuyo concepto cambia: 1.');
    dialogButton('Eliminar').click();

    await settled(() => expect(rules()).toEqual([]));
    expect(status()).toBe('Regla eliminada: Contiene «ES12 3456»');
  });
});
