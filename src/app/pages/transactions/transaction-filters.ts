import {
  Component,
  type ElementRef,
  computed,
  effect,
  input,
  linkedSignal,
  model,
  signal,
  untracked,
  viewChildren,
} from '@angular/core';
import { FormField, FormRoot, form, validate } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule, type MatDatepickerInputEvent } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { TEXTS } from '@ui/texts';
import { centsToInput, parseCents } from '@domain/money/parse-cents';
import {
  NO_FILTER,
  TRANSACTION_TAGS,
  type SubcategoryChoice,
  type TransactionFilter,
  type TransactionFilterOptions,
  type TransactionTag,
} from '@domain/reports/transaction-filter';
import { dateToIso, isoToDate, provideEsDatepicker } from '@ui/dates/es-datepicker';

/** Los filtros tal como están en el formulario: textos; el vacío no filtra. */
interface FilterModel {
  year: string;
  from: string;
  to: string;
  tag: string;
  category: string;
  subcategory: string;
  account: string;
  minAmount: string;
  maxAmount: string;
}

const t = TEXTS.transactions;
const f = t.filters;

const TAG_LABELS: Readonly<Record<TransactionTag, string>> = {
  shared: t.shared,
  reimbursement: t.reimbursement,
  transfer: t.transfer,
  installment: t.installment,
  split: t.split,
};

/** Valor del desplegable de categoría para «Sin categoría». */
const UNCATEGORIZED = '-';
/** Prefijo del valor de una categoría con nombre, para que ninguna se confunda con lo anterior. */
const NAMED = '=';

const EMPTY: FilterModel = {
  year: '',
  from: '',
  to: '',
  tag: '',
  category: '',
  subcategory: '',
  account: '',
  minAmount: '',
  maxAmount: '',
};

/**
 * Filtros de la lista de movimientos. Lo que se elige no se aplica hasta pulsar «Filtrar»:
 * entonces cambia `filter`. Un campo vacío no filtra.
 */
