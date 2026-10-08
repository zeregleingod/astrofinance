import type { SqlDb } from '../sql-db';
import { categoryTemplateStatements } from './category-template';

/**
 * Datos ficticios y anónimos para el modo demo (`/demo`). Solo se cargan en una BD en memoria
 * que nunca se guarda. Recorren todos los bloques de la hoja mensual y los casos del modelo
 * (ADR-0005): reembolsos que cubren varios gastos, reembolsos imputados al mes anterior,
 * cuotas `n/N`, traspasos a huchas, devoluciones, previstos, presupuestos y un movimiento
 * sin categoría.
 */
export const DEMO_PERIODS = ['2026-07', '2026-08', '2026-09'] as const;

/** Subcategorías que solo existen en la demo (grupo de la plantilla, nombre). */
export const DEMO_EXTRA_CATEGORIES = [
  ['Suministros', 'Agua'],
  ['Suministros', 'Internet y móvil'],
  ['Variables', 'Mascotas'],
  ['Variables', 'Transporte'],
] as const;

export function loadDemoData(db: SqlDb): void {
  db.transaction(() => new DemoBuilder(db).build());
}

interface TxOptions {
  readonly note?: string;
  /** Fecha imputada si el movimiento pertenece a otra fecha. */
  readonly bookedDate?: string;
  readonly ruleId?: number;
}

class DemoBuilder {
  private readonly categoryIds = new Map<string, number>();

  constructor(private readonly db: SqlDb) {}

