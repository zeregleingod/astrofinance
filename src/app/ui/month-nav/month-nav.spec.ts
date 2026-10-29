import { TestBed } from '@angular/core/testing';
import { MonthNav } from './month-nav';

describe('MonthNav', () => {
  async function setup(period: string) {
    const fixture = TestBed.createComponent(MonthNav);
    fixture.componentRef.setInput('periods', ['2026-07', '2026-08', '2026-09']);
    fixture.componentRef.setInput('period', period);
    const emitted: string[] = [];
    fixture.componentInstance.periodChange.subscribe((p) => emitted.push(p));
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const button = (label: string) =>
      element.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
    return { element, emitted, previous: button('Mes anterior'), next: button('Mes siguiente') };
  }

  it('muestra el mes y navega a los contiguos', async () => {
    const { element, emitted, previous, next } = await setup('2026-08');
    expect(element.querySelector('p')?.textContent?.trim()).toBe('agosto de 2026');
    previous?.click();
    next?.click();
    expect(emitted).toEqual(['2026-07', '2026-09']);
  });

  it('desactiva los extremos', async () => {
    expect((await setup('2026-07')).previous?.disabled).toBe(true);
    expect((await setup('2026-09')).next?.disabled).toBe(true);
  });
});
