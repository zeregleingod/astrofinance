import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { DB_WORKER_FACTORY, DbService } from '@services/db/db-service';
import { inProcessDbWorker } from '../../../testing/in-process-db-worker';
import { CategoriesPage } from './categories-page';

describe('CategoriesPage', () => {
  async function setup(demo = false) {
    TestBed.configureTestingModule({
      providers: [
        { provide: DB_WORKER_FACTORY, useValue: inProcessDbWorker },
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
    const db = TestBed.inject(DbService);
    if (demo) await db.openDemo();
    const fixture = TestBed.createComponent(CategoriesPage);
    const element = fixture.nativeElement as HTMLElement;

    const settled = async (assertion: () => void) => {
      await vi.waitFor(async () => {
        await fixture.whenStable();
        assertion();
      });
    };
    const groups = () => [...element.querySelectorAll('tbody.group')];
    const groupNames = () => groups().map((g) => text(g.querySelector('.group-row .name')));
    const group = (name: string) => {
      const found = groups().find((g) => text(g.querySelector('.group-row .name')) === name);
      if (!found) throw new Error(`Sin categoría ${name}`);
      return found;
    };
    /** Subcategorías de una categoría como pares [nombre, tipo]. */
    const subcategories = (name: string) =>
      [...group(name).querySelectorAll('tr.sub:not(.new)')].map((row) => [
        text(row.querySelector('.name')),
        text(row.querySelector('.kind')),
      ]);
    const count = (name: string) => text(group(name).querySelector('.group-row .count'));
    /** Un botón de la página por su nombre accesible. */
    const tool = (label: string) => {
      const found = element.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
      if (!found) throw new Error(`Sin botón ${label}`);
      return found;
    };
    /** Un campo (del formulario de alta o del editor de la fila) por su nombre accesible. */
    const field = <T extends HTMLInputElement | HTMLSelectElement = HTMLInputElement>(
      label: string,
    ) => {
      const labelled = [...element.querySelectorAll('label')].find(
        (l) => text(l.querySelector('span')) === label,
      );
      return (
        labelled?.querySelector<T>('input, select') ??
        element.querySelector<T>(`[aria-label="${label}"]`) ??
        // Un nombre se escribe, si no se elige otro idioma, en el de la interfaz.
        element.querySelector<T>(`[aria-label="${label} (Español)"]`)
      );
    };
    const fill = async (label: string, value: string) => {
      const control = field<HTMLInputElement | HTMLSelectElement>(label);
      if (!control) throw new Error(`Sin campo ${label}`);
      control.value = value;
      control.dispatchEvent(new Event('input', { bubbles: true }));
      control.dispatchEvent(new Event('change', { bubbles: true }));
      await fixture.whenStable();
    };
    const submit = async () => {
      element.querySelector<HTMLButtonElement>('.fields button[type="submit"]')?.click();
      await fixture.whenStable();
    };
    const status = () => text(element.querySelector('[role="status"]'));
    const dialog = () => document.querySelector('mat-dialog-container');
    const dialogButton = (name: string) => {
      const found = [...(dialog()?.querySelectorAll('button') ?? [])].find((b) => text(b) === name);
      if (!found) throw new Error(`Sin botón ${name} en el diálogo`);
      return found;
    };

    await settled(() => expect(groups().length).toBeGreaterThan(0));
    return {
      db,
      fixture,
      element,
      settled,
      groups,
      groupNames,
      group,
      subcategories,
      count,
      tool,
      field,
      fill,
      submit,
      status,
      dialog,
      dialogButton,
    };
  }

  const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim();

  it('abre la BD del usuario y lista la plantilla: el tipo es de las subcategorías', async () => {
    const { db, element, groupNames, group, subcategories } = await setup();

    expect(db.mode()).toBe('local');
    expect(text(element.querySelector('h2'))).toBe('Categorías');
    expect(
      [...element.querySelectorAll('thead th')].map((th) => text(th.firstElementChild ?? th)),
    ).toEqual(['Nombre', 'Tipo', 'Movimientos', 'Acciones']);
    expect(groupNames()).toEqual([
      'Ingresos',
      'Ahorro',
      'Hipoteca y vivienda',
      'Préstamos y financiaciones',
      'Suministros',
      'Transporte',
      'Variables',
    ]);
    expect(text(group('Ingresos').querySelector('.group-row .kind'))).toBe('');
    expect(group('Ingresos').querySelector('.dot circle')?.getAttribute('fill')).toBe('#2E8B57');
    expect(subcategories('Suministros')).toEqual([
      ['Comunidad de vecinos', 'Gasto'],
      ['Luz', 'Gasto'],
    ]);
    expect(subcategories('Ahorro').map(([, kind]) => kind)).toEqual(['Ahorro', 'Ahorro']);
    expect(subcategories('Transporte')).toEqual([
      ['Transporte público', 'Gasto'],
      ['Financiación coche', 'Gasto'],
      ['Coche', 'Gasto'],
      ['Moto', 'Gasto'],
      ['Gasolina', 'Gasto'],
    ]);
    expect(text(element)).toContain('se pierden al recargar o cerrar la página');
  });

  it('las descripciones salen en un globo al pulsar el icono de información, sin mover la página', async () => {
    const { element, tool, settled } = await setup();
    const intro = 'Una categoría agrupa subcategorías';
    const list = 'El tipo de una subcategoría decide';
    // El globo va en la capa de superposición, fuera de la página.
    const bubble = (id: string) => document.getElementById(id);
    expect(text(document.body)).not.toContain(intro);

    const introButton = tool('Más información: Nueva categoría');
    expect(introButton.getAttribute('aria-expanded')).toBe('false');
    introButton.click();
    await settled(() => expect(text(bubble('new-category-info'))).toContain(intro));
    expect(introButton.getAttribute('aria-expanded')).toBe('true');
    expect(introButton.getAttribute('aria-controls')).toBe('new-category-info');
    expect(element.contains(bubble('new-category-info'))).toBe(false);

    // Abrir otro cierra el primero.
    tool('Más información: Tus categorías').click();
    await settled(() => expect(text(bubble('category-list-info'))).toContain(list));
    await settled(() => expect(bubble('new-category-info')).toBeNull());
    expect(introButton.getAttribute('aria-expanded')).toBe('false');

    tool('Más información: Tus categorías').click();
    await settled(() => expect(bubble('category-list-info')).toBeNull());
  });

  it('la tabla no tiene desplazamiento propio: lo hace la página', async () => {
    const { element } = await setup();
    const wrap = element.querySelector('.table-wrap');
    expect(wrap?.getAttribute('role')).toBeNull();
    expect(wrap?.getAttribute('tabindex')).toBeNull();
    expect(element.querySelector('.toolbar .panel')).not.toBeNull();
  });

  describe('formulario de alta', () => {
    it('solo da de alta categorías principales: nombre y color, sin tipo ni «dentro de»', async () => {
      const { element, field } = await setup();

      expect([...element.querySelectorAll('.fields label span')].map(text)).toEqual([
        'Nombre',
        'Color',
      ]);
      expect(element.querySelector('.fields select')).toBeNull();
      expect(field('Color')?.type).toBe('color');
    });

    it('da de alta una categoría con el color elegido', async () => {
      const { db, group, subcategories, field, fill, submit, settled, status } = await setup();

      await fill('Nombre', ' Mascotas ');
      await fill('Color', '#ff8800');
      await submit();

      await settled(() =>
        expect(group('Mascotas').querySelector('.dot circle')?.getAttribute('fill')).toBe(
          '#ff8800',
        ),
      );
      expect(subcategories('Mascotas')).toEqual([]);
      expect(status()).toBe('Añadida: Mascotas');
      expect(field('Nombre')?.value).toBe('');
      expect((await db.categoryTree()).at(-1)).toMatchObject({
        name: 'Mascotas',
        color: '#ff8800',
      });
      // Una categoría sin subcategorías aún no se puede asignar a un movimiento.
      expect((await db.categoryOptions()).some((o) => o.label.includes('Mascotas'))).toBe(false);
    });

    it('propone un color distinto para cada categoría nueva', async () => {
      const { group, field, fill, submit, settled } = await setup();
      const fillOf = (name: string) =>
        group(name).querySelector('.dot circle')?.getAttribute('fill');
      const first = field('Color')?.value;
      expect(first).toMatch(/^#[0-9a-f]{6}$/);

      await fill('Nombre', 'Mascotas');
      await submit();
      await settled(() => expect(fillOf('Mascotas')?.toLowerCase()).toBe(first));
      await settled(() => expect(field('Color')?.value).not.toBe(first));

      await fill('Nombre', 'Coche');
      await submit();
      await settled(() => expect(fillOf('Coche')).toBeTruthy());
      expect(fillOf('Coche')).not.toBe(fillOf('Mascotas'));
    });

    it('no guarda un nombre vacío ni uno repetido, y explica por qué', async () => {
      const { db, element, field, fill, submit, settled } = await setup();
      const version = db.dataVersion();

      expect(field('Nombre')?.getAttribute('aria-invalid')).toBe('false');
      await submit();
      await settled(() =>
        expect(text(element.querySelector('#new-name-errors'))).toBe(
          'Escribe el nombre al menos en un idioma.',
        ),
      );
      expect(field('Nombre')?.getAttribute('aria-invalid')).toBe('true');
      expect(field('Nombre')?.getAttribute('aria-describedby')).toBe('new-name-errors');

      await fill('Nombre', 'variables');
      await submit();
      await settled(() =>
        expect(text(element.querySelector('#new-name-errors'))).toBe(
          'Español: Ya hay una con ese nombre en este idioma en el mismo nivel.',
        ),
      );
      expect(db.dataVersion()).toBe(version);
    });
  });

  describe('subcategorías, en la tabla', () => {
    it('se añaden con nombre y tipo desde el «+» de su categoría', async () => {
      const { db, group, subcategories, tool, field, fill, settled, status } = await setup();

      tool('Añadir subcategoría: Variables').click();
      const name = 'Nombre: nueva subcategoría de Variables';
      const kind = 'Tipo: nueva subcategoría de Variables';
      await settled(() => expect(field(name)).not.toBeNull());
      expect(group('Variables').querySelector('tr.sub.new')).not.toBeNull();
      // Se propone el tipo de las demás subcategorías de la categoría.
      expect(field<HTMLSelectElement>(kind)?.value).toBe('gasto');

      await fill(name, ' Devoluciones ');
      await fill(kind, 'ingreso');
      tool('Guardar').click();

      await settled(() =>
        expect(subcategories('Variables').at(-1)).toEqual(['Devoluciones', 'Ingreso']),
      );
      expect(status()).toBe('Añadida: Variables › Devoluciones');
      expect(group('Variables').querySelector('tr.sub.new')).toBeNull();
      expect((await db.categoryOptions()).map((option) => option.label)).toContain(
        'Variables › Devoluciones',
      );
    });

    it('en una categoría nueva la primera subcategoría parte de «Gasto»', async () => {
      const { subcategories, tool, field, fill, submit, settled } = await setup();
      await fill('Nombre', 'Mascotas');
      await submit();
      await settled(() => expect(tool('Añadir subcategoría: Mascotas')).toBeTruthy());

      tool('Añadir subcategoría: Mascotas').click();
      const name = 'Nombre: nueva subcategoría de Mascotas';
      await settled(() => expect(field(name)).not.toBeNull());
      expect(field<HTMLSelectElement>('Tipo: nueva subcategoría de Mascotas')?.value).toBe('gasto');
      await fill(name, 'Veterinario');
      tool('Guardar').click();

      await settled(() => expect(subcategories('Mascotas')).toEqual([['Veterinario', 'Gasto']]));
    });

    it('no admiten un nombre vacío ni el de una hermana, y Escape cancela', async () => {
      const { db, element, subcategories, tool, field, fill, settled } = await setup();
      const version = db.dataVersion();
      const name = 'Nombre: nueva subcategoría de Suministros';

      tool('Añadir subcategoría: Suministros').click();
      await settled(() => expect(field(name)).not.toBeNull());
      expect(element.querySelector('#row-name-errors')).toBeNull();

      tool('Guardar').click();
      await settled(() =>
        expect(text(element.querySelector('#row-name-errors'))).toBe(
          'Escribe el nombre al menos en un idioma.',
        ),
      );
      await fill(name, 'luz');
      expect(text(element.querySelector('#row-name-errors'))).toBe(
        'Español: Ya hay una con ese nombre en este idioma en el mismo nivel.',
      );
      expect(field(name)?.getAttribute('aria-invalid')).toBe('true');
      tool('Guardar').click();
      await settled(() => expect(field(name)).not.toBeNull());

      field(name)?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await settled(() => expect(field(name)).toBeNull());
      expect(subcategories('Suministros')).toHaveLength(2);
      expect(db.dataVersion()).toBe(version);
    });

    it('se les puede cambiar el nombre y el tipo', async () => {
      const { db, subcategories, tool, field, fill, settled, status } = await setup();

      tool('Editar: Suministros › Luz').click();
      await settled(() => expect(field('Nombre: Suministros › Luz')?.value).toBe('Luz'));
      expect(field<HTMLSelectElement>('Tipo: Suministros › Luz')?.value).toBe('gasto');
      await fill('Nombre: Suministros › Luz', ' Electricidad ');
      await fill('Tipo: Suministros › Luz', 'ahorro');
      tool('Guardar').click();

      await settled(() =>
        expect(subcategories('Suministros')).toEqual([
          ['Comunidad de vecinos', 'Gasto'],
          ['Electricidad', 'Ahorro'],
        ]),
      );
      expect(status()).toBe('Guardada: Suministros › Electricidad');
      expect(field('Nombre: Suministros › Luz')).toBeNull();
      const saved = (await db.categoryTree()).find((g) => g.name === 'Suministros');
      expect(saved?.subcategories[1]).toMatchObject({ name: 'Electricidad', kind: 'ahorro' });
    });

    it('guardar sin cambios no toca la base de datos', async () => {
      const { db, tool, field, settled } = await setup();
      const version = db.dataVersion();

      tool('Editar: Suministros › Luz').click();
      await settled(() => expect(field('Nombre: Suministros › Luz')).not.toBeNull());
      tool('Guardar').click();

      await settled(() => expect(field('Nombre: Suministros › Luz')).toBeNull());
      expect(db.dataVersion()).toBe(version);
    });
  });

  describe('nombre en varios idiomas (ADR-0028, ADR-0030)', () => {
    /** El botón de idioma del campo del nombre que se llama `label`. */
    const languageButton = (element: HTMLElement, label: string) => {
      const input = element.querySelector(
        `input[aria-label="${label}"], input[aria-label^="${label} ("]`,
      );
      const found = input?.closest('app-translatable-input')?.querySelector('button');
      if (!found) throw new Error(`Sin botón de idioma en ${label}`);
      return found;
    };
    const option = (name: string) => {
      const found = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')].find(
        (item) => item.textContent?.includes(name),
      );
      if (!found) throw new Error(`Sin opción ${name}`);
      return found;
    };

    it('un solo campo, en el idioma de la interfaz: el botón de su izquierda elige otro', async () => {
      const { db, element, field, fill, submit, settled, status } = await setup();
      const button = languageButton(element, 'Nombre');
      expect(button.getAttribute('aria-label')).toBe('Idioma del texto: Español');

      await fill('Nombre', 'Mascotas');
      button.click();
      await settled(() => expect(option('English')).toBeTruthy());
      // Solo los idiomas, en su orden, y cada uno enseña lo que tiene escrito.
      expect(
        [...document.querySelectorAll('[role="menuitemradio"] [lang]')].map((item) =>
          item.textContent?.trim(),
        ),
      ).toEqual(['Español', 'Català', 'English']);
      expect(option('Español').textContent).toContain('Mascotas');
      expect(option('English').textContent).toContain('Sin traducir');
      expect(option('Español').getAttribute('aria-checked')).toBe('true');

      option('English').click();
      await settled(() => expect(field('Nombre (English)')).not.toBeNull());
      const english = field('Nombre (English)');
      expect(english?.placeholder).toBe('Mascotas');
      expect(english?.getAttribute('lang')).toBe('en');
      expect(button.getAttribute('aria-label')).toBe('Idioma del texto: English');

      await fill('Nombre (English)', ' Pets ');
      await submit();

      await settled(() => expect(status()).toBe('Añadida: Mascotas'));
      expect((await db.categoryTree()).at(-1)).toMatchObject({
        sourceName: 'Mascotas',
        sourceLanguage: 'es',
        translations: { en: 'Pets' },
      });
      // Tras guardar vuelve al idioma de la interfaz, vacío.
      await settled(() => expect(field('Nombre')?.value).toBe(''));
    });

    it('basta con escribirlo en un idioma; donde falta se ve ese, marcado', async () => {
      const { db, element, group, field, fill, submit, settled, status } = await setup();

      languageButton(element, 'Nombre').click();
      await settled(() => expect(option('English')).toBeTruthy());
      option('English').click();
      await settled(() => expect(field('Nombre (English)')).not.toBeNull());
      await fill('Nombre (English)', 'Pets');
      await submit();

      await settled(() => expect(status()).toBe('Añadida: Pets'));
      expect((await db.categoryTree()).at(-1)).toMatchObject({
        sourceName: 'Pets',
        sourceLanguage: 'en',
        translations: {},
      });
      await settled(() =>
        expect(text(group('Pets').querySelector('.untranslated'))).toBe(
          'en(Sin traducir: se ve en English)',
        ),
      );
      // Las que tienen nombre en español no se marcan.
      expect(element.querySelectorAll('.untranslated')).toHaveLength(1);
    });

    it('no admite en un idioma el nombre que ya tiene allí una hermana', async () => {
      const { db, element, field, fill, submit, settled } = await setup();
      const before = (await db.categoryTree()).length;

      await fill('Nombre', 'Recibos');
      languageButton(element, 'Nombre').click();
      await settled(() => expect(option('English')).toBeTruthy());
      option('English').click();
      await settled(() => expect(field('Nombre (English)')).not.toBeNull());
      await fill('Nombre (English)', 'utilities');
      // Se ve aunque se vuelva al español.
      languageButton(element, 'Nombre').click();
      await settled(() => expect(option('Español')).toBeTruthy());
      option('Español').click();
      await submit();

      await settled(() =>
        expect(text(element.querySelector('app-translatable-input .alert'))).toBe(
          'English: Ya hay una con ese nombre en este idioma en el mismo nivel.',
        ),
      );
      expect((await db.categoryTree()).length).toBe(before);
    });

    it('al editar se cambian sus nombres en cada idioma con el resto', async () => {
      const { db, element, tool, field, fill, settled, status } = await setup();

      tool('Editar: Suministros').click();
      await settled(() => expect(field('Nombre: Suministros')?.value).toBe('Suministros'));
      languageButton(element, 'Nombre: Suministros').click();
      await settled(() => expect(option('English').textContent).toContain('Utilities'));
      option('English').click();
      await settled(() => expect(field('Nombre: Suministros (English)')?.value).toBe('Utilities'));
      await fill('Nombre: Suministros (English)', 'Bills');
      languageButton(element, 'Nombre: Suministros').click();
      await settled(() => expect(option('Català')).toBeTruthy());
      option('Català').click();
      await settled(() => expect(field('Nombre: Suministros (Català)')).not.toBeNull());
      await fill('Nombre: Suministros (Català)', '');
      tool('Guardar').click();

      await settled(() => expect(status()).toBe('Guardada: Suministros'));
      const utilities = (await db.categoryTree()).find((g) => g.sourceName === 'Suministros');
      expect(utilities?.translations).toEqual({ en: 'Bills' });
    });

    it('si se borra el nombre en su idioma, pasa a ser el de otro idioma', async () => {
      const { db, groupNames, tool, field, fill, settled } = await setup();

      tool('Editar: Suministros').click();
      await settled(() => expect(field('Nombre: Suministros')?.value).toBe('Suministros'));
      await fill('Nombre: Suministros', '');
      tool('Guardar').click();

      await settled(() => expect(groupNames()).toContain('Subministraments'));
      expect((await db.categoryTree()).find((g) => g.name === 'Subministraments')).toMatchObject({
        sourceName: 'Subministraments',
        sourceLanguage: 'ca',
        translations: { en: 'Utilities' },
      });
    });

    it('la tabla enseña cada categoría en el idioma de la interfaz', async () => {
      const { db, groupNames, settled } = await setup();

      await db.useCategoryLanguage('en');

      await settled(() => expect(groupNames()).toContain('Utilities'));
      expect(groupNames()).not.toContain('Suministros');
      await db.useCategoryLanguage('es');
    });
  });

  describe('categorías principales, en la tabla', () => {
    it('se les puede cambiar el nombre y el color, pero no tienen tipo', async () => {
      const { db, element, group, tool, field, fill, settled, status } = await setup();

      tool('Editar: Suministros').click();
      await settled(() => expect(field('Nombre: Suministros')?.value).toBe('Suministros'));
      expect(field('Color: Suministros')?.value).toBe('#26b5b5');
      expect(element.querySelector('td.kind select')).toBeNull();

      await fill('Nombre: Suministros', 'Recibos');
      await fill('Color: Suministros', '#123456');
      tool('Guardar').click();

      await settled(() =>
        expect(group('Recibos').querySelector('.dot circle')?.getAttribute('fill')).toBe('#123456'),
      );
      expect(status()).toBe('Guardada: Recibos');
      expect((await db.categoryOptions()).map((option) => option.label)).toContain('Recibos › Luz');
    });

    it('no admiten el nombre de otra categoría', async () => {
      const { db, element, tool, field, fill, settled } = await setup();
      const version = db.dataVersion();

      tool('Editar: Suministros').click();
      await settled(() => expect(field('Nombre: Suministros')).not.toBeNull());
      await fill('Nombre: Suministros', 'variables');

      expect(text(element.querySelector('#row-name-errors'))).toBe(
        'Español: Ya hay una con ese nombre en este idioma en el mismo nivel.',
      );
      tool('Cancelar').click();
      await settled(() => expect(field('Nombre: Suministros')).toBeNull());
      expect(db.dataVersion()).toBe(version);
    });
  });

  describe('orden', () => {
    it('las categorías se suben y bajan entre sí, y se anuncia la nueva posición', async () => {
      const { db, settled, groupNames, tool, status } = await setup();

      expect(tool('Subir: Ingresos').disabled).toBe(true);
      expect(tool('Bajar: Variables').disabled).toBe(true);

      tool('Bajar: Ingresos').click();
      await settled(() => expect(groupNames().slice(0, 2)).toEqual(['Ahorro', 'Ingresos']));
      await settled(() => expect(status()).not.toBe(''));
      expect(status()).toBe('Movida: Ingresos, posición 2 de 7');
      expect(document.activeElement).toBe(tool('Bajar: Ingresos'));

      tool('Subir: Variables').click();
      await settled(() => expect(groupNames().at(-2)).toBe('Variables'));
      expect((await db.categoryTree()).map((g) => g.name)).toEqual(groupNames());
    });

    it('una subcategoría solo se mueve dentro de su categoría', async () => {
      const { db, settled, subcategories, tool } = await setup();

      expect(tool('Subir: Suministros › Comunidad de vecinos').disabled).toBe(true);
      expect(tool('Bajar: Suministros › Luz').disabled).toBe(true);

      tool('Bajar: Suministros › Comunidad de vecinos').click();
      await settled(() =>
        expect(subcategories('Suministros').map(([name]) => name)).toEqual([
          'Luz',
          'Comunidad de vecinos',
        ]),
      );
      await settled(() => expect(document.activeElement?.tagName).toBe('BUTTON'));
      // Al llegar al final el botón se desactiva y el foco pasa al de subir.
      expect(document.activeElement).toBe(tool('Subir: Suministros › Comunidad de vecinos'));
      const tree = await db.categoryTree();
      expect(tree.find((g) => g.name === 'Suministros')?.subcategories.map((c) => c.name)).toEqual([
        'Luz',
        'Comunidad de vecinos',
      ]);
    });

    it('cada fila tiene un asa para arrastrarla, oculta a los lectores de pantalla', async () => {
      const { group } = await setup();

      const handles = group('Suministros').querySelectorAll('.drag-handle');
      expect(handles.length).toBe(3);
      for (const handle of handles) expect(handle.getAttribute('aria-hidden')).toBe('true');
    });
  });

  it('indica cuántos movimientos usa cada una, con un color si tiene y otro si no', async () => {
    const { group, count, fill, submit, settled } = await setup(true);

    expect(count('Variables')).toMatch(/^[1-9]\d*$/);
    expect(group('Variables').querySelectorAll('.sub .count').length).toBeGreaterThan(0);

    await fill('Nombre', 'Mascotas');
    await submit();
    await settled(() => expect(count('Mascotas')).toBe('0'));
    expect(group('Mascotas').querySelector('.count')?.classList.contains('unused')).toBe(true);
    expect(group('Variables').querySelector('.count')?.classList.contains('unused')).toBe(false);
  });

  it('pide confirmación para eliminar y deja sin categoría los movimientos asociados', async () => {
    const { db, groupNames, group, tool, dialog, dialogButton, settled, status } =
      await setup(true);
    const before = await db.transactions('2026-09', 1);
    const used = before.filter((tx) => tx.categoryName === 'Variables').length;
    const uncategorized = before.filter((tx) => tx.categoryName === null).length;
    expect(used).toBeGreaterThan(0);

    tool('Eliminar: Variables').click();
    await settled(() => expect(dialog()).not.toBeNull());
    expect(dialog()?.getAttribute('role')).toBe('alertdialog');
    expect(text(dialog())).toContain('¿Eliminar «Variables»?');
    expect(text(dialog())).toMatch(/También se eliminarán sus subcategorías: \d+\./);
    expect(text(dialog())).toMatch(
      /Movimientos asociados: \d+\. Si la eliminas, esos movimientos no se borran, pero se quedarán sin categoría\./,
    );

    dialogButton('Cancelar').click();
    await settled(() => expect(dialog()).toBeNull());
    expect(group('Variables')).toBeTruthy();
    expect(await db.transactions('2026-09', 1)).toEqual(before);

    tool('Eliminar: Variables').click();
    await settled(() => expect(dialog()).not.toBeNull());
    dialogButton('Eliminar').click();

    await settled(() => expect(groupNames()).not.toContain('Variables'));
    expect(status()).toBe('Eliminada: Variables');
    const after = await db.transactions('2026-09', 1);
    expect(after).toHaveLength(before.length);
    expect(after.filter((tx) => tx.categoryName === 'Variables')).toHaveLength(0);
    expect(after.filter((tx) => tx.categoryName === null)).toHaveLength(uncategorized + used);
  });

  it('una subcategoría sin movimientos se elimina con el mismo aviso, sin consecuencias', async () => {
    const { subcategories, tool, dialog, dialogButton, settled } = await setup();

    tool('Eliminar: Suministros › Luz').click();
    await settled(() => expect(dialog()).not.toBeNull());
    expect(text(dialog())).toContain('¿Eliminar «Suministros › Luz»?');
    expect(text(dialog())).toContain('No tiene movimientos asociados.');
    expect(text(dialog())).not.toContain('subcategorías');
    dialogButton('Eliminar').click();

    await settled(() =>
      expect(subcategories('Suministros')).toEqual([['Comunidad de vecinos', 'Gasto']]),
    );
  });

  it('en la demo también se pueden añadir, sin salir de ella', async () => {
    const { db, element, group, fill, submit, settled } = await setup(true);

    await fill('Nombre', 'Mascotas');
    await submit();

    await settled(() => expect(group('Mascotas')).toBeTruthy());
    expect(db.mode()).toBe('demo');
    expect(text(element)).not.toContain('se pierden al recargar');
  });
});
