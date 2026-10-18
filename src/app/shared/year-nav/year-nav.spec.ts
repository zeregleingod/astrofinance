import { TestBed } from '@angular/core/testing';
import { YearNav } from './year-nav';

describe('YearNav', () => {
  async function setup(year: number) {
    const fixture = TestBed.createComponent(YearNav);
    fixture.componentRef.setInput('years', [2024, 2025, 2026]);
    fixture.componentRef.setInput('year', year);
    const emitted: number[] = [];
    fixture.componentInstance.yearChange.subscribe((y) => emitted.push(y));
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const button = (label: string) =>
      element.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
    return { element, emitted, previous: button('Año anterior'), next: button('Año siguiente') };
  }

  it('muestra el año y navega a los contiguos', async () => {
    const { element, emitted, previous, next } = await setup(2025);
    expect(element.querySelector('p')?.textContent?.trim()).toBe('2025');
    previous?.click();
    next?.click();
    expect(emitted).toEqual([2024, 2026]);
  });

  it('desactiva los extremos', async () => {
    expect((await setup(2024)).previous?.disabled).toBe(true);
    expect((await setup(2026)).next?.disabled).toBe(true);
  });
});