  build(): void {
    this.loadCategories();

    const main = this.account('Cuenta principal', 'corriente', 'Banco Demo', '0001', 245000);
    const travel = this.account('Hucha viajes', 'ahorro', 'Banco Online Demo', '0002', 120000);
    const emergency = this.account(
      'Hucha emergencias',
      'ahorro',
      'Banco Online Demo',
      '0003',
      300000,
    );
    const alex = this.insert('INSERT INTO people (name) VALUES (?)', ['Alex']);

    const rules = {
      supermarket: this.rule('Supermercados', 10, 'contiene', 'Supermercado', 'Comida'),
      fuel: this.rule('Gasolineras', 20, 'contiene', 'Gasolinera', 'Transporte'),
      streaming: this.rule(
        'Streaming',
        30,
        'empieza',
        'Streaming Demo',
        'Plataformas y suscripciones',
      ),
    };

    const loans = {
      mortgage: this.loan(
        'Hipoteca',
        'hipoteca',
        'Banco Demo',
        main,
        'Cuota hipoteca',
        9000000,
        245,
        41236,
        300,
        '2021-05-01',
        alex,
        20618,
      ),
      sofa: this.loan(
        'Sofá',
        'financiacion',
        'Financiera Demo',
        main,
        'Financiaciones',
        268608,
        0,
        11192,
        24,
        '2025-01-05',
        alex,
        5596,
      ),
      kitchen: this.loan(
        'Muebles de cocina',
        'financiacion',
        'Tienda Demo',
        main,
        'Financiaciones',
        50490,
        0,
        5049,
        10,
        '2025-12-02',
        alex,
        2525,
      ),
      tax: this.loan(
        'Aplazamiento IRPF',
        'aplazamiento',
        'Agencia Tributaria',
        main,
        'Financiaciones',
        158220,
        0,
        13185,
        12,
        '2026-01-05',
        null,
        null,
      ),
    };

    const series = {
      lifeInsurance: this.series(
        'Seguro de vida de la hipoteca',
        'manual',
        'confirmada',
        'mensual',
        '2021-05-03',
        -677,
        'Seguros de la vivienda',
      ),
      propertyTax: this.series(
        'IBI',
        'manual',
        'confirmada',
        'anual',
        '2026-07-15',
        -32050,
        'Impuestos',
      ),
      homeInsurance: this.series(
        'Seguro del hogar',
        'manual',
        'confirmada',
        'anual',
        '2026-08-12',
        -18420,
        'Seguros de la vivienda',
      ),
      wasteTax: this.series(
        'Tasa de basuras',
        'manual',
        'confirmada',
        'anual',
        '2026-09-18',
        null,
        'Impuestos',
      ),
      gym: this.series(
        'Gimnasio Demo',
        'detectada',
        'confirmada',
        'mensual',
        '2025-03-02',
        -3990,
        'Plataformas y suscripciones',
        'GIMNASIO DEMO',
        97,
      ),
    };
    // Sin ocurrencias: un previsto futuro de importe desconocido y una sugerencia del detector.
    this.series(
      'Revisión de la caldera',
      'manual',
      'confirmada',
      'anual',
      '2026-11-15',
      null,
      'Hogar',
    );
    this.series(
      'Streaming Demo',
      'detectada',
      'sugerida',
      'mensual',
      '2026-07-15',
      -1399,
      'Plataformas y suscripciones',
      'STREAMING DEMO',
      92,
    );

    DEMO_PERIODS.forEach((period, m) => {
      const d = (day: number) => `${period}-${String(day).padStart(2, '0')}`;
      const pick = <T>(values: readonly [T, T, T]): T => values[m] as T;

      // --- Ingresos ---
      this.tx(main, d(10), 185000, 'Nómina - Empresa Demo S.L.', 'Nómina');
      if (m === 0)
        this.tx(main, d(18), 12000, 'Venta de segunda mano - Bicicleta', 'Ingresos extra');
      if (m === 1)
        this.tx(main, d(22), 21437, 'Devolución Agencia Tributaria - IRPF', 'Ingresos extra');
      if (m === 2) this.tx(main, d(26), 2500, 'Transferencia recibida - Concepto pendiente', null);

      // --- Ahorro: traspasos a las huchas ---
      this.transfer(main, travel, d(1), 10000, 'Traspaso a Hucha viajes');
      this.transfer(
        main,
        emergency,
        d(5),
        pick([5000, 5000, 10000]),
        'Traspaso a Hucha emergencias',
      );

      // --- Hipoteca y vivienda ---
      const mortgage = this.tx(
        main,
        d(1),
        -41236,
        'Préstamo hipotecario - Banco Demo',
        'Cuota hipoteca',
      );
      this.installment(loans.mortgage, 63 + m, d(1), 41236, mortgage);
      this.share(mortgage, alex, 20618);
      const life = this.tx(
        main,
        d(3),
        -677,
        'Seguro de vida - Aseguradora Demo',
        'Seguros de la vivienda',
      );
      this.occurrence(series.lifeInsurance, d(3), life);
      this.share(life, alex, 338);
      const mortgageBizum =
        m < 2
          ? this.tx(
              main,
              d(4),
              20956,
              'Bizum recibido - Alex - Hipoteca y seguro',
              'Cuota hipoteca',
            )
          : this.tx(
              main,
              '2026-10-02',
              20956,
              'Bizum recibido - Alex - Hipoteca y seguro',
              'Cuota hipoteca',
              {
                bookedDate: '2026-09-04',
                note: 'Llega en octubre, pero devuelve la cuota de septiembre.',
              },
            );
      this.reimburse(mortgageBizum, [
        [mortgage, 20618],
        [life, 338],
      ]);
      if (m === 0) {
        const ibi = this.tx(main, d(15), -32050, 'IBI - Ayuntamiento', 'Impuestos');
        this.occurrence(series.propertyTax, d(15), ibi);
        this.share(ibi, alex, 16025);
        this.reimburse(this.tx(main, d(20), 16025, 'Bizum recibido - Alex - IBI', 'Impuestos'), [
          [ibi, 16025],
        ]);
      }
      if (m === 1) {
        // Pendiente de cobrar: Alex aún no ha devuelto su mitad.
        const home = this.tx(
          main,
          d(12),
          -18420,
          'Seguro del hogar - Aseguradora Demo',
          'Seguros de la vivienda',
        );
        this.occurrence(series.homeInsurance, d(12), home);
        this.share(home, alex, 9210);
      }
      if (m === 2) {
        const waste = this.tx(main, d(18), -7800, 'Tasa de basuras - Ayuntamiento', 'Impuestos');
        this.occurrence(series.wasteTax, d(18), waste);
      }

      // --- Préstamos y financiaciones ---
      const sofa = this.tx(
        main,
        d(5),
        -11192,
        `Financiación sofá - Financiera Demo - ${19 + m}/24`,
        'Financiaciones',
      );
      this.installment(loans.sofa, 19 + m, d(5), 11192, sofa);
      this.share(sofa, alex, 5596);
      const kitchen = this.tx(
        main,
        d(2),
        -5049,
        `Financiación cocina - Tienda Demo - ${8 + m}/10`,
        'Financiaciones',
      );
      this.installment(loans.kitchen, 8 + m, d(2), 5049, kitchen);
      this.share(kitchen, alex, 2525);
      this.reimburse(
        this.tx(main, d(12), 8121, 'Bizum recibido - Alex - Financiaciones', 'Financiaciones'),
        [
          [sofa, 5596],
          [kitchen, 2525],
        ],
      );
      const tax = this.tx(
        main,
        d(5),
        -13185,
        `Aplazamiento IRPF - Agencia Tributaria - ${7 + m}/12`,
        'Financiaciones',
      );
      this.installment(loans.tax, 7 + m, d(5), 13185, tax);
      const gym = this.tx(
        main,
        d(2),
        -3990,
        'Gimnasio Demo - Cuota mensual',
        'Plataformas y suscripciones',
      );
      this.occurrence(series.gym, d(2), gym);
      this.tx(
        main,
        d(15),
        pick([-1299, -1299, -1399]),
        'Streaming Demo - Suscripción',
        'Plataformas y suscripciones',
        {
          ruleId: rules.streaming,
        },
      );
      this.tx(main, d(20), -1000, 'ONG Demo - Cuota de socio', 'Donaciones y colaboraciones');
      if (m === 1) this.tx(main, d(31), -250, 'Comisión de mantenimiento', 'Otros');

      // --- Suministros ---
      const community = this.tx(
        main,
        d(5),
        -4000,
        'Comunidad de propietarios - Cuota',
        'Comunidad de vecinos',
      );
      this.share(community, alex, 2000);
      this.reimburse(
        this.tx(main, d(6), 2000, 'Bizum recibido - Alex - Comunidad', 'Comunidad de vecinos'),
        [[community, 2000]],
      );
      const power = pick([5215, 6130, 4870]);
      const light = this.tx(main, d(23), -power, 'Eléctrica Demo - Factura de luz', 'Luz');
      this.share(light, alex, power); // La luz la paga entera Alex.
      this.reimburse(this.tx(main, d(25), power, 'Bizum recibido - Alex - Luz', 'Luz'), [
        [light, power],
      ]);
      this.tx(main, d(8), -4500, 'Operadora Demo - Fibra y móvil', 'Internet y móvil');
      if (m === 1) {
        const water = this.tx(main, d(19), -2840, 'Aguas Demo - Factura bimestral', 'Agua');
        this.share(water, alex, 1420);
        this.reimburse(this.tx(main, d(21), 1420, 'Bizum recibido - Alex - Agua', 'Agua'), [
          [water, 1420],
        ]);
      }

      // --- Variables ---
      this.tx(main, d(3), -2710, 'Supermercado Barrio', 'Comida', { ruleId: rules.supermarket });
      this.tx(main, d(9), -1075, 'Mercado Central - Pescadería', 'Comida');
      const groceries = this.tx(main, d(17), -3929, 'Supermercado Barrio', 'Comida', {
        ruleId: rules.supermarket,
      });
      this.share(groceries, alex, 3929);
      if (m < 2) {
        this.reimburse(this.tx(main, d(27), 3929, 'Bizum recibido - Alex - Compra', 'Comida'), [
          [groceries, 3929],
        ]);
      }
      this.tx(main, d(25), -1250, 'Frutería La Huerta', 'Comida');

      this.tx(main, d(23), -791, 'Farmacia Centro', 'Cuidado personal');
      if (m === 0) this.tx(main, d(11), -2500, 'Peluquería Demo', 'Cuidado personal');
      if (m === 1) this.tx(main, d(4), -4600, 'Centro de bienestar - Masaje', 'Cuidado personal');

      if (m === 1) {
        const dinner = this.tx(main, d(24), -7000, 'Restaurante La Plaza - Cena', 'Restaurantes');
        this.share(dinner, alex, 3500);
        this.reimburse(this.tx(main, d(27), 3500, 'Bizum recibido - Alex - Cena', 'Restaurantes'), [
          [dinner, 3500],
        ]);
      }
      if (m === 2) this.tx(main, d(13), -3240, 'Pizzería Demo', 'Restaurantes');

      if (m === 0) this.tx(main, d(16), -1855, 'Ferretería Demo', 'Hogar');
      if (m === 1) this.tx(main, d(20), -1180, 'Bazar Demo - Organizadores', 'Hogar');
      if (m === 2) {
        const curtains = this.tx(main, d(28), -13093, 'Tienda de muebles Demo - Cortinas', 'Hogar');
        this.share(curtains, alex, 6547);
        this.reimburse(
          this.tx(main, '2026-10-03', 6547, 'Bizum recibido - Alex - Cortinas', 'Hogar', {
            bookedDate: '2026-09-28',
            note: 'Llega en octubre, pero devuelve un gasto de septiembre.',
          }),
          [[curtains, 6547]],
        );
      }

      if (m === 0) this.tx(main, d(21), -1325, 'Librería Demo - Libro', 'Ocio');
      if (m === 1) this.tx(main, d(9), -1500, 'Cine Demo', 'Ocio');
      if (m === 2) this.tx(main, d(21), -1000, 'Bizum enviado - Entradas concierto', 'Ocio');
      if (m === 1) this.tx(main, d(13), -2240, 'Tienda de manualidades Demo', 'Manualidades');
      if (m === 2) this.tx(main, d(1), -4900, 'Academia online Demo - Curso', 'Estudios');
      if (m !== 1) this.tx(main, d(7), -3000, 'Yes Be More - Cuota', 'Yes Be More');

      if (m === 0) {
        this.tx(main, d(16), -8000, 'Tienda de ropa Demo', 'Ropa');
        this.tx(main, d(23), 1800, 'Devolución Tienda de ropa Demo', 'Ropa');
      }
      if (m === 2) {
        this.tx(main, d(16), -3599, 'Zapatería Demo', 'Ropa');
        this.tx(main, d(23), 3599, 'Devolución Zapatería Demo', 'Ropa');
      }

      if (m === 1)
        this.tx(travel, d(14), -17000, 'Hotel Costa Demo - Fin de semana', 'Escapadas y viajes');

      if (m === 1) this.tx(main, d(2), -4500, 'Joyería Demo - Regalo aniversario', 'Regalos');
      if (m === 2) {
        this.tx(main, d(19), -4000, 'Tienda Demo - Regalo de cumpleaños', 'Regalos');
        this.tx(main, d(20), 18000, 'Bizum recibido - Familia - Regalo', 'Regalos');
      }

      this.tx(main, d(10), -1515, 'Tienda de animales Demo - Pienso', 'Mascotas');
      if (m === 1) this.tx(main, d(3), -14000, 'Clínica veterinaria Demo', 'Mascotas');

      this.tx(main, d(6), -5500, 'Gasolinera Demo', 'Transporte', { ruleId: rules.fuel });
      if (m !== 1) this.tx(main, d(18), -650, 'Parking Centro', 'Transporte');

      // --- Presupuesto del mes ---
      for (const [category, cents] of [
        ['Comida', 15000],
        ['Restaurantes', 8000],
        ['Ocio', 5000],
        ['Ropa', 6000],
        ['Transporte', 8000],
        ['Cuidado personal', 6000],
      ] as const) {
        this.db.run('INSERT INTO budgets (category_id, period, amount_cents) VALUES (?, ?, ?)', [
          this.category(category),
          period,
          cents,
        ]);
      }
    });
  }

