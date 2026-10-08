import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DB_WORKER_FACTORY, DbService } from '@data/db/db-service';
import { inProcessDbWorker } from '../../../testing/in-process-db-worker';
import { TransactionsPage } from './transactions-page';

describe('TransactionsPage', () => {
  async function setup(demo: boolean) {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: DB_WORKER_FACTORY, useValue: inProcessDbWorker }],
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
    return { element, rows, column, header, sortBy, search, fixture };
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
    expect([...element.querySelectorAll('thead th')].map(text)).toEqual([
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

  it('lista los movimientos del mes, cada dato en su columna', async () => {
    const { element, rows } = await setup(true);

    expect(text(element.querySelector('caption'))).toMatch(
      /^Movimientos de septiembre de 2026 \(\d+\)$/,
    );
    const first = rows().find((r) => text(r)?.includes('Alex - Cortinas'));
    expect([...(first?.querySelectorAll('td') ?? [])].map(text)).toEqual([
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

    expect(changed.map(text).sort()).toEqual([
      '04/09/2026 (fecha modificada)',
      '28/09/2026 (fecha modificada)',
    ]);
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
        [...descriptions].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' })),
      );
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
        `Movimientos de septiembre de 2026 (${rows().length} de ${total})`,
      );
    });

    it('avisa si nada coincide y se puede borrar', async () => {
      const { element, rows, search, fixture } = await setup(true);
      const total = rows().length;

      await search('no existe ningún movimiento así');
      expect(text(element.querySelector('tbody'))).toBe(
        'Ningún movimiento coincide con la búsqueda.',
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
});
