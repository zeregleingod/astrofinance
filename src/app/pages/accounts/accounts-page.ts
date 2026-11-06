import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  linkedSignal,
  resource,
  signal,
  untracked,
} from '@angular/core';
import {
  FormField,
  FormRoot,
  disabled,
  form,
  validate,
  type TreeValidationResult,
} from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TEXTS } from '@ui/texts';
import { DbService } from '@services/db/db-service';
import {
  ACCOUNT_BANKS,
  accountError,
  accountErrorCode,
  cleanAccount,
  type AccountErrorCode,
  type AccountRow,
} from '@domain/accounts/account';
import { ConfirmDialog, type ConfirmDialogData } from '@ui/confirm-dialog/confirm-dialog';
import { InfoButton } from '@ui/info-button/info-button';

/** Los campos de una cuenta en un formulario. */
interface AccountModel {
  institution: string;
  name: string;
}

type Problem = { kind: string; message: string } | null;

const t = TEXTS.accounts;

const EMPTY: AccountModel = { institution: '', name: '' };

/**
 * Configuración › Cuentas (ADR-0034). Arriba se da de alta una cuenta eligiendo su banco y
 * dándole nombre; debajo, cada cuenta en su ficha, donde se renombra o se elimina. El banco solo
 * cambia, y la cuenta solo se elimina, mientras no tenga movimientos.
 */
@Component({
  selector: 'app-accounts-page',
  imports: [FormField, FormRoot, InfoButton, MatButtonModule, MatIconModule],
  templateUrl: './accounts-page.html',
  styleUrl: './accounts-page.scss',
})
export class AccountsPage {
  protected readonly texts = TEXTS;
  protected readonly db = inject(DbService);
  private readonly dialog = inject(MatDialog);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  protected readonly banks = ACCOUNT_BANKS;

  private readonly data = resource({
    params: () => (this.db.ready() ? { version: this.db.dataVersion() } : undefined),
    loader: ({ abortSignal }) => this.db.accounts(abortSignal),
  });

  /** Conserva lo anterior mientras se recarga tras un cambio, para que la lista no parpadee. */
  protected readonly accounts = linkedSignal<
    readonly AccountRow[] | undefined,
    readonly AccountRow[]
  >({
    source: () => this.data.value(),
    computation: (value, previous) => value ?? previous?.value ?? [],
  });

  protected readonly error = signal<string | null>(null);
  /** Último cambio guardado, para anunciarlo. */
  protected readonly notice = signal<string | null>(null);
  protected readonly introOpen = signal(false);

  // --- Alta ---

  private readonly model = signal<AccountModel>(EMPTY);
  private readonly attempted = signal(false);

  protected readonly accountForm = form(
    this.model,
    (path) => {
      validate(path.institution, () => bankProblem(this.model()));
      validate(path.name, () => nameProblem(this.model(), this.accounts()));
    },
    { submission: { action: () => this.save(), onInvalid: () => this.attempted.set(true) } },
  );

  /** Los errores no se enseñan por pasar por un campo vacío: solo al escribir o guardar. */
  protected readonly showNameError = computed(() => {
    const name = this.accountForm.name();
    return name.invalid() && (name.dirty() || this.attempted());
  });
  protected readonly showBankError = computed(
    () => this.accountForm.institution().invalid() && this.attempted(),
  );

  // --- Edición en su ficha ---

  protected readonly editing = signal<AccountRow | null>(null);
  private readonly rowModel = signal<AccountModel>(EMPTY);
  private readonly rowAttempted = signal(false);

  protected readonly rowForm = form(
    this.rowModel,
    (path) => {
      validate(path.institution, () => bankProblem(this.rowModel()));
      // Con movimientos, el banco no cambia: con él se reconocen sus extractos al importar.
      disabled(path.institution, { when: () => (this.editing()?.transactionCount ?? 0) > 0 });
      validate(path.name, () => {
        const self = this.editing()?.id;
        return nameProblem(
          this.rowModel(),
          this.accounts().filter((account) => account.id !== self),
        );
      });
    },
    { submission: { action: () => this.saveRow(), onInvalid: () => this.rowAttempted.set(true) } },
  );

  protected readonly showRowError = computed(() => {
    const { name, institution } = this.rowForm;
    return (
      (name().invalid() && (name().dirty() || this.rowAttempted())) ||
      (institution().invalid() && this.rowAttempted())
    );
  });

  constructor() {
    // Sin BD abierta (primera visita, o al salir de la demo) se abre la del usuario.
    effect(() => {
      if (this.db.status() === 'cerrada') {
        untracked(() => void this.db.openLocal().catch(() => undefined));
      }
    });
  }

  /** Los bancos del desplegable de una ficha: los de siempre y, si no está entre ellos, el suyo. */
  protected banksFor(account: AccountRow): readonly string[] {
    const own = account.institution;
    return own && !this.banks.includes(own) ? [own, ...this.banks] : this.banks;
  }