@Component({
  selector: 'app-transaction-filters',
  imports: [
    FormField,
    FormRoot,
    MatButtonModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  providers: [provideEsDatepicker()],
  templateUrl: './transaction-filters.html',
  styleUrl: './transaction-filters.scss',
})
export class TransactionFilters {
  protected readonly texts = TEXTS;
  protected readonly uncategorized = UNCATEGORIZED;
  protected readonly categoryValue = categoryValue;
  protected readonly tags = TRANSACTION_TAGS.map((tag) => ({ value: tag, label: TAG_LABELS[tag] }));

  /** Lo que se puede elegir en los desplegables. */
  readonly options = input.required<TransactionFilterOptions>();
  /** El filtro aplicado. */
  readonly filter = model<TransactionFilter>(NO_FILTER);

  /** Lo que hay escrito, aplicado o no; si el filtro cambia desde fuera, se pone al día. */
  private readonly draft = linkedSignal(() => toModel(this.filter()));

  /** En «Desde» o «Hasta» hay escrito algo que no es una fecha. */
  private readonly unreadable = signal({ from: false, to: false });
  private readonly dateInputs = viewChildren<ElementRef<HTMLInputElement>>('dateInput');

  protected readonly filterForm = form(
    this.draft,
    (path) => {
      validate(path.from, () => (this.unreadable().from ? problem('date') : null));
      validate(path.to, ({ value }) => {
        if (this.unreadable().to) return problem('date');
        const from = this.draft().from;
        return from && value() && value() < from ? problem('dateOrder') : null;
      });
      validate(path.minAmount, ({ value }) => (isAmount(value()) ? null : problem('amount')));
      validate(path.maxAmount, ({ value }) => {
        if (!isAmount(value())) return problem('amount');
        const min = amount(this.draft().minAmount);
        const max = amount(value());
        return min !== null && max !== null && max < min ? problem('amountOrder') : null;
      });
    },
    { submission: { action: () => Promise.resolve(this.apply()) } },
  );

  /** Las subcategorías de la categoría elegida o, si no hay ninguna elegida, todas. */
  protected readonly subcategories = computed(() => {
    const category = categoryOf(this.draft().category);
    return this.options()
      .subcategories.filter((choice) => category === null || choice.category === category.name)
      .map((choice) => ({
        value: subcategoryValue(choice),
        label: category === null ? `${choice.category} › ${choice.name}` : choice.name,
      }));
  });

  /** Las fechas del borrador tal como las quiere el selector de fecha. */
  protected readonly fromDate = computed(() => isoToDate(this.draft().from));
  protected readonly toDate = computed(() => isoToDate(this.draft().to));

  /** Los errores de todos los campos, sin repetir. */
  protected readonly problems = computed(() => {
    const { from, to, minAmount, maxAmount } = this.filterForm;
    const fields = [from, to, minAmount, maxAmount];
    const messages = fields.flatMap((field) =>
      field()
        .errors()
        .map((error) => error.message),
    );
    return [...new Set(messages)];
  });

  constructor() {
    // Al cambiar de categoría, una subcategoría de otra deja de tener sentido.
    effect(() => {
      const values = this.subcategories().map((choice) => choice.value);
      untracked(() => {
        const subcategory = this.filterForm.subcategory().value;
        if (subcategory() !== '' && !values.includes(subcategory())) subcategory.set('');
      });
    });
  }

  /** Recoge la fecha elegida en el calendario o escrita a mano. */
  protected setDate(field: 'from' | 'to', event: MatDatepickerInputEvent<Date>): void {
    const written = (event.targetElement as HTMLInputElement).value.trim() !== '';
    this.filterForm[field]().value.set(event.value ? dateToIso(event.value) : '');
    this.unreadable.update((current) => ({ ...current, [field]: written && !event.value }));
  }

  protected clear(): void {
    // Un texto que no era una fecha no está en el borrador: se borra del propio campo.
    for (const dateInput of this.dateInputs()) dateInput.nativeElement.value = '';
    this.unreadable.set({ from: false, to: false });
    this.filterForm().reset(EMPTY);
    this.filter.set(NO_FILTER);
  }

  private apply(): undefined {
    this.filter.set(toFilter(this.draft()));
    return undefined;
  }
}

function problem(kind: keyof typeof f.errors): { kind: string; message: string } {
  return { kind, message: f.errors[kind] };
}

/** El importe escrito, sin signo; `null` si el campo está vacío o no es un importe. */
function amount(text: string): number | null {
  const cents = parseCents(text.trim());
  return cents === null ? null : Math.abs(cents);
}

function isAmount(text: string): boolean {
  return text.trim() === '' || amount(text) !== null;
}

function categoryValue(name: string | null): string {
  return name === null ? UNCATEGORIZED : `${NAMED}${name}`;
}

/** La categoría elegida en el desplegable; `null` si no se filtra por categoría. */
function categoryOf(value: string): TransactionFilter['category'] {
  if (value === '') return null;
  return { name: value === UNCATEGORIZED ? null : value.slice(NAMED.length) };
}

function subcategoryValue(choice: SubcategoryChoice): string {
  return JSON.stringify([choice.category, choice.name]);
}

function subcategoryOf(value: string): SubcategoryChoice | null {
  if (value === '') return null;
  const [category, name] = JSON.parse(value) as [string, string];
  return { category, name };
}

function toFilter(model: FilterModel): TransactionFilter {
  return {
    year: model.year === '' ? null : Number(model.year),
    dateFrom: model.from || null,
    dateTo: model.to || null,
    tag: TRANSACTION_TAGS.find((tag) => tag === model.tag) ?? null,
    category: categoryOf(model.category),
    subcategory: subcategoryOf(model.subcategory),
    account: model.account || null,
    minAmountCents: amount(model.minAmount),
    maxAmountCents: amount(model.maxAmount),
  };
}

function toModel(filter: TransactionFilter): FilterModel {
  return {
    year: filter.year === null ? '' : String(filter.year),
    from: filter.dateFrom ?? '',
    to: filter.dateTo ?? '',
    tag: filter.tag ?? '',
    category: filter.category === null ? '' : categoryValue(filter.category.name),
    subcategory: filter.subcategory === null ? '' : subcategoryValue(filter.subcategory),
    account: filter.account ?? '',
    minAmount: filter.minAmountCents === null ? '' : centsToInput(filter.minAmountCents),
    maxAmount: filter.maxAmountCents === null ? '' : centsToInput(filter.maxAmountCents),
  };
}
