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
    return fixture.nativeElement as HTMLElement;
  }

  // Sin `\s`: también casaría con el espacio duro que precede a «€».
  const text = (el: Element | null | undefined) =>
    el?.textContent?.replace(/[ \t\r\n]+/g, ' ').trim();

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
    expect(kpis).toContainEqual(['Ahorro', '-200,00 €']);
    expect(kpis).toContainEqual(['Pendiente de cobrar', '39,29 €']);
    expect([...element.querySelectorAll('.group h3')].map(text)).toEqual([
      'Ingresos',
      'Ahorro',
      'Hipoteca y vivienda',
      'Préstamos y financiaciones',
      'Suministros',
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

  it('muestra el mes pedido en ?mes=', async () => {
    const element = await setup({ demo: true, mes: '2026-07' });
    expect(text(element.querySelector('app-month-nav p'))).toBe('julio de 2026');
    const housing = [...element.querySelectorAll('.group')].find(
      (g) => text(g.querySelector('h3')) === 'Hipoteca y vivienda',
    );
    expect(text(housing?.querySelector('.group-header .amount'))).toBe('-369,82 €');
  });
});
