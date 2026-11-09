import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { provideRouter } from '@angular/router';
import { ACCOUNT_STORAGE_KEY, AccountSelection } from '@services/accounts/account-selection';
import { DB_WORKER_FACTORY, DbService } from '@services/db/db-service';
import { inProcessDbWorker } from '../../../testing/in-process-db-worker';
import { AccountPicker } from './account-picker';

describe('AccountPicker', () => {
  async function setup(open: 'demo' | 'local' | null, rail = false) {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: DB_WORKER_FACTORY, useValue: inProcessDbWorker },
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
    const db = TestBed.inject(DbService);
    if (open === 'demo') await db.openDemo();
    if (open === 'local') await db.openLocal();
    const fixture = TestBed.createComponent(AccountPicker);
    fixture.componentRef.setInput('rail', rail);
    const element = fixture.nativeElement as HTMLElement;
    const settled = async (assertion: () => void) => {
      await vi.waitFor(async () => {
        await fixture.whenStable();
        assertion();
      });
    };
    const select = () => element.querySelector<HTMLSelectElement>('select');
    return { db, fixture, element, settled, select, selection: TestBed.inject(AccountSelection) };
  }

  const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim();

  afterEach(() => sessionStorage.clear());

  it('sin una BD abierta no enseña nada', async () => {
    const { element, fixture } = await setup(null);
    await fixture.whenStable();
    expect(text(element)).toBe('');
  });

  it('es un desplegable con su rótulo, con las cuentas y la primera elegida', async () => {
    const { element, settled, select, selection } = await setup('demo');
    await settled(() => expect(select()?.options).toHaveLength(3));

    expect(text(element.querySelector('label'))).toBe('Cuenta');
    expect(element.querySelector('label')?.getAttribute('for')).toBe(select()?.id);
    expect([...(select()?.options ?? [])].map(text)).toEqual([
      'Cuenta principal',
      'Hucha emergencias',
      'Hucha viajes',
    ]);
    expect(text(select()?.selectedOptions[0])).toBe('Cuenta principal');
    expect(selection.account()?.name).toBe('Cuenta principal');
  });

  it('a la izquierda, el logotipo del banco de la cuenta elegida; sin él, un icono', async () => {
    const { db, element, settled, select } = await setup('local');
    await db.createAccount({ name: 'Nómina', institution: 'Banc Sabadell' });
    await settled(() => expect(element.querySelector('img.logo')).not.toBeNull());

    const logo = element.querySelector('img.logo');
    expect(logo?.getAttribute('src')).toBe('banks/sabadell.webp');
    expect(logo?.getAttribute('alt')).toBe('');
    expect(logo?.nextElementSibling).toBe(select());

    const other = await db.createAccount({ name: 'Antigua', institution: 'Banco Demo' });
    TestBed.inject(AccountSelection).select(other);
    await settled(() => expect(element.querySelector('img.logo')).toBeNull());
    expect(element.querySelector('mat-icon.lead')?.getAttribute('fonticon')).toBe(
      'account_balance',
    );
  });

  it('plegada, el botón lleva el logotipo del banco', async () => {
    const { db, element, settled } = await setup('local', true);
    await db.createAccount({ name: 'Nómina', institution: 'BBVA' });
    await settled(() =>
      expect(element.querySelector('button img.logo')?.getAttribute('src')).toBe('banks/bbva.webp'),
    );
    expect(element.querySelector('button')?.getAttribute('aria-label')).toBe(
      'Cambiar de cuenta. Ahora: Nómina',
    );
  });

  it('elegir otra cuenta la cambia en toda la app y se recuerda en la pestaña', async () => {
    const { fixture, settled, select, selection } = await setup('demo');
    await settled(() => expect(select()?.options).toHaveLength(3));
    const travel = selection.accounts().find((account) => account.name === 'Hucha viajes');
    const picker = select();
    if (!travel || !picker) throw new Error('Falta la cuenta o el desplegable');

    picker.value = String(travel.id);
    picker.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    expect(selection.accountId()).toBe(travel.id);
    expect(sessionStorage.getItem(ACCOUNT_STORAGE_KEY)).toBe(String(travel.id));
  });

  it('si la cuenta recordada ya no existe, vuelve a la primera', async () => {
    sessionStorage.setItem(ACCOUNT_STORAGE_KEY, '999');
    const { settled, selection } = await setup('demo');
    await settled(() => expect(selection.account()?.name).toBe('Cuenta principal'));
  });

  it('plegada, un botón con el nombre de la cuenta que abre la lista', async () => {
    const { element, fixture, settled, selection } = await setup('demo', true);
    const trigger = () => element.querySelector<HTMLButtonElement>('button');
    await settled(() => expect(trigger()).not.toBeNull());

    expect(element.querySelector('select')).toBeNull();
    expect(trigger()?.getAttribute('aria-label')).toBe(
      'Cambiar de cuenta. Ahora: Cuenta principal',
    );

    trigger()?.click();
    await fixture.whenStable();
    const options = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
    expect(options.map(text)).toEqual(['Cuenta principal', 'Hucha emergencias', 'Hucha viajes']);
    expect(options.map((o) => o.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);

    options[2]?.click();
    await fixture.whenStable();
    expect(selection.account()?.name).toBe('Hucha viajes');
  });

  it('sin cuentas, el hueco del desplegable queda apagado y sin enlaces', async () => {
    const { element, settled } = await setup('local');
    await settled(() => expect(element.querySelector('.placeholder')).not.toBeNull());

    expect(text(element.querySelector('.placeholder'))).toBe('Cuenta: Ninguna todavía');
    expect(element.querySelector('a, button, select')).toBeNull();
  });

  it('plegada y sin cuentas, solo el icono apagado, con su nombre', async () => {
    const { element, settled } = await setup('local', true);
    const icon = () => element.querySelector('.placeholder-icon');
    await settled(() => expect(icon()).not.toBeNull());

    expect(icon()?.getAttribute('role')).toBe('img');
    expect(icon()?.getAttribute('aria-label')).toBe('Cuenta: Ninguna todavía');
    expect(element.querySelector('a, button, select')).toBeNull();
  });

  it('al crear la primera cuenta, queda elegida', async () => {
    const { db, settled, select, selection } = await setup('local');
    await settled(() => expect(selection.loaded()).toBe(true));

    const id = await db.createAccount({ name: 'Nómina', institution: 'BBVA' });

    await settled(() => expect(text(select()?.selectedOptions[0])).toBe('Nómina'));
    expect(selection.accountId()).toBe(id);
  });
});