  /** Dos letras del banco para su distintivo: «BD» para Banco Demo. */
  protected initials(institution: string | null): string {
    const [first = '?', ...rest] = (institution ?? '').split(/\s+/u).filter(Boolean);
    const last = rest.at(-1);
    const letters = last ? first.charAt(0) + last.charAt(0) : first.slice(0, 2);
    return letters.toLocaleUpperCase();
  }

  protected movements(account: AccountRow): string {
    if (account.transactionCount === 0) return t.noMovements;
    if (account.transactionCount === 1) return t.oneMovement;
    return `${account.transactionCount} ${t.movements}`;
  }

  protected isEditing(account: AccountRow): boolean {
    return this.editing()?.id === account.id;
  }

  protected edit(account: AccountRow): void {
    this.clearMessages();
    this.editing.set(account);
    this.rowForm().reset({ institution: account.institution ?? '', name: account.name });
    this.rowAttempted.set(false);
    this.afterRender(() => this.rowForm.name().focusBoundControl());
  }

  protected cancelEdit(): void {
    const account = this.editing();
    this.editing.set(null);
    if (account) this.focusAfterRender(`#edit-account-${account.id}`);
  }

  /** Pide confirmación antes de eliminar. Con movimientos ni se ofrece. */
  protected remove(account: AccountRow): void {
    if (account.transactionCount > 0) return;
    const data: ConfirmDialogData = {
      title: `${t.deleteQuestion} «${account.name}»?`,
      lines: [t.deleteUnused, t.deleteIrreversible],
      confirm: t.deleteConfirm,
      cancel: t.deleteCancel,
    };
    this.dialog
      .open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, {
        data,
        role: 'alertdialog',
        maxWidth: '480px',
      })
      .afterClosed()
      .subscribe((confirmed) => {
        if (confirmed) void this.delete(account);
      });
  }

  private async save(): Promise<TreeValidationResult> {
    const account = cleanAccount(this.model());
    this.clearMessages();
    try {
      await this.db.createAccount(account);
    } catch (error) {
      const code = accountErrorCode(error);
      if (code) return this.problemFor(code, this.accountForm);
      this.error.set(t.saveError);
      return undefined;
    }
    this.notice.set(`${t.added} ${account.name}`);
    // Se conserva el banco: lo habitual es dar de alta varias cuentas del mismo.
    this.accountForm().reset({ ...EMPTY, institution: account.institution });
    this.attempted.set(false);
    this.accountForm.name().focusBoundControl();
    return undefined;
  }

  private async saveRow(): Promise<TreeValidationResult> {
    const current = this.editing();
    if (!current) return undefined;
    const account = cleanAccount(this.rowModel());
    const changed =
      account.name !== current.name || account.institution !== (current.institution ?? '');

    this.clearMessages();
    if (changed) {
      try {
        await this.db.updateAccount({ id: current.id, ...account });
      } catch (error) {
        const code = accountErrorCode(error);
        if (code) return this.problemFor(code, this.rowForm);
        this.error.set(t.saveError);
        return undefined;
      }
      this.notice.set(`${t.saved} ${account.name}`);
    }
    this.cancelEdit();
    return undefined;
  }

  private async delete(account: AccountRow): Promise<void> {
    this.clearMessages();
    try {
      await this.db.deleteAccount(account.id);
    } catch (error) {
      const code = accountErrorCode(error);
      this.error.set(code ? t.errors[code] : t.deleteError);
      return;
    }
    this.notice.set(`${t.deleted} ${account.name}`);
    this.editing.set(null);
    // El botón que abrió el diálogo ya no existe: el foco vuelve al título de la lista.
    this.focusAfterRender('#account-list-title');
  }

  /** Un error del worker, en el campo al que se refiere. */
  private problemFor(
    code: AccountErrorCode,
    target: typeof this.accountForm,
  ): TreeValidationResult {
    const fieldTree = code.startsWith('banco') ? target.institution : target.name;
    return { kind: code, message: t.errors[code], fieldTree };
  }

  private clearMessages(): void {
    this.error.set(null);
    this.notice.set(null);
  }

  private focusAfterRender(selector: string): void {
    this.afterRender(() => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus());
  }

  private afterRender(callback: () => void): void {
    afterNextRender(callback, { injector: this.injector });
  }
}

/** Lo que falla en el nombre, si falla. */
function nameProblem(model: AccountModel, others: readonly AccountRow[]): Problem {
  const code = accountError(model, others);
  return code?.startsWith('nombre') ? { kind: code, message: t.errors[code] } : null;
}

/** Lo que falla en el banco, si falla; el nombre va aparte. */
function bankProblem(model: AccountModel): Problem {
  const code = accountError({ institution: model.institution, name: 'x' });
  return code?.startsWith('banco') ? { kind: code, message: t.errors[code] } : null;
}
