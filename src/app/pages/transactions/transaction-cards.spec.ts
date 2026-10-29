import { TestBed } from '@angular/core/testing';
import { TransactionCards, type TransactionCard } from './transaction-cards';

describe('TransactionCards', () => {
  const card = (overrides: Partial<TransactionCard> = {}): TransactionCard => ({
    id: 1,
    opDate: '2026-10-14',
    bookedDate: '2026-10-14',
    dateChanged: false,
    period: '2026-10',
    description: 'Mercadona',
    originalDescription: null,
    note: null,
    amountCents: -6215,
    accountName: 'Cuenta Demo',
    categoryName: 'Alimentación',
    categoryId: 3,
    subcategoryName: 'Supermercado',
    categoryColor: '#9C3A00',
    shared: false,
    reimbursement: false,
    transfer: false,
    installment: null,
    splits: [],
    refundingCents: 0,
    refunds: [],
    refundable: true,
    links: [],
    tags: [],
    linkTexts: [],
    ...overrides,
  });

  async function setup(rows: readonly TransactionCard[], detailed = false) {
    const fixture = TestBed.createComponent(TransactionCards);
    fixture.componentRef.setInput('rows', rows);
    fixture.componentRef.setInput('count', String(rows.length));
    fixture.componentRef.setInput('remaining', 0);
    fixture.componentRef.setInput('detailed', detailed);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const text = (el: Element | null | undefined) =>
    el?.textContent?.replace(/[ \t\r\n]+/g, ' ').trim();

  it('enseña el concepto del banco si el usuario lo ha cambiado', async () => {
    const element = await setup([
      card({ originalDescription: 'COMPRA TARJ. 5402 MERCADONA S.A.' }),
      card({ id: 2, originalDescription: 'Mercadona' }),
    ]);
    const [renamed, same] = element.querySelectorAll('li.card');
    expect(text(renamed?.querySelector('.bank dt'))).toBe('Concepto del banco');
    expect(text(renamed?.querySelector('.bank dd'))).toBe('COMPRA TARJ. 5402 MERCADONA S.A.');
    expect(same?.querySelector('.bank')).toBeNull();
  });

  it('marca cada ficha a la izquierda con el color de su categoría', async () => {
    const element = await setup([card(), card({ id: 2, categoryColor: null })]);
    const fills = [...element.querySelectorAll('li.card > .band rect')].map((rect) =>
      rect.getAttribute('fill'),
    );
    // Sin color, sin atributo: la hoja de estilos pone el neutro del tema.
    expect(fills).toEqual(['#9C3A00', null]);
  });

  it('enseña la fecha en un bloque y, si se imputó a otra, la original en el panel', async () => {
    const element = await setup([
      card({ bookedDate: '2026-10-01', opDate: '2026-09-30', dateChanged: true }),
    ]);
    const date = element.querySelector('.date');
    expect([...(date?.querySelectorAll('[aria-hidden="true"]') ?? [])].map(text)).toEqual([
      '01',
      'oct',
      '2026',
    ]);
    expect(text(date?.querySelector('.visually-hidden'))).toBe('01/10/2026 (fecha modificada)');
    expect(text(element.querySelector('.original-date dd'))).toBe('30/09/2026');
  });

  it('nombra sus acciones a la vista', async () => {
    const element = await setup([card()]);
    expect([...element.querySelectorAll('.foot button')].map(text)).toEqual([
      'Devoluciones',
      'Dividir',
      'Editar',
    ]);
  });

  it('no deja dividir un movimiento vinculado, salvo para editar los submovimientos que ya tiene', async () => {
    const link = {
      kind: 'transfer',
      transactionId: 7,
      date: '2026-10-14',
      description: 'Traspaso',
      accountName: 'Hucha',
      amountCents: 10000,
    } as const;
    const split = {
      id: 9,
      description: 'PARTE',
      amountCents: -1000,
      categoryId: null,
      categoryName: null,
      subcategoryName: null,
      categoryColor: null,
      shared: false,
      refundsTo: [],
    };
    const element = await setup([
      card({ links: [link], linkTexts: ['Traspaso con: Hucha'] }),
      card({ id: 2, links: [link], linkTexts: ['Traspaso con: Hucha'], splits: [split] }),
      card({ id: 3 }),
    ]);
    const buttons = [...element.querySelectorAll<HTMLButtonElement>('button.split')];
    expect(buttons.map((b) => b.getAttribute('aria-disabled'))).toEqual(['true', null, null]);
    expect(buttons[0]?.getAttribute('aria-label')).toBe(
      'No se puede dividir un movimiento vinculado: Mercadona, 14/10/2026',
    );
  });

  it('enseña sus vínculos a la vista, salvo las devoluciones, que ya van debajo', async () => {
    const element = await setup([
      card({
        links: [
          {
            kind: 'transfer',
            transactionId: 7,
            date: '2026-10-14',
            description: 'Traspaso',
            accountName: 'Hucha',
            amountCents: 10000,
          },
          {
            kind: 'refundedBy',
            transactionId: 8,
            date: '2026-10-16',
            description: 'Bizum Alex',
            accountName: 'Cuenta Demo',
            amountCents: 1100,
          },
        ],
        linkTexts: ['Traspaso con: Hucha, Traspaso, 14/10/2026, 100,00 €', 'Devuelto por: …'],
      }),
    ]);
    expect([...element.querySelectorAll('.link dd')].map(text)).toEqual([
      'Traspaso con: Hucha, Traspaso, 14/10/2026, 100,00 €',
    ]);
  });

  it('en la vista detallada lo marca en el anfitrión', async () => {
    const element = await setup([card()], true);
    expect(element.classList).toContain('detailed');
  });
});
