import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { DB_WORKER_FACTORY, DbService } from '@services/db/db-service';
import { inProcessDbWorker } from '../../../testing/in-process-db-worker';
import { AccountsPage } from './accounts-page';

describe('AccountsPage', () => {
  async function setup() {
    TestBed.configureTestingModule({
      providers: [
        { provide: DB_WORKER_FACTORY, useValue: inProcessDbWorker },
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
    const db = TestBed.inject(DbService);
    await db.openLocal();
    // Una cuenta con movimientos: el extracto se sube a ella y le da el final del IBAN.
    const accountId = await db.createAccount({
      name: 'Banco Demo ·1234',
      institution: 'Banco Demo',
    });
    await db.commitImport({
      accountId,
      profileId: 'demo',
      institution: 'Banco Demo',
      ibanLast4: '1234',
      fileName: 'enero.xls',
      fileSha256: 'f'.repeat(64),
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
      openingBalanceCents: 0,
      rows: [
        {
          opDate: '2026-01-05',
          valueDate: null,
          amountCents: -1000,
          balanceAfterCents: null,
          description: 'COMPRA',
          originalDescription: 'COMPRA',
          descriptionSource: 'banco',
          note: null,
          bankReference: null,
          categoryId: null,
          categorySource: 'ninguna',
          ruleId: null,
          dedupeHash: 'a'.repeat(64),
        },
      ],
      duplicateCount: 0,
      errorCount: 0,
    });
    const fixture = TestBed.createComponent(AccountsPage);
    const element = fixture.nativeElement as HTMLElement;

    const settled = async (assertion: () => void) => {
      await vi.waitFor(async () => {
        await fixture.whenStable();
        assertion();
      });
    };
    /** Cada ficha como [nombre, banco, final del IBAN, movimientos]. */
    const cards = () =>
      [...element.querySelectorAll('li.card:not(.editing)')].map((card) => [
        text(card.querySelector('.name')),
        text(card.querySelector('.bank')),
        text(card.querySelector('.iban')),
        text(card.querySelector('.movements')),
      ]);
    const card = (name: string) => {
      const found = [...element.querySelectorAll('li.card')].find(
        (li) => text(li.querySelector('.name')) === name,
      );
      if (!found) throw new Error(`Sin ficha ${name}`);
      return found;
    };
    const field = (label: string, root: ParentNode = element) => {
      const labelled = [...root.querySelectorAll('label')].find(
        (l) => text(l.querySelector('span')) === label,
      );
      const control = labelled?.querySelector<HTMLInputElement | HTMLSelectElement>(
        'input, select',
      );
      if (!control) throw new Error(`Sin campo ${label}`);
      return control;
    };
    const fill = async (label: string, value: string, root?: ParentNode) => {
      const control = field(label, root);
      control.value = value;
      control.dispatchEvent(new Event('input', { bubbles: true }));
      control.dispatchEvent(new Event('change', { bubbles: true }));
      await fixture.whenStable();
    };
    /** Las opciones de banco del alta como [nombre, imagen del logotipo]. */
    const bankOptions = () =>
      [...element.querySelectorAll('.bank-option')].map((option) => [
        text(option.querySelector('.bank-name')),
        option.querySelector('img')?.getAttribute('src'),
      ]);
    const pickBank = async (bank: string) => {
      const option = [...element.querySelectorAll('.bank-option')].find(
        (o) => text(o.querySelector('.bank-name')) === bank,
      );
      const radio = option?.querySelector<HTMLInputElement>('input[type="radio"]');
      if (!radio) throw new Error(`Sin banco ${bank}`);
      radio.click();
      await fixture.whenStable();
    };
    const add = async (bank: string, name: string) => {
      const form = element.querySelector('form.fields') ?? element;
      await pickBank(bank);
      await fill('Nombre', name, form);
      element.querySelector<HTMLButtonElement>('.fields button[type="submit"]')?.click();
      await fixture.whenStable();
    };
    const status = () => text(element.querySelector('.done[role="status"]'));
    const alerts = () => [...element.querySelectorAll('.alert')].map((a) => text(a));
    const dialog = () => document.querySelector('mat-dialog-container');

    await settled(() => expect(cards()).toHaveLength(1));
    return {
      db,
      fixture,
      element,
      settled,
      cards,
      card,
      field,
      fill,
      add,
      bankOptions,
      pickBank,
      status,
      alerts,
      dialog,
    };
  }

  const text = (el: Element | null | undefined) =>
    el?.textContent?.replace(/[ \t\r\n]+/g, ' ').trim();

  it('enseña cada cuenta con su banco, el final de su IBAN y sus movimientos', async () => {
    const { cards } = await setup();
    expect(cards()).toEqual([
      ['Banco Demo ·1234', 'Banco Demo', 'IBAN acabado en 1234', '1 movimiento'],
    ]);
  });

  it('ofrece para una cuenta nueva los bancos que se saben importar, con su logotipo', async () => {
    const { bankOptions, pickBank, element } = await setup();
    expect(bankOptions()).toContainEqual(['Banc Sabadell', 'banks/sabadell.webp']);
    expect(bankOptions()).toContainEqual(['ING', 'banks/ing.webp']);
    expect(bankOptions().every(([, logo]) => logo?.startsWith('banks/'))).toBe(true);
    // El logotipo acompaña al nombre: no se lee dos veces.
    expect(element.querySelector('.bank-option img')?.getAttribute('alt')).toBe('');

    await pickBank('ING');
    const checked = [...element.querySelectorAll<HTMLInputElement>('.bank-option input')]
      .filter((input) => input.checked)
      .map((input) => input.value);
    expect(checked).toEqual(['ING']);
  });

  it('enseña el logotipo del banco de cada cuenta y, si no lo tiene, sus iniciales', async () => {
    const { add, settled, card } = await setup();
    expect(text(card('Banco Demo ·1234').querySelector('.badge'))).toBe('BD');
    await add('BBVA', 'Ahorro');
    await settled(() =>
      expect(card('Ahorro').querySelector('img.badge')?.getAttribute('src')).toBe(
        'banks/bbva.webp',
      ),
    );
  });

  it('da de alta una cuenta con su banco y su nombre', async () => {
    const { add, settled, cards, status } = await setup();
    await add('ING', '  Cuenta nómina ');
    await settled(() =>
      expect(cards()).toEqual([
        ['Banco Demo ·1234', 'Banco Demo', 'IBAN acabado en 1234', '1 movimiento'],
        ['Cuenta nómina', 'ING', undefined, 'Sin movimientos'],
      ]),
    );
    expect(status()).toBe('Cuenta añadida: Cuenta nómina');
  });

  it('no da de alta una cuenta sin banco ni una con un nombre repetido', async () => {
    const { add, settled, alerts, cards, fill, element } = await setup();
    await fill('Nombre', 'Ahorro', element.querySelector('form.fields') ?? element);
    element.querySelector<HTMLButtonElement>('.fields button[type="submit"]')?.click();
    await settled(() => expect(alerts()).toContain('Elige el banco de la cuenta.'));

    await add('BBVA', 'banco demo ·1234');
    await settled(() => expect(alerts()).toContain('Ya hay una cuenta con ese nombre.'));
    expect(cards()).toHaveLength(1);
  });

  it('renombra una cuenta en su ficha; con movimientos, el banco no cambia', async () => {
    const { card, fixture, settled, field, fill, cards, status } = await setup();
    card('Banco Demo ·1234').querySelector<HTMLButtonElement>('button.edit')?.click();
    await fixture.whenStable();

    const editor = () => document.querySelector('li.card.editing') ?? document;
    expect(field('Banco', editor()).disabled).toBe(true);
    expect(text(editor().querySelector('#account-bank-locked'))).toBe(
      'El banco no se puede cambiar: la cuenta ya tiene movimientos.',
    );

    await fill('Nombre', 'Cuenta principal', editor());
    editor().querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    await settled(() =>
      expect(cards()).toEqual([
        ['Cuenta principal', 'Banco Demo', 'IBAN acabado en 1234', '1 movimiento'],
      ]),
    );
    expect(status()).toBe('Cuenta guardada: Cuenta principal');
  });

  it('elimina una cuenta sin movimientos tras confirmarlo, pero no una con movimientos', async () => {
    const { add, card, settled, cards, dialog, fixture, status } = await setup();
    const used = card('Banco Demo ·1234').querySelector<HTMLButtonElement>('button.delete');
    expect(used?.getAttribute('aria-disabled')).toBe('true');
    used?.click();
    await fixture.whenStable();
    expect(dialog()).toBeNull();

    await add('N26', 'Hucha');
    await settled(() => expect(cards()).toHaveLength(2));
    card('Hucha').querySelector<HTMLButtonElement>('button.delete')?.click();
    await settled(() => expect(dialog()).not.toBeNull());
    expect(text(dialog()?.querySelector('h2'))).toBe('¿Eliminar la cuenta «Hucha»?');
    [...(dialog()?.querySelectorAll('button') ?? [])].find((b) => text(b) === 'Eliminar')?.click();

    await settled(() => expect(cards()).toHaveLength(1));
    expect(status()).toBe('Cuenta eliminada: Hucha');
  });
});
