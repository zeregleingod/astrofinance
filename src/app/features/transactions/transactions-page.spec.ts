import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { provideRouter } from '@angular/router';
import { Viewport } from '@core/layout/viewport';
import { DB_WORKER_FACTORY, DbService } from '@data/db/db-service';
import { inProcessDbWorker } from '../../../testing/in-process-db-worker';
import { TransactionsPage } from './transactions-page';

describe('TransactionsPage', () => {
  async function setup(demo: boolean, compact = false) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: DB_WORKER_FACTORY, useValue: inProcessDbWorker },
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
        { provide: Viewport, useValue: { compact: signal(compact), wide: signal(!compact) } },
      ],
    });
    if (demo) await TestBed.inject(DbService).openDemo();
    const fixture = TestBed.createComponent(TransactionsPage);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    const rows = () => [...element.querySelectorAll('tbody tr')];
    const column = (index: number) => rows().map((r) => text(r.querySelectorAll('td')[index]));
    const header = (name: string) =>
      [...element.querySelectorAll('thead th')].find((th) => text(th) === name);
    const sortBy = async (name: string) => {
      header(name)?.querySelector('button')?.click();
      await fixture.whenStable();
    };
    const search = async (query: string) => {
      const input = element.querySelector<HTMLInputElement>('input[type="search"]');
      if (!input) throw new Error('Sin campo de búsqueda');
      input.value = query;
      input.dispatchEvent(new Event('input'));
      await fixture.whenStable();
    };
    /** Un campo de los filtros por su etiqueta. */
    const filterField = (label: string) => {
      const field = [...element.querySelectorAll('app-transaction-filters mat-form-field')].find(
        (f) => text(f.querySelector('mat-label')) === label,
      );
      const control = field?.querySelector<HTMLInputElement | HTMLSelectElement>('input, select');
      if (!control) throw new Error(`Sin filtro ${label}`);
      return control;
    };
    /** Escribe en un filtro o, si es un desplegable, elige la opción con ese texto. */
    const setFilter = async (label: string, value: string) => {
      const control = filterField(label);
      if (control instanceof HTMLSelectElement) {
        const option = [...control.options].find((o) => text(o) === value);
        if (!option) throw new Error(`Sin opción ${value} en ${label}`);
        control.value = option.value;
      } else {
        control.value = value;
      }
      control.dispatchEvent(new Event('input', { bubbles: true }));
      control.dispatchEvent(new Event('change', { bubbles: true }));
      await fixture.whenStable();
    };
    const filterOptions = (label: string) =>
      [...filterField(label).querySelectorAll('option')].map(text);
    const filterButton = (name: string) => {
      const found = [
        ...element.querySelectorAll<HTMLButtonElement>('app-transaction-filters button'),
      ].find((b) => text(b) === name);
      if (!found) throw new Error(`Sin botón ${name}`);
      return found;
    };
    const applyFilters = async () => {
      filterButton('Filtrar').click();
      await fixture.whenStable();
    };
    const caption = () => text(element.querySelector('caption'));
    const problems = () => text(element.querySelector('#filter-problems'));
    return {
      element,
      rows,
      column,
      header,
      sortBy,
      search,
      fixture,
      filterField,
      setFilter,
      filterOptions,
      filterButton,
      applyFilters,
      caption,
      problems,
    };
  }

  // Sin `\s`: también casaría con el espacio duro que precede a «€».
  const text = (el: Element | null | undefined) =>
    el?.textContent?.replace(/[ \t\r\n]+/g, ' ').trim();

  it('sin datos muestra el estado vacío', async () => {
    const { element } = await setup(false);
    expect(element.querySelector('table')).toBeNull();
    expect(element.textContent).toContain('Todavía no hay movimientos.');
  });

  it('muestra las columnas en orden, empezando por la fecha imputada', async () => {
    const { element } = await setup(true);
    expect([...element.querySelectorAll('thead th:not(.actions)')].map(text)).toEqual([
      'Fecha',
      'Fecha original',
      'Descripción',
      'Etiquetas',
      'Categoría',
      'Subcategoría',
      'Cuenta',
      'Importe',
      'Observaciones',
    ]);
  });

  it('lista los movimientos de todos los meses, cada dato en su columna', async () => {
    const { element, rows, column, caption } = await setup(true);

    expect(caption()).toBe(`Movimientos (${rows().length})`);
    const months = new Set(column(0).map((date) => date?.slice(3, 10)));
    expect([...months].sort()).toEqual(['07/2026', '08/2026', '09/2026']);
    const first = rows().find((r) => text(r)?.includes('Alex - Cortinas'));
    expect([...(first?.querySelectorAll('td:not(.actions)') ?? [])].map(text)).toEqual([
      '28/09/2026 (fecha modificada)',
      '03/10/2026',
      'Bizum recibido - Alex - Cortinas',
      'Reembolso',
      'Variables',
      'Hogar',
      'Cuenta principal',
      '65,47 €',
      'Llega en octubre, pero devuelve un gasto de septiembre.',
    ]);

    const kitchen = rows().find((r) => text(r)?.includes('Financiación cocina'));
    expect(text(kitchen?.querySelectorAll('td')[3])).toBe('Compartido Cuota 10/10');
    expect(text(kitchen?.querySelectorAll('td')[4])).toBe('Préstamos y financiaciones');
    expect(text(kitchen?.querySelectorAll('td')[5])).toBe('Financiaciones');
    expect(rows().some((r) => text(r.querySelectorAll('td')[4]) === 'Sin categoría')).toBe(true);

    for (const cell of element.querySelectorAll('td.num')) {
      expect(cell.classList.contains('negative'), text(cell)).toBe(text(cell)?.startsWith('-'));
    }
  });

  it('distingue la fecha solo cuando el usuario la ha cambiado', async () => {
    const { rows } = await setup(true);
    const booked = rows().map((r) => r.querySelectorAll('td')[0]);
    const changed = booked.filter((cell) => cell?.classList.contains('date-changed'));

    expect(changed.map(text)).toContain('28/09/2026 (fecha modificada)');
    expect(changed.every((cell) => text(cell)?.endsWith('(fecha modificada)'))).toBe(true);
    const unchanged = booked.find((cell) => !cell?.classList.contains('date-changed'));
    expect(text(unchanged)).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it('muestra el texto completo al pasar el ratón por celdas y cabeceras', async () => {
    const { element, rows } = await setup(true);
    const cells = rows()
      .find((r) => text(r)?.includes('Alex - Cortinas'))
      ?.querySelectorAll('td');
    expect(cells?.[2]?.getAttribute('title')).toBe('Bizum recibido - Alex - Cortinas');
    expect(cells?.[8]?.getAttribute('title')).toBe(
      'Llega en octubre, pero devuelve un gasto de septiembre.',
    );
    expect(
      [...element.querySelectorAll('thead th button')].map((b) => b.getAttribute('title')),
    ).toContain('Observaciones');
  });

  describe('ordenación', () => {
    it('empieza por fecha descendente y lo anuncia con aria-sort', async () => {
      const { column, header } = await setup(true);
      const dates = column(0).map((d) => d?.slice(0, 10).split('/').reverse().join('-'));
      expect(dates).toEqual([...dates].sort().reverse());
      expect(header('Fecha')?.getAttribute('aria-sort')).toBe('descending');
      expect(header('Importe')?.getAttribute('aria-sort')).toBe('none');
    });

    it('ordena por la columna pulsada, ascendente y luego descendente', async () => {
      const { column, header, sortBy } = await setup(true);
      const amounts = () =>
        column(7).map((a) =>
          Number(
            a
              ?.replace(/[^\d,-]/g, '')
              .replace('.', '')
              .replace(',', '.'),
          ),
        );

      await sortBy('Importe');
      expect(header('Importe')?.getAttribute('aria-sort')).toBe('ascending');
      expect(header('Fecha')?.getAttribute('aria-sort')).toBe('none');
      expect(amounts()).toEqual([...amounts()].sort((a, b) => a - b));

      await sortBy('Importe');
      expect(header('Importe')?.getAttribute('aria-sort')).toBe('descending');
      expect(amounts()).toEqual([...amounts()].sort((a, b) => b - a));
    });

    it('ordena textos alfabéticamente', async () => {
      const { column, sortBy } = await setup(true);
      await sortBy('Descripción');
      const descriptions = column(2) as string[];
      expect(descriptions).toEqual(
        [...descriptions].sort((a, b) =>
          a.localeCompare(b, 'es', { sensitivity: 'base', numeric: true }),
        ),
      );
    });
  });

  describe('orden de las columnas', () => {
    const headers = (element: HTMLElement) =>
      [...element.querySelectorAll('thead th:not(.actions)')].map(text);
    const press = async (
      fixture: { whenStable(): Promise<unknown> },
      th: Element | undefined,
      key: string,
    ) => {
      th?.querySelector('button')?.dispatchEvent(
        new KeyboardEvent('keydown', { key, altKey: true, bubbles: true, cancelable: true }),
      );
      await fixture.whenStable();
    };

    it('al soltar una cabecera arrastrada mueve la columna y sus celdas', async () => {
      const { element, rows, fixture } = await setup(true);
      const cells = () =>
        [
          ...(rows()
            .find((r) => text(r)?.includes('Alex - Cortinas'))
            ?.querySelectorAll('td') ?? []),
        ].map(text);

      fixture.debugElement
        .query((el) => el.name === 'tr' && el.parent?.name === 'thead')
        .triggerEventHandler('cdkDropListDropped', { previousIndex: 7, currentIndex: 0 });
      await fixture.whenStable();

      expect(headers(element).slice(0, 3)).toEqual(['Importe', 'Fecha', 'Fecha original']);
      expect(cells().slice(0, 3)).toEqual([
        '65,47 €',
        '28/09/2026 (fecha modificada)',
        '03/10/2026',
      ]);
      expect(element.querySelectorAll('colgroup col')[0]?.classList.contains('col-amount')).toBe(
        true,
      );
    });

    it('con Alt + flecha mueve la columna y conserva el foco', async () => {
      const { element, header, fixture } = await setup(true);
      header('Fecha')?.querySelector('button')?.focus();

      await press(fixture, header('Fecha'), 'ArrowRight');
      expect(headers(element).slice(0, 2)).toEqual(['Fecha original', 'Fecha']);
      expect(document.activeElement).toBe(header('Fecha')?.querySelector('button'));

      await press(fixture, header('Fecha'), 'ArrowLeft');
      await press(fixture, header('Fecha'), 'ArrowLeft');
      expect(headers(element).slice(0, 2)).toEqual(['Fecha', 'Fecha original']);
    });

    it('se mantiene al filtrar', async () => {
      const { element, header, fixture, setFilter, applyFilters, caption } = await setup(true);
      const before = caption();

      await press(fixture, header('Observaciones'), 'ArrowLeft');
      await setFilter('Cuenta', 'Cuenta principal');
      await applyFilters();

      expect(caption()).not.toBe(before);
      expect(headers(element).slice(-2)).toEqual(['Observaciones', 'Importe']);
    });
  });

  describe('búsqueda', () => {
    it('filtra al escribir, sin tildes ni mayúsculas, y actualiza el recuento', async () => {
      const { element, rows, search } = await setup(true);
      const total = rows().length;

      await search('FINANCIACION');

      expect(rows().length).toBeGreaterThan(0);
      expect(rows().length).toBeLessThan(total);
      expect(rows().every((r) => /financiaci/i.test(text(r) ?? ''))).toBe(true);
      expect(text(element.querySelector('caption'))).toBe(
        `Movimientos (${rows().length} de ${total})`,
      );
    });

    it('avisa si nada coincide y se puede borrar', async () => {
      const { element, rows, search, fixture } = await setup(true);
      const total = rows().length;

      await search('no existe ningún movimiento así');
      expect(text(element.querySelector('tbody'))).toBe(
        'Ningún movimiento coincide con la búsqueda o los filtros.',
      );

      element.querySelector<HTMLButtonElement>('button[aria-label="Borrar búsqueda"]')?.click();
      await fixture.whenStable();
      expect(rows().length).toBe(total);
      expect(element.querySelector<HTMLInputElement>('input[type="search"]')?.value).toBe('');
    });

    it('mantiene el orden elegido al filtrar', async () => {
      const { column, sortBy, search } = await setup(true);
      await sortBy('Importe');
      await search('bizum');
      const amounts = column(7).map((a) =>
        Number(
          a
            ?.replace(/[^\d,-]/g, '')
            .replace('.', '')
            .replace(',', '.'),
        ),
      );
      expect(amounts.length).toBeGreaterThan(1);
      expect(amounts).toEqual([...amounts].sort((a, b) => a - b));
    });
  });

  describe('filtros', () => {
    /** Las fechas de la columna «Fecha» como `AAAA-MM-DD`. */
    const dates = (cells: (string | undefined)[]) =>
      cells.map((d) => d?.slice(0, 10).split('/').reverse().join('-') ?? '');
    const amounts = (cells: (string | undefined)[]) =>
      cells.map((a) =>
        Math.abs(
          Number(
            a
              ?.replace(/[^\d,-]/g, '')
              .replace('.', '')
              .replace(',', '.'),
          ),
        ),
      );

    it('ofrece en cada desplegable lo que hay en los movimientos, y «todos» por defecto', async () => {
      const { filterOptions, filterField } = await setup(true);

      expect(filterOptions('Año')).toEqual(['Todos', '2026']);
      expect(filterOptions('Etiqueta')).toEqual([
        'Todas',
        'Compartido',
        'Reembolso',
        'Traspaso',
        'Cuota',
      ]);
      expect(filterOptions('Categoría')).toContain('Variables');
      expect(filterOptions('Categoría').at(-1)).toBe('Sin categoría');
      expect(filterOptions('Subcategoría')).toContain('Variables › Comida');
      expect(filterOptions('Cuenta')).toContain('Cuenta principal');
      for (const label of ['Año', 'Desde', 'Hasta', 'Etiqueta', 'Categoría', 'Importe mínimo']) {
        expect(filterField(label).value, label).toBe('');
      }
    });

    it('no filtra hasta pulsar «Filtrar»', async () => {
      const { rows, setFilter, applyFilters, caption, column } = await setup(true);
      const total = rows().length;

      await setFilter('Categoría', 'Variables');
      await setFilter('Importe mínimo', '50');
      expect(rows().length).toBe(total);
      expect(caption()).toBe(`Movimientos (${total})`);

      await applyFilters();

      expect(rows().length).toBeGreaterThan(0);
      expect(rows().length).toBeLessThan(total);
      expect(caption()).toBe(`Movimientos (${rows().length} de ${total})`);
      expect(new Set(column(4))).toEqual(new Set(['Variables']));
      expect(Math.min(...amounts(column(7)))).toBeGreaterThanOrEqual(50);
    });

    it('filtra por rango de fechas, con los extremos incluidos', async () => {
      const { rows, setFilter, applyFilters, column } = await setup(true);

      await setFilter('Desde', '01/08/2026');
      await setFilter('Hasta', '31/08/2026');
      await applyFilters();

      const shown = dates(column(0));
      expect(shown.length).toBeGreaterThan(0);
      expect(shown.every((date) => date >= '2026-08-01' && date <= '2026-08-31')).toBe(true);
      expect(rows().length).toBe(shown.length);
    });

    it('filtra por etiqueta, cuenta, subcategoría e importe máximo', async () => {
      const { rows, setFilter, applyFilters, column, filterButton, fixture } = await setup(true);
      const total = rows().length;

      await setFilter('Etiqueta', 'Reembolso');
      await applyFilters();
      expect(rows().length).toBeGreaterThan(0);
      expect(column(3).every((tags) => tags?.includes('Reembolso'))).toBe(true);

      filterButton('Limpiar').click();
      await fixture.whenStable();
      expect(rows().length).toBe(total);

      await setFilter('Subcategoría', 'Variables › Comida');
      await setFilter('Importe máximo', '20,00');
      await applyFilters();
      expect(rows().length).toBeGreaterThan(0);
      expect(new Set(column(5))).toEqual(new Set(['Comida']));
      expect(Math.max(...amounts(column(7)))).toBeLessThanOrEqual(20);

      filterButton('Limpiar').click();
      await fixture.whenStable();
      await setFilter('Categoría', 'Sin categoría');
      await applyFilters();
      expect(rows().length).toBeGreaterThan(0);
      expect(new Set(column(4))).toEqual(new Set(['Sin categoría']));
    });

    it('al elegir categoría, las subcategorías son solo las suyas', async () => {
      const { setFilter, filterOptions, filterField } = await setup(true);

      await setFilter('Subcategoría', 'Variables › Comida');
      await setFilter('Categoría', 'Variables');
      expect(filterOptions('Subcategoría')).toContain('Comida');
      expect(filterOptions('Subcategoría').some((option) => option?.includes('›'))).toBe(false);
      expect(text(filterField('Subcategoría').querySelector('option:checked'))).toBe('Comida');

      // Una subcategoría de otra categoría deja de estar elegida.
      await setFilter('Categoría', 'Ingresos');
      expect(filterField('Subcategoría').value).toBe('');
    });

    it('con datos que no valen lo explica y no cambia la lista', async () => {
      const { rows, setFilter, applyFilters, problems, caption } = await setup(true);
      const total = rows().length;

      await setFilter('Desde', '01/09/2026');
      await setFilter('Hasta', '01/08/2026');
      await setFilter('Importe mínimo', 'mucho');
      await applyFilters();

      expect(problems()).toContain('La fecha «Hasta» no puede ser anterior a la fecha «Desde».');
      expect(problems()).toContain('Escribe el importe con números, por ejemplo 12,50.');
      expect(caption()).toBe(`Movimientos (${total})`);

      await setFilter('Hasta', '30/09/2026');
      await setFilter('Importe mínimo', '100');
      await setFilter('Importe máximo', '50');
      expect(problems()).toBe('El importe máximo no puede ser menor que el mínimo.');
    });

    it('las fechas se pueden escribir a mano o elegir en el calendario', async () => {
      const { element, setFilter, applyFilters, column, filterField, fixture } = await setup(true);

      // Escrita sin ceros y con guiones: al salir del campo queda como dd/mm/aaaa.
      await setFilter('Desde', '1-9-2026');
      expect(filterField('Desde').value).toBe('01/09/2026');
      await applyFilters();
      expect(dates(column(0)).every((date) => date >= '2026-09-01')).toBe(true);

      const toggles = element.querySelectorAll<HTMLButtonElement>('mat-datepicker-toggle button');
      expect([...toggles].map((toggle) => toggle.getAttribute('aria-label'))).toEqual([
        'Abrir el calendario',
        'Abrir el calendario',
      ]);
      // El calendario se abre por el mes de la fecha que ya hay en el campo.
      await setFilter('Hasta', '30/09/2026');
      toggles[1]?.click();
      await fixture.whenStable();
      const day = [...document.querySelectorAll<HTMLElement>('.mat-calendar-body-cell')].find(
        (cell) => cell.getAttribute('aria-label') === '15 de septiembre de 2026',
      );
      if (!day) throw new Error('Sin el día 15 en el calendario');
      day.click();
      await fixture.whenStable();

      expect(filterField('Hasta').value).toBe('15/09/2026');
      await applyFilters();
      const shown = dates(column(0));
      expect(shown.length).toBeGreaterThan(0);
      expect(shown.every((date) => date >= '2026-09-01' && date <= '2026-09-15')).toBe(true);
    });

    it('una fecha que no se entiende se avisa, no filtra y se borra al limpiar', async () => {
      const { rows, setFilter, applyFilters, problems, filterField, filterButton, fixture } =
        await setup(true);
      const total = rows().length;

      await setFilter('Desde', 'ayer');
      expect(problems()).toBe('Escribe la fecha como dd/mm/aaaa, por ejemplo 01/08/2026.');
      expect(filterField('Desde').getAttribute('aria-invalid')).toBe('true');
      await applyFilters();
      expect(rows().length).toBe(total);

      filterButton('Limpiar').click();
      await fixture.whenStable();
      expect(filterField('Desde').value).toBe('');
      expect(problems()).toBe('');
    });

    it('se combina con la búsqueda', async () => {
      const { rows, setFilter, applyFilters, search, caption } = await setup(true);
      const total = rows().length;

      await setFilter('Categoría', 'Variables');
      await applyFilters();
      const filtered = rows().length;
      await search('supermercado');

      expect(rows().length).toBeGreaterThan(0);
      expect(rows().length).toBeLessThan(filtered);
      expect(caption()).toBe(`Movimientos (${rows().length} de ${total})`);
    });

    it('llegar con ?mes= filtra por las fechas de ese mes y lo enseña en los filtros', async () => {
      const { fixture, column, filterField, filterButton, rows } = await setup(true);
      const total = rows().length;

      fixture.componentRef.setInput('mes', '2026-07');
      await fixture.whenStable();

      expect(filterField('Desde').value).toBe('01/07/2026');
      expect(filterField('Hasta').value).toBe('31/07/2026');
      expect(new Set(dates(column(0)).map((date) => date.slice(0, 7)))).toEqual(
        new Set(['2026-07']),
      );

      filterButton('Limpiar').click();
      await fixture.whenStable();
      expect(rows().length).toBe(total);
      expect(filterField('Desde').value).toBe('');
    });
  });

  describe('listas largas', () => {
    it('pinta los movimientos por tandas y deja pedir más', async () => {
      const { element, rows, fixture, caption, search } = await setup(true);
      const total = rows().length;
      const more = () => element.querySelector<HTMLButtonElement>('button.more');
      expect(more()).toBeNull();

      fixture.componentInstance.pageSize.set(50);
      await fixture.whenStable();

      expect(rows().length).toBe(50);
      // El recuento es el de todos los que cumplen, no el de los pintados.
      expect(caption()).toBe(`Movimientos (${total})`);
      expect(text(more())).toBe(`Mostrar más movimientos (quedan ${total - 50})`);

      more()?.click();
      await fixture.whenStable();
      expect(rows().length).toBe(100);

      // Al cambiar lo que se busca se vuelve a la primera tanda.
      await search('demo');
      expect(rows().length).toBeLessThanOrEqual(50);
    });
  });

  describe('en móvil', () => {
    const cards = (element: HTMLElement) => [
      ...element.querySelectorAll('app-transaction-cards li'),
    ];
    const amounts = (element: HTMLElement) =>
      cards(element).map((card) => text(card.querySelector('.amount')));

    it('enseña una tarjeta por movimiento en lugar de la tabla', async () => {
      const { element } = await setup(true, true);
      expect(element.querySelector('table')).toBeNull();
      const list = cards(element);
      expect(list.length).toBeGreaterThan(0);
      expect(text(element.querySelector('app-transaction-cards h3'))).toBe(
        `Movimientos (${list.length})`,
      );
      // Cada tarjeta lleva el concepto, el importe, la fecha y la categoría.
      const first = list[0];
      expect(text(first?.querySelector('.description'))).not.toBe('');
      expect(text(first?.querySelector('.amount'))).toMatch(/€$/);
      expect(text(first?.querySelector('.date'))).toMatch(/^\d{2}\/\d{2}\/\d{4}/);
    });

    it('pliega los filtros tras un botón y los vuelve a plegar al filtrar', async () => {
      const { element, fixture, setFilter, applyFilters } = await setup(true, true);
      const toggle = element.querySelector<HTMLButtonElement>('button.filters-toggle');
      const filters = () => element.querySelector<HTMLElement>('app-transaction-filters');
      if (!toggle) throw new Error('Sin botón de filtros');
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(filters()?.hidden).toBe(true);

      toggle.click();
      await fixture.whenStable();
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      expect(filters()?.hidden).toBe(false);

      await setFilter('Importe mínimo', '100');
      await applyFilters();
      expect(filters()?.hidden).toBe(true);
      expect(document.activeElement).toBe(toggle);
      expect(text(toggle)).toContain('(activos)');
    });

    it('ordena con el desplegable y el botón de dirección', async () => {
      const { element, fixture } = await setup(true, true);
      const select = element.querySelector<HTMLSelectElement>('.sort-bar select');
      const direction = element.querySelector<HTMLButtonElement>('.sort-bar button');
      if (!select || !direction) throw new Error('Sin controles de orden');
      expect(direction.getAttribute('aria-label')).toBe('Orden descendente');

      select.value = 'amount';
      select.dispatchEvent(new Event('change'));
      await fixture.whenStable();
      const cents = (value: string | undefined) =>
        Number((value ?? '').replace(/[^\d,-]/g, '').replace(',', '.'));
      const desc = amounts(element).map(cents);
      expect(desc).toEqual([...desc].sort((a, b) => b - a));

      direction.click();
      await fixture.whenStable();
      expect(direction.getAttribute('aria-label')).toBe('Orden ascendente');
      const asc = amounts(element).map(cents);
      expect(asc).toEqual([...asc].sort((a, b) => a - b));
    });
  });

  describe('edición', () => {
    const dialog = () => document.querySelector('mat-dialog-container');
    /** Un campo del diálogo por su etiqueta. */
    const dialogField = (label: string) => {
      const field = [...(dialog()?.querySelectorAll('mat-form-field') ?? [])].find(
        (f) => text(f.querySelector('mat-label')) === label,
      );
      const control = field?.querySelector<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >('input, select, textarea');
      if (!control) throw new Error(`Sin campo ${label}`);
      return control;
    };
    /** Escribe en un campo del diálogo o, si es un desplegable, elige la opción con ese texto. */
    const type = (label: string, value: string) => {
      const control = dialogField(label);
      if (control instanceof HTMLSelectElement) {
        const option = [...control.options].find((o) => text(o) === value);
        if (!option) throw new Error(`Sin opción ${value} en ${label}`);
        control.value = option.value;
      } else {
        control.value = value;
      }
      control.dispatchEvent(new Event('input', { bubbles: true }));
      control.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const dialogButton = (name: string) => {
      const found = [...(dialog()?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(
        (b) => text(b) === name,
      );
      if (!found) throw new Error(`Sin botón ${name}`);
      return found;
    };

    async function open(description: string, compact = false) {
      const page = await setup(true, compact);
      const settled = async (assertion: () => void) => {
        await vi.waitFor(async () => {
          await page.fixture.whenStable();
          assertion();
        });
      };
      const container = compact ? '.card' : 'tbody tr';
      const button = [...page.element.querySelectorAll(container)]
        .find((r) => text(r)?.includes(description))
        ?.querySelector<HTMLButtonElement>('button.edit');
      if (!button) throw new Error(`Sin botón de editar para ${description}`);
      button.click();
      await settled(() => expect(dialog()).not.toBeNull());
      return { ...page, button, settled };
    }

    it('cada fila tiene su botón de editar, que dice qué movimiento es', async () => {
      const { button } = await open('Gasolinera Demo');

      expect(button.getAttribute('aria-label')).toMatch(
        /^Editar movimiento: Gasolinera Demo, \d\d\/\d\d\/2026$/,
      );
      expect(text(dialog()?.querySelector('h2'))).toBe('Editar movimiento');
      expect((dialogField('Descripción') as HTMLInputElement).value).toBe('Gasolinera Demo');
      expect(text(dialog()?.querySelector('.facts'))).toMatch(/-55,00\s€/);
    });

    it('guarda el concepto, la categoría y las observaciones', async () => {
      const { rows, settled } = await open('Gasolinera Demo');

      type('Descripción', '  Gasolina del coche ');
      type('Categoría', 'Variables › Ocio');
      type('Observaciones', 'Viaje a la playa');
      dialogButton('Guardar').click();

      await settled(() => expect(dialog()).toBeNull());
      await settled(() =>
        expect(rows().some((r) => text(r)?.includes('Gasolina del coche'))).toBe(true),
      );
      const row = rows().find((r) => text(r)?.includes('Gasolina del coche'));
      const cells = [...(row?.querySelectorAll('td') ?? [])].map(text);
      expect(cells.slice(4, 6)).toEqual(['Variables', 'Ocio']);
      expect(cells[8]).toBe('Viaje a la playa');
      const saved = (await TestBed.inject(DbService).allTransactions()).find(
        (tx) => tx.description === 'Gasolina del coche',
      );
      expect(saved).toMatchObject({ subcategoryName: 'Ocio', note: 'Viaje a la playa' });
    });

    it('imputa el movimiento a otra fecha, y avisa si lo escrito no es una fecha', async () => {
      const { rows, settled } = await open('Gasolinera Demo');

      type('Fecha', '31/13/2026');
      await settled(() =>
        expect(text(dialog()?.querySelector('#edit-date-error'))).toContain('dd/mm/aaaa'),
      );
      expect(dialogField('Fecha').getAttribute('aria-invalid')).toBe('true');
      dialogButton('Guardar').click();
      await settled(() => expect(dialog()).not.toBeNull());

      type('Fecha', '01/01/2027');
      await settled(() => expect(dialog()?.querySelector('#edit-date-error')).toBeNull());
      expect(text(dialog())).toContain('Usar la fecha original');
      dialogButton('Guardar').click();

      await settled(() => expect(dialog()).toBeNull());
      await settled(() =>
        expect(
          rows().some(
            (r) => text(r)?.includes('Gasolinera Demo') && text(r)?.includes('01/01/2027'),
          ),
        ).toBe(true),
      );
      const moved = rows().find((r) => text(r)?.includes('01/01/2027'));
      expect(moved?.querySelector('td.date-changed')).not.toBeNull();
    });

    it('no guarda un concepto vacío', async () => {
      const { settled } = await open('Gasolinera Demo');
      const version = TestBed.inject(DbService).dataVersion();

      type('Descripción', '   ');
      await settled(() => expect(text(dialog())).toContain('Escribe un concepto.'));
      dialogButton('Guardar').click();
      await settled(() => expect(dialog()).not.toBeNull());

      dialogButton('Cancelar').click();
      await settled(() => expect(dialog()).toBeNull());
      expect(TestBed.inject(DbService).dataVersion()).toBe(version);
    });

    it('en móvil cada tarjeta tiene su botón de editar', async () => {
      const { button, settled } = await open('Gasolinera Demo', true);

      expect(button.getAttribute('aria-label')).toMatch(/^Editar movimiento: Gasolinera Demo, /);
      dialogButton('Cancelar').click();
      await settled(() => expect(dialog()).toBeNull());
    });
  });
});
