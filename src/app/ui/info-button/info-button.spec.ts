import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { InfoButton } from './info-button';

@Component({
  imports: [InfoButton],
  template: `
    <p class="before">Antes</p>
    <app-info-button infoId="ayuda" topic="Reglas" text="Se aplican en orden." [(open)]="open" />
    <p class="after">Después</p>
  `,
})
class Host {
  readonly open = signal(false);
}

describe('InfoButton', () => {
  async function setup() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const button = element.querySelector('button') as HTMLButtonElement;
    const settled = async (assertion: () => void) => {
      await vi.waitFor(async () => {
        await fixture.whenStable();
        assertion();
      });
    };
    return { host: fixture.componentInstance, element, button, settled };
  }
  const bubble = () => document.getElementById('ayuda');

  it('abre la explicación en un globo fuera del contenido y la cierra con el mismo botón', async () => {
    const { host, element, button, settled } = await setup();
    expect(button.getAttribute('aria-label')).toBe('Más información: Reglas');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.getAttribute('aria-controls')).toBeNull();

    button.click();
    await settled(() => expect(bubble()?.textContent?.trim()).toBe('Se aplican en orden.'));
    expect(host.open()).toBe(true);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.getAttribute('aria-controls')).toBe('ayuda');
    // No se mete entre el contenido de la página.
    expect(element.contains(bubble())).toBe(false);

    button.click();
    await settled(() => expect(bubble()).toBeNull());
    expect(host.open()).toBe(false);
  });

  it('se cierra al pulsar fuera', async () => {
    const { element, button, settled } = await setup();
    button.click();
    await settled(() => expect(bubble()).not.toBeNull());

    (element.querySelector('.after') as HTMLElement).click();
    await settled(() => expect(bubble()).toBeNull());
  });

  it('se cierra con Escape y devuelve el foco al botón', async () => {
    const { button, settled } = await setup();
    button.click();
    await settled(() => expect(bubble()).not.toBeNull());

    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settled(() => expect(bubble()).toBeNull());
    expect(document.activeElement).toBe(button);
  });
});