  private loadCategories(): void {
    for (const statement of categoryTemplateStatements())
      this.db.run(statement.sql, statement.bind);
    DEMO_EXTRA_CATEGORIES.forEach(([group, name], i) =>
      this.db.run(
        `INSERT INTO categories (parent_id, name, kind, sort_order)
         SELECT id, ?, kind, ? FROM categories WHERE parent_id IS NULL AND name = ?`,
        [name, 100 + i, group],
      ),
    );
    for (const row of this.db.rows('SELECT id, name FROM categories WHERE parent_id IS NOT NULL')) {
      this.categoryIds.set(String(row['name']), Number(row['id']));
    }
  }

  private category(name: string): number {
    const id = this.categoryIds.get(name);
    if (id === undefined) throw new Error(`Categoría demo desconocida: ${name}`);
    return id;
  }

  private insert(sql: string, bind: readonly (string | number | null)[]): number {
    this.db.run(sql, bind);
    return this.db.lastInsertId();
  }

  private account(
    name: string,
    kind: string,
    institution: string,
    last4: string,
    opening: number,
  ): number {
    return this.insert(
      `INSERT INTO accounts (name, kind, institution, iban_last4, opening_balance_cents, opening_date)
       VALUES (?, ?, ?, ?, ?, '2026-06-30')`,
      [name, kind, institution, last4, opening],
    );
  }

