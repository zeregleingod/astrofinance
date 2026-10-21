import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DB_WORKER_FACTORY, DbService } from '@data/db/db-service';
import { inProcessDbWorker } from '../../../testing/in-process-db-worker';
import { YearlyPage } from './yearly-page';

describe('YearlyPage', () => {
  async function setup({ demo, anio }: { demo: boolean; anio?: string }) {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: DB_WORKER_FACTORY, useValue: inProcessDbWorker }],
    });
    if (demo) await TestBed.inject(DbService).openDemo();
    const fixture = TestBed.createComponent(YearlyPage);
    if (anio) fixture.componentRef.setInput('anio', anio);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  // Sin `\s`: también casaría con el espacio duro que precede a «€».
  const text = (el: Element | null | undefined) =>
    el?.textContent?.replace(/[ \t\r\n]+/g, ' ').trim();

  it('muestra el estado vacío', async () => {
    const element = await setup({ demo: false });
    expect(text(element.querySelector('h2'))).toBe('Resumen anual');
    expect(text(element)).toContain('Todavía no hay movimientos.');
  });

  it('con la demo abierta muestra el último año, con los doce meses y el total', async () => {
    const element = await setup({ demo: true });

    expect(text(element.querySelector('app-year-nav p'))).toBe('2026');
    // De cada mes, el nombre entero: la abreviatura no la leen los lectores de pantalla.
    const headers = [...element.querySelectorAll('thead th')].map((th) =>
      text(th.querySelector('.month-long') ?? th),
    );
    expect(headers).toHaveLength(2 + 12 + 1);
    expect(headers.slice(2, 14)).toEqual([
      'enero',
      'febrero',
      'marzo',
      'abril',
      'mayo',
      'junio',
      'julio',
      'agosto',
      'septiembre',
      'octubre',
      'noviembre',
      'diciembre',
    ]);
    expect(headers.at(-1)).toBe('Total');
  });

  it('agrupa las subcategorías bajo cada categoría, como la hoja anual', async () => {
    const element = await setup({ demo: true });
    const groups = [...element.querySelectorAll('tbody th[scope="rowgroup"] .group-name')].map(
      text,
    );
    expect(groups).toEqual([
      'Ingresos',
      'Ahorro',
      'Hipoteca y vivienda',
      'Préstamos y financiaciones',
      'Suministros',
      'Transporte',
      'Variables',
      'Sin categoría',
    ]);

    const housing = [...element.querySelectorAll('tbody')].find(
      (body) => text(body.querySelector('.group-name')) === 'Hipoteca y vivienda',
    );
    const lines = [...(housing?.querySelectorAll('th[scope="row"]') ?? [])].map(text);
    expect(lines).toEqual(['Cuota hipoteca', 'Seguros de la vivienda', 'Impuestos']);
    // Julio, en euros y sin el símbolo: 412,36 de cuota menos los 206,18 del Bizum que le
    // corresponden (el resto devuelve el seguro).
    const quota = housing?.querySelector('tr');
    expect(text(quota?.querySelectorAll('td')[6])).toBe('-206,18');
  });

  it('tiñe enteras las filas de ingresos y de ahorro, y solo la categoría en los gastos', async () => {
    const element = await setup({ demo: true });
    const section = (name: string) =>
      [...element.querySelectorAll('tbody')].find(
        (body) => text(body.querySelector('.group-name')) === name,
      );

    for (const name of ['Ingresos', 'Ahorro']) {
      const rows = [...(section(name)?.querySelectorAll('tr') ?? [])];
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.classList).toContain('tinted');
        const cells = [...row.querySelectorAll('th[scope="row"], td')];
        expect(cells.every((cell) => cell.querySelector('svg.tint') !== null)).toBe(true);
      }
    }
    const housing = section('Hipoteca y vivienda');
    expect(housing?.querySelector('tr.tinted')).toBeNull();
    expect(housing?.querySelectorAll('svg.tint')).toHaveLength(1);
  });

  it('cierra con los gastos totales, en rojo, y el balance sin el ahorro', async () => {
    const element = await setup({ demo: true });
    const rows = [...element.querySelectorAll('tfoot tr')];
    expect(rows.map((row) => text(row.querySelector('th')))).toEqual(['Gastos totales', 'Balance']);
    expect(rows[0]?.classList.contains('expense')).toBe(true);
    expect(rows[1]?.classList.contains('highlight')).toBe(true);
    expect(element.querySelector('dl')).toBeNull();
  });

  it('no lleva texto explicativo encima de la tabla, pero la tabla tiene nombre', async () => {
    const element = await setup({ demo: true });
    expect(element.querySelector('caption')).toBeNull();
    expect(element.querySelector('table')?.getAttribute('aria-label')).toBe('Resumen anual');
  });

  it('marca los negativos en rojo, los positivos en verde y atenúa los ceros', async () => {
    const element = await setup({ demo: true });
    const cells = [...element.querySelectorAll('td')];
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      const value = text(cell) ?? '';
      const negative = value.startsWith('-');
      const zero = value.startsWith('0,00');
      expect(cell.classList.contains('negative'), value).toBe(negative);
      expect(cell.classList.contains('positive'), value).toBe(!negative && !zero);
    }
  });

  it('enlaza los meses con datos a su resumen mensual', async () => {
    const element = await setup({ demo: true });
    const links = [...element.querySelectorAll<HTMLAnchorElement>('thead a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/?mes=2026-07',
      '/?mes=2026-08',
      '/?mes=2026-09',
    ]);
  });

  it('con un año sin datos en ?anio= muestra el más reciente', async () => {
    const element = await setup({ demo: true, anio: '1999' });
    expect(text(element.querySelector('app-year-nav p'))).toBe('2026');
  });
});
