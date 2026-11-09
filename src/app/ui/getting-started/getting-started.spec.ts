import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { GettingStarted, type GettingStartedPage } from './getting-started';

describe('GettingStarted', () => {
  async function setup(
    page: GettingStartedPage,
    account: { name: string; institution: string | null } | null = null,
  ) {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(GettingStarted);
    fixture.componentRef.setInput('page', page);
    fixture.componentRef.setInput('account', account);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const steps = () =>
      [...element.querySelectorAll('ol > li')].map((li) => [
        text(li.querySelector('strong')),
        li.getAttribute('aria-current'),
      ]);
    return { element, steps };
  }

  const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim();

  it('sin cuenta, el primer paso es crearla y el botón lleva a Cuentas', async () => {
    const { element, steps } = await setup('month');

    expect(text(element.querySelector('h3'))).toBe(
      'Crea tu primera cuenta para ver el resumen del mes',
    );
    expect(element.querySelector('section')?.getAttribute('aria-labelledby')).toBe(
      element.querySelector('h3')?.id,
    );
    expect(steps()).toEqual([
      ['Crea la cuenta', 'step'],
      ['Importa su extracto', null],
      ['Revisa tu mes', null],
    ]);
    const cta = element.querySelector('a');
    expect(text(cta)).toBe('Crear mi primera cuenta');
    expect(cta?.getAttribute('href')).toBe('/configuracion/cuentas');
    expect(text(element)).toContain('Tus datos no salen de este navegador.');
  });

  it('cada página tiene su título y, de fondo y oculta a los lectores, su forma', async () => {
    const year = await setup('year');
    expect(text(year.element.querySelector('h3'))).toBe(
      'Tu año, mes a mes, empieza con una cuenta',
    );
    expect(year.element.querySelector('.ghost')?.getAttribute('aria-hidden')).toBe('true');
    expect(year.element.querySelectorAll('.ghost .sheet-row').length).toBeGreaterThan(0);
    TestBed.resetTestingModule();

    const list = await setup('transactions');
    expect(text(list.element.querySelector('h3'))).toBe(
      'Crea tu primera cuenta para ver sus movimientos',
    );
    expect(list.element.querySelectorAll('.ghost .list-row').length).toBeGreaterThan(0);
    TestBed.resetTestingModule();

    const importing = await setup('import');
    expect(text(importing.element.querySelector('h3'))).toBe(
      'Crea tu primera cuenta para importar sus extractos',
    );
    expect(importing.element.querySelector('.ghost .import-panel')).not.toBeNull();
  });

  it('con la cuenta y sin movimientos, el paso que toca es importar', async () => {
    const { element, steps } = await setup('month', {
      name: 'Cuenta nómina',
      institution: 'Banc Sabadell',
    });

    expect(text(element.querySelector('h3'))).toBe(
      '«Cuenta nómina» está lista para su primer extracto',
    );
    expect(text(element.querySelector('.intro'))).toContain('descargas de Banc Sabadell');
    expect(steps()).toEqual([
      ['Cuenta creada · hecho', null],
      ['Importa su extracto', 'step'],
      ['Revisa tu mes', null],
    ]);
    expect(text(element.querySelector('li.done'))).toContain('Cuenta nómina, de Banc Sabadell.');
    const cta = element.querySelector('a');
    expect(text(cta)).toBe('Importar el primer extracto');
    expect(cta?.getAttribute('href')).toBe('/importar');
  });

  it('una cuenta sin banco no lo nombra', async () => {
    const { element } = await setup('year', { name: 'Antigua', institution: null });
    expect(text(element.querySelector('.intro'))).toContain('descargas de tu banco');
    expect(text(element.querySelector('li.done'))).toContain('Antigua');
  });
});