  private rule(
    name: string,
    priority: number,
    operator: string,
    pattern: string,
    category: string,
  ): number {
    return this.insert(
      `INSERT INTO rules (name, priority, operator, pattern, sign, category_id) VALUES (?, ?, ?, ?, 'gasto', ?)`,
      [name, priority, operator, pattern, this.category(category)],
    );
  }

  private loan(
    name: string,
    kind: string,
    lender: string,
    account: number,
    category: string,
    principal: number,
    rateBp: number,
    installment: number,
    total: number,
    firstDue: string,
    person: number | null,
    shared: number | null,
  ): number {
    return this.insert(
      `INSERT INTO loans (name, kind, lender, account_id, category_id, principal_cents, annual_rate_bp,
         installment_cents, installments_total, first_due_date, shared_person_id, shared_cents)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        kind,
        lender,
        account,
        this.category(category),
        principal,
        rateBp,
        installment,
        total,
        firstDue,
        person,
        shared,
      ],
    );
  }

  private series(
    name: string,
    source: string,
    status: string,
    frequency: string,
    anchor: string,
    expected: number | null,
    category: string,
    merchantKey: string | null = null,
    confidence: number | null = null,
  ): number {
    return this.insert(
      `INSERT INTO recurring_series (name, source, status, frequency, anchor_date, expected_amount_cents,
         category_id, merchant_key, confidence_pct)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        source,
        status,
        frequency,
        anchor,
        expected,
        this.category(category),
        merchantKey,
        confidence,
      ],
    );
  }

  private tx(
    account: number,
    date: string,
    cents: number,
    description: string,
    category: string | null,
    options: TxOptions = {},
  ): number {
    const source = category === null ? 'ninguna' : options.ruleId ? 'regla' : 'manual';
    return this.insert(
      `INSERT INTO transactions (account_id, op_date, booked_date, amount_cents, description, note,
         category_id, category_source, rule_id, origin)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual')`,
      [
        account,
        date,
        options.bookedDate ?? null,
        cents,
        description,
        options.note ?? null,
        category === null ? null : this.category(category),
        source,
        options.ruleId ?? null,
      ],
    );
  }

  private transfer(
    from: number,
    to: number,
    date: string,
    cents: number,
    description: string,
  ): void {
    const outgoing = this.tx(from, date, -cents, description, 'Aportación a ahorro');
    const incoming = this.tx(to, date, cents, description, 'Aportación a ahorro');
    this.db.run('INSERT INTO transfers (outgoing_tx_id, incoming_tx_id) VALUES (?, ?)', [
      outgoing,
      incoming,
    ]);
  }

  private share(expense: number, person: number, expected: number): void {
    this.db.run(
      'INSERT INTO shared_expenses (transaction_id, person_id, expected_cents) VALUES (?, ?, ?)',
      [expense, person, expected],
    );
  }

  private reimburse(
    reimbursement: number,
    allocations: readonly (readonly [number, number])[],
  ): void {
    for (const [expense, cents] of allocations) {
      this.db.run(
        'INSERT INTO reimbursements (expense_tx_id, reimbursement_tx_id, amount_cents) VALUES (?, ?, ?)',
        [expense, reimbursement, cents],
      );
    }
  }

  private installment(loan: number, number: number, due: string, cents: number, tx: number): void {
    this.db.run(
      `INSERT INTO loan_installments (loan_id, number, due_date, amount_cents, transaction_id)
       VALUES (?, ?, ?, ?, ?)`,
      [loan, number, due, cents, tx],
    );
  }

  private occurrence(series: number, due: string, tx: number): void {
    this.db.run(
      `INSERT INTO recurring_occurrences (series_id, due_date, status, transaction_id)
       VALUES (?, ?, 'cumplida', ?)`,
      [series, due, tx],
    );
  }
}
