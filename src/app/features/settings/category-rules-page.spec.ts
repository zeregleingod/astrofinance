import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { DB_WORKER_FACTORY, DbService } from '@data/db/db-service';
import { inProcessDbWorker } from '../../../testing/in-process-db-worker';
import { CategoryRulesPage } from './category-rules-page';

describe('CategoryRulesPage', () => {
  async function setup(demo = true) {
    TestBed.configureTestingModule({
      providers: [
        { provide: DB_WORKER_FACTORY, useValue: inProcessDbWorker },
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
    const db = TestBed.inject(DbService);
    if (demo) await db.openDemo();
    const fixture = TestBed.createComponent(CategoryRulesPage);
    const element = fixture.nativeElement as HTMLElement;

    const settled = async (assertion: () => void) => {
      await vi.waitFor(async () => {
        await fixture.whenStable();
        assertion();
      });
    };
    /** Las reglas de la tabla como [condición, texto, categoría, movimientos]. */
    const rules = () =>
      [...element.querySelectorAll('table.rules tbody tr:not(.editing)')].map((row) =>
        [...row.querySelectorAll('td, th')].slice(0, 4).map((cell) => text(cell)),
      );
    /** Los cambios propuestos como [concepto, categoría actual, categoría nueva]. */
    const changes = () =>
      [...element.querySelectorAll('.preview tbody tr')].map((row) => {
        const cells = [...row.querySelectorAll('td, th')].map((cell) => text(cell));
        return [cells[1], cells[3], cells[4]];
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
    const add = async (operator: string, pattern: string, category: string) => {
      await pick('Condición', operator);
      await fill('Texto', pattern);
      await pick('Categoría', category);
      await submit();
    };

    await settled(() => expect(element.querySelector('#new-rule-title')).not.toBeNull());
    await settled(() =>
      expect(field('Categoría').querySelectorAll('option').length).toBeGreaterThan(1),
    );
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

  it('lista las reglas con su condición, su categoría y lo que han clasificado', async () => {
    const { rules, settled } = await setup();

    await settled(() => expect(rules()).toHaveLength(3));
    expect(rules()[0]).toEqual(['Contiene', 'SUPERMERCADO', 'Variables › Comida', '6']);
    expect(rules()[2]?.slice(0, 2)).toEqual(['Empieza por', 'STREAMING DEMO']);
  });

  it('sin reglas lo dice y no deja aplicar nada', async () => {
    const { element, button, rules } = await setup(false);

    expect(rules()).toEqual([]);
    expect(text(element)).toContain('Todavía no hay ninguna regla.');
    expect(button('Aplicar a movimientos existentes').disabled).toBe(true);
  });

  it('da de alta una regla y deja el formulario listo para la siguiente', async () => {
    const { add, rules, settled, status, field } = await setup(false);

    await add('Es exactamente', '  Nómina ', 'Ingresos › Nómina');

    await settled(() =>
      expect(rules()).toEqual([['Es exactamente', 'NÓMINA', 'Ingresos › Nómina', '0']]),
    );
    expect(status()).toBe('Regla añadida: Es exactamente «NÓMINA»');
    expect(field('Texto').value).toBe('');
    expect(field('Condición').value).toBe('exacto');
  });

  it('no guarda una regla sin texto, sin categoría o con una expresión que no vale', async () => {
    const { submit, fill, pick, alerts, rules, settled } = await setup(false);

    await submit();
    expect(alerts()).toEqual([
      'Escribe el texto que debe tener el concepto.',
      'Elige la categoría que asigna la regla.',
    ]);

    await pick('Condición', 'Expresión regular');
    await fill('Texto', '(luz');
    await settled(() => expect(alerts()[0]).toBe('La expresión regular no es válida.'));
    await fill('Texto', '(a+)+');
    await settled(() => expect(alerts()[0]).toContain('podría no terminar nunca'));
    await submit();
    expect(rules()).toEqual([]);
  });

  it('no admite dos reglas con la misma condición', async () => {
    const { fill, alerts, settled, rules } = await setup();
    await settled(() => expect(rules()).toHaveLength(3));

    await fill('Texto', 'SUPERMERCADO');

    await settled(() => expect(alerts()).toEqual(['Ya hay una regla con esa condición.']));
  });

  it('edita una regla en su fila', async () => {
    const { button, fill, pick, field, rules, settled, status, fixture } = await setup();
    await settled(() => expect(rules()).toHaveLength(3));

    button('Editar: Contiene «SUPERMERCADO»').click();
    await fixture.whenStable();
    expect(field('Texto: Contiene «SUPERMERCADO»').value).toBe('SUPERMERCADO');

    await pick('Condición: Contiene «SUPERMERCADO»', 'Expresión regular');
    await fill('Texto: Contiene «SUPERMERCADO»', '^super(mercado)?\\b');
    await pick('Categoría: Contiene «SUPERMERCADO»', 'Variables › Ocio');
    button('Guardar').click();

    await settled(() =>
      expect(rules()[0]).toEqual([
        'Expresión regular',
        '^super(mercado)?\\b',
        'Variables › Ocio',
        '6',
      ]),
    );
    expect(status()).toBe('Regla guardada: Expresión regular «^super(mercado)?\\b»');
  });

  it('cancelar la edición no cambia nada', async () => {
    const { button, fill, rules, settled, fixture } = await setup();
    await settled(() => expect(rules()).toHaveLength(3));

    button('Editar: Contiene «GASOLINERA»').click();
    await fixture.whenStable();
    await fill('Texto: Contiene «GASOLINERA»', 'Otra cosa');
    button('Cancelar').click();

    await settled(() => expect(rules()).toHaveLength(3));
    expect(rules()[1]?.[1]).toBe('GASOLINERA');
  });

  it('elimina una regla tras confirmarlo', async () => {
    const { button, dialog, dialogButton, rules, settled, status } = await setup();
    await settled(() => expect(rules()).toHaveLength(3));

    button('Eliminar: Contiene «GASOLINERA»').click();
    await settled(() =>
      expect(text(dialog())).toContain('¿Eliminar la regla Contiene «GASOLINERA»?'),
    );
    expect(text(dialog())).toContain('No se borran y conservan su categoría.');
    dialogButton('Cancelar').click();
    await settled(() => expect(dialog()).toBeNull());
    expect(rules()).toHaveLength(3);

    button('Eliminar: Contiene «GASOLINERA»').click();
    await settled(() => expect(dialog()).not.toBeNull());
    dialogButton('Eliminar').click();

    await settled(() => expect(rules()).toHaveLength(2));
    expect(status()).toBe('Regla eliminada: Contiene «GASOLINERA»');
  });

  describe('aplicar a movimientos existentes', () => {
    /** Conceptos de los movimientos que cambiarían de categoría al aplicar las reglas. */
    const categorized = async (db: DbService) =>
      (await db.previewRules()).map((change) => change.description);
    /**
     * En la demo todo está ya clasificado; al cambiar la categoría de la regla de los
     * supermercados, los movimientos que clasificó quedan pendientes de pasar a «Ocio».
     */
    const retarget = async (db: DbService) => {
      const rule = (await db.rules()).find((candidate) => candidate.pattern === 'SUPERMERCADO');
      const leisure = (await db.categoryOptions()).find((o) => o.label === 'Variables › Ocio');
      if (!rule || !leisure) throw new Error('Sin regla o categoría en la demo');
      await db.updateRule({ ...rule, categoryId: leisure.id });
    };

    it('enseña los cambios y no toca nada hasta confirmar', async () => {
      const { db, button, changes, settled, rules, element, status } = await setup();
      await settled(() => expect(rules()).toHaveLength(3));
      await retarget(db);
      await settled(() => expect(rules()[0]?.[2]).toBe('Variables › Ocio'));
      const pending = await categorized(db);
      expect(pending.length).toBeGreaterThan(0);

      button('Aplicar a movimientos existentes').click();

      await settled(() => expect(changes()).toHaveLength(pending.length));
      expect(changes()[0]?.[2]).toBe('Variables › Ocio');
      expect(text(element.querySelector('.preview'))).toContain('Todavía no se ha cambiado nada.');
      expect(button('Aplicar a movimientos existentes').disabled).toBe(true);
      expect(await categorized(db)).toEqual(pending);

      button('Cancelar').click();
      await settled(() => expect(element.querySelector('.preview')).toBeNull());
      expect(await categorized(db)).toEqual(pending);

      button('Aplicar a movimientos existentes').click();
      await settled(() => expect(changes()).toHaveLength(pending.length));
      button('Aplicar cambios').click();

      await settled(() => expect(status()).toBe(`Movimientos categorizados: ${pending.length}.`));
      expect(element.querySelector('.preview')).toBeNull();
      expect(await categorized(db)).toEqual([]);
      expect(rules()[0]?.[3]).toBe(String(pending.length));
    });

    it('si nada cambiaría, lo dice sin enseñar ninguna tabla', async () => {
      const { db, button, settled, status, element, rules } = await setup();
      await settled(() => expect(rules()).toHaveLength(3));
      await db.applyRules();

      button('Aplicar a movimientos existentes').click();

      await settled(() =>
        expect(status()).toBe('Ningún movimiento cambiaría de categoría con las reglas actuales.'),
      );
      expect(element.querySelector('.preview')).toBeNull();
    });

    it('descarta los cambios propuestos si las reglas cambian mientras tanto', async () => {
      const { db, add, button, changes, settled, rules, element } = await setup();
      await settled(() => expect(rules()).toHaveLength(3));
      await retarget(db);
      await settled(() => expect(rules()[0]?.[2]).toBe('Variables › Ocio'));
      button('Aplicar a movimientos existentes').click();
      await settled(() => expect(changes().length).toBeGreaterThan(0));

      await add('Contiene', 'Alquiler', 'Variables › Ocio');

      await settled(() => expect(rules()).toHaveLength(4));
      expect(element.querySelector('.preview')).toBeNull();
    });
  });
});
