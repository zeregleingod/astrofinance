import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DB_WORKER_FACTORY, DbService } from '@data/db/db-service';
import { inProcessDbWorker } from '../../../testing/in-process-db-worker';
import { DashboardPage } from './dashboard-page';

describe('DashboardPage', () => {
  async function setup({ demo, mes }: { demo: boolean; mes?: string }) {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: DB_WORKER_FACTORY, useValue: inProcessDbWorker }],
    });
    if (demo) await TestBed.inject(DbService).openDemo();
    const fixture = TestBed.createComponent(DashboardPage);
    if (mes) fixture.componentRef.setInput('mes', mes);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const click = async (button: HTMLButtonElement | null | undefined) => {
      if (!button) throw new Error('Sin botón');
      button.click();
      await fixture.whenStable();
    };
    return Object.assign(element, { click });
  }

  // Sin `\s`: también casaría con el espacio duro que precede a «€».
  const text = (el: Element | null | undefined) =>
    el?.textContent?.replace(/[ \t\r\n]+/g, ' ').trim();

  it('cada total lleva a los movimientos que lo forman en ese mes', async () => {
    const element = await setup({ demo: true, mes: '2026-08' });
    const links = [...element.querySelectorAll<HTMLAnchorElement>('.kpi dd a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(
      ['ingresos', 'gastos', 'ahorro', 'balance', 'pendiente'].map(
        (origen) => `/movimientos?mes=2026-08&origen=${origen}`,
      ),
    );
    // El enlace se llama como la cifra; lo que hace va en su descripción, que comparten todos.
    const description = element.querySelector(`#${links[0]?.getAttribute('aria-describedby')}`);
    expect(text(description)).toBe('Ver sus movimientos');
    expect(links.every((a) => a.getAttribute('aria-describedby') === description?.id)).toBe(true);
  });

  it('muestra el estado vacío', async () => {
    const element = await setup({ demo: false });
    expect(text(element.querySelector('h2'))).toBe('Resumen');
    expect(text(element)).toContain('Todavía no hay movimientos.');
  });

  it('con la demo abierta muestra el último mes con sus totales y bloques', async () => {
    const element = await setup({ demo: true });

    expect(text(element.querySelector('app-month-nav p'))).toBe('septiembre de 2026');
    const kpis = [...element.querySelectorAll('.kpi')].map((k) => [
      text(k.querySelector('dt')),
      text(k.querySelector('dd')),
    ]);
    expect(kpis).toContainEqual(['Ingresos', '1.850,00 €']);
    expect(kpis).toContainEqual(['Ahorro', '200,00 €']);
    expect(kpis).toContainEqual(['Pendiente de cobrar', '39,29 €']);
    expect([...element.querySelectorAll('.group h3')].map(text)).toEqual([
      'Ingresos',
      'Ahorro',
      'Hipoteca y vivienda',
      'Préstamos y financiaciones',
      'Suministros',
      'Transporte',
      'Variables',
      'Sin categoría',
    ]);
  });

  it('marca los negativos en rojo y los positivos en verde; el cero sin color', async () => {
    const element = await setup({ demo: true });
    const amounts = [...element.querySelectorAll('.kpi dd, .amount')];
    expect(amounts.length).toBeGreaterThan(0);
    for (const amount of amounts) {
      const value = text(amount) ?? '';
      const negative = value.startsWith('-');
      const zero = value.startsWith('0,00');
      expect(amount.classList.contains('negative'), value).toBe(negative);
      expect(amount.classList.contains('positive'), value).toBe(!negative && !zero);
    }
  });

  it('cada subcategoría lista sus movimientos con fecha, concepto e importe', async () => {
    const element = await setup({ demo: true, mes: '2026-07' });
    const quota = [...element.querySelectorAll('.line')].find(
      (l) => text(l.querySelector('h4')) === 'Cuota hipoteca',
    );
    expect(text(quota?.querySelector('.line-header .amount'))).toBe('-206,18 €');

    const rows = [...(quota?.querySelectorAll('li') ?? [])];
    expect(rows.map((r) => text(r.querySelector('.date')))).toEqual(['01/07/2026', '04/07/2026']);
    expect(text(rows[0]?.querySelector('.concept'))).toBe('Préstamo hipotecario - Banco Demo');
    expect(text(rows[0]?.querySelector('.amount'))).toBe('-412,36 €');

    // Lo devuelto va justo debajo de su gasto, marcado también con texto (no solo con color).
    expect(rows[1]?.classList.contains('reimbursed')).toBe(true);
    expect(text(rows[1]?.querySelector('.concept'))).toBe(
      'Devuelto: Bizum recibido - Alex - Hipoteca y seguro',
    );
    expect(text(rows[1]?.querySelector('.amount'))).toBe('206,18 €');
    expect(rows[0]?.classList.contains('reimbursed')).toBe(false);
  });

  it('una subcategoría sin movimientos no lista nada', async () => {
    const element = await setup({ demo: true, mes: '2026-07' });
    const empty = [...element.querySelectorAll('.line')].filter((l) =>
      l.classList.contains('empty'),
    );
    expect(empty.length).toBeGreaterThan(0);
    expect(empty.every((l) => l.querySelector('li') === null)).toBe(true);
  });

  it('muestra el mes pedido en ?mes=', async () => {
    const element = await setup({ demo: true, mes: '2026-07' });
    expect(text(element.querySelector('app-month-nav p'))).toBe('julio de 2026');
    const housing = [...element.querySelectorAll('.group')].find(
      (g) => text(g.querySelector('h3')) === 'Hipoteca y vivienda',
    );
    expect(text(housing?.querySelector('.group-header .amount'))).toBe('-369,82 €');
  });

  describe('plegar y desplegar', () => {
    const group = (element: HTMLElement, name: string) =>
      [...element.querySelectorAll('.group')].find((g) => text(g.querySelector('h3')) === name);
    const line = (element: HTMLElement, name: string) =>
      [...element.querySelectorAll('.line')].find((l) => text(l.querySelector('h4')) === name);
    const toggle = (container: Element | undefined, level: 'h3' | 'h4') =>
      container?.querySelector<HTMLButtonElement>(`${level} button`);
    const controlled = (button: HTMLButtonElement | null | undefined) =>
      document.getElementById(button?.getAttribute('aria-controls') ?? '');
    const foldAll = (element: HTMLElement) =>
      element.querySelector<HTMLButtonElement>('.page-header button.fold-all');

    it('todo empieza desplegado', async () => {
      const element = await setup({ demo: true, mes: '2026-07' });
      const buttons = [...element.querySelectorAll<HTMLButtonElement>('.group button')];
      expect(buttons.length).toBeGreaterThan(0);
      expect(buttons.every((b) => b.getAttribute('aria-expanded') === 'true')).toBe(true);
      expect(foldAll(element)?.getAttribute('aria-label')).toBe('Plegar todo');
    });

    it('una categoría se pliega y se despliega desde su cabecera', async () => {
      const element = await setup({ demo: true, mes: '2026-07' });
      const housing = group(element, 'Hipoteca y vivienda');
      const button = toggle(housing, 'h3');
      const body = controlled(button);
      expect(body?.querySelectorAll('.line')).toHaveLength(3);

      await element.click(button);
      expect(button?.getAttribute('aria-expanded')).toBe('false');
      expect(body?.hidden).toBe(true);
      expect(body && getComputedStyle(body).display).toBe('none');
      // El total de la categoría sigue a la vista.
      expect(text(housing?.querySelector('.group-header .amount'))).toBe('-369,82 €');

      await element.click(button);
      expect(button?.getAttribute('aria-expanded')).toBe('true');
      expect(body?.hidden).toBe(false);
    });

    it('una subcategoría pliega sus movimientos y deja su total', async () => {
      const element = await setup({ demo: true, mes: '2026-07' });
      const quota = line(element, 'Cuota hipoteca');
      const button = toggle(quota, 'h4');
      const movements = controlled(button);
      expect(movements?.querySelectorAll('li')).toHaveLength(2);

      await element.click(button);
      expect(button?.getAttribute('aria-expanded')).toBe('false');
      expect(movements?.hidden).toBe(true);
      // No basta con el atributo: los estilos de la página no deben volver a mostrarla.
      expect(movements && getComputedStyle(movements).display).toBe('none');
      expect(text(quota?.querySelector('.line-header .amount'))).toBe('-206,18 €');
    });

    it('una subcategoría sin movimientos no tiene nada que plegar', async () => {
      const element = await setup({ demo: true, mes: '2026-07' });
      const empty = [...element.querySelectorAll('.line.empty')];
      expect(empty.length).toBeGreaterThan(0);
      expect(empty.every((l) => toggle(l, 'h4') === null)).toBe(true);
    });

    it('el botón junto al mes va de menos a más en tres pasos', async () => {
      const element = await setup({ demo: true, mes: '2026-07' });
      const button = foldAll(element);
      const expanded = (level: 'h3' | 'h4') =>
        new Set(
          [...element.querySelectorAll<HTMLButtonElement>(`.group ${level} button`)].map((b) =>
            b.getAttribute('aria-expanded'),
          ),
        );
      expect(button?.getAttribute('aria-label')).toBe('Plegar todo');

      // 1: todo plegado, categorías y subcategorías.
      await element.click(button);
      expect(expanded('h3')).toEqual(new Set(['false']));
      expect(expanded('h4')).toEqual(new Set(['false']));
      expect(button?.getAttribute('aria-label')).toBe('Desplegar categorías');

      // 2: las categorías abiertas, con sus subcategorías aún plegadas.
      await element.click(button);
      expect(expanded('h3')).toEqual(new Set(['true']));
      expect(expanded('h4')).toEqual(new Set(['false']));
      expect(button?.getAttribute('aria-label')).toBe('Desplegar todo');

      // 3: todo abierto otra vez.
      await element.click(button);
      expect(expanded('h3')).toEqual(new Set(['true']));
      expect(expanded('h4')).toEqual(new Set(['true']));
      expect(button?.getAttribute('aria-label')).toBe('Plegar todo');
    });

    it('con algo plegado a mano y alguna categoría abierta, el botón lo despliega todo', async () => {
      const element = await setup({ demo: true, mes: '2026-07' });
      await element.click(toggle(line(element, 'Cuota hipoteca'), 'h4'));

      expect(foldAll(element)?.getAttribute('aria-label')).toBe('Desplegar todo');
      await element.click(foldAll(element));
      expect(toggle(line(element, 'Cuota hipoteca'), 'h4')?.getAttribute('aria-expanded')).toBe(
        'true',
      );
    });
  });
});
