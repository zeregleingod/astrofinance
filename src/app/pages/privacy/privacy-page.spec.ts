import { TestBed } from '@angular/core/testing';
import { setLanguage } from '@ui/texts';
import { PrivacyPage } from './privacy-page';

describe('PrivacyPage (ADR-0032)', () => {
  afterEach(() => setLanguage('es'));

  async function setup() {
    const fixture = TestBed.createComponent(PrivacyPage);
    await fixture.whenStable();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  it('presenta la política con su fecha y sus apartados', async () => {
    const { element } = await setup();

    expect(text(element.querySelector('h2'))).toBe('Política de privacidad');
    expect(text(element.querySelector('.updated'))).toBe(
      'Última actualización: 2 de noviembre de 2026',
    );
    expect([...element.querySelectorAll('h3')].map(text)).toEqual([
      'En pocas palabras',
      'Uso bajo tu responsabilidad',
      'Qué datos maneja la aplicación y dónde quedan',
      'Lo que la aplicación no hace',
      'El alojamiento: GitHub Pages',
      'Cómo puedes comprobarlo',
      'Cómo borrar tus datos',
      'Control total sobre tus datos',
      'Menores',
      'Cambios en esta política',
    ]);
    // Cada apartado es una región con su título como nombre.
    for (const section of element.querySelectorAll('section')) {
      const id = section.getAttribute('aria-labelledby');
      expect(id && element.querySelector(`#${id}`)?.tagName).toBe('H3');
    }
  });

  it('enumera las claves que guarda el navegador', async () => {
    const { element } = await setup();

    expect([...element.querySelectorAll('.storage code')].map(text)).toEqual([
      'astrofinance.language',
      'astrofinance.theme',
      'astrofinance.sidebar',
      'astrofinance.session',
    ]);
  });

  it('enlaza la política de GitHub en una pestaña nueva, sin referrer y avisándolo', async () => {
    const { element } = await setup();

    const links = element.querySelectorAll('a');
    expect(links).toHaveLength(1);
    const link = links[0];
    expect(link?.getAttribute('href')).toMatch(/^https:\/\/docs\.github\.com\/es\//);
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(text(link ?? null)).toBe(
      'Declaración de privacidad de GitHub (se abre en una pestaña nueva)',
    );
  });

  it('cambia de idioma en vivo', async () => {
    const { fixture, element } = await setup();

    setLanguage('en');
    await fixture.whenStable();
    expect(text(element.querySelector('h2'))).toBe('Privacy policy');
    expect(element.querySelector('a')?.getAttribute('href')).toMatch(/docs\.github\.com\/en\//);

    setLanguage('ca');
    await fixture.whenStable();
    expect(text(element.querySelector('h2'))).toBe('Política de privadesa');
  });
});

function text(element: Element | null): string {
  return element?.textContent.replace(/\s+/g, ' ').trim() ?? '';
}
