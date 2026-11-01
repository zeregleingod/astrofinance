import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  model,
} from '@angular/core';
import { FormField, type FieldTree } from '@angular/forms/signals';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { LANGUAGES, TEXTS, type Language } from '@ui/texts';

/** Un texto por idioma de la interfaz, vacío si no se traduce. */
export type TranslationsModel = Record<Language, string>;

/** Ningún idioma traducido. */
export function emptyTranslations(): TranslationsModel {
  return Object.fromEntries(LANGUAGES.map(({ code }) => [code, ''])) as TranslationsModel;
}

/** Las traducciones guardadas (por código de idioma), en el formulario. */
export function translationsModel(
  translations: Readonly<Record<string, string>>,
): TranslationsModel {
  const model = emptyTranslations();
  for (const { code } of LANGUAGES) model[code] = translations[code] ?? '';
  return model;
}

/** Lo que se guarda: solo los idiomas con texto. */
export function filledTranslations(model: TranslationsModel): Record<string, string> {
  return Object.fromEntries(
    Object.entries(model)
      .map(([code, text]) => [code, text.trim()] as const)
      .filter(([, text]) => text !== ''),
  );
}

/**
 * Campo de texto traducible (ADR-0028): un solo campo con un botón dentro, a la izquierda, que
 * elige qué se escribe en él. El texto por defecto (globo) vale para todos los idiomas; cada
 * idioma (su código) puede tener el suyo, y si no lo tiene se ve el de por defecto, que sale de
 * ejemplo. El menú del botón enseña lo que tiene cada uno.
 *
 * El formulario que lo usa valida y guarda los dos campos; los errores del texto por defecto los
 * enseña él (`invalid`, `describedBy`) y los de las traducciones, este componente.
 */
@Component({
  selector: 'app-translatable-input',
  imports: [FormField, MatIconModule, MatMenuModule, MatTooltipModule],
  template: `
    <div class="box">
      <button
        type="button"
        class="language"
        [class.invalid]="errors().length > 0"
        [matMenuTriggerFor]="menu"
        [attr.aria-label]="texts.translatable.language + ': ' + current()"
        [matTooltip]="texts.translatable.language + ': ' + current()"
      >
        @if (language(); as code) {
          <span class="code" aria-hidden="true">{{ code }}</span>
        } @else {
          <mat-icon fontIcon="language" aria-hidden="true" />
        }
        <mat-icon class="arrow" fontIcon="arrow_drop_down" aria-hidden="true" />
      </button>
      @if (language() === null) {
        <input
          type="text"
          autocomplete="off"
          [id]="inputId()"
          [formField]="defaultField()"
          [attr.aria-label]="label()"
          [attr.aria-invalid]="invalid()"
          [attr.aria-describedby]="describedBy()"
        />
      }
      @for (option of languages; track option.code) {
        @if (option.code === language()) {
          @let field = translations()[option.code];
          <input
            type="text"
            autocomplete="off"
            [id]="inputId()"
            [attr.lang]="option.code"
            [formField]="field"
            [placeholder]="defaultField()().value()"
            [attr.aria-label]="label() + ' (' + option.name + ')'"
            [attr.aria-invalid]="shown(field)"
            [attr.aria-describedby]="errors().length > 0 ? inputId() + '-translations' : null"
          />
        }
      }
    </div>

    <mat-menu #menu="matMenu" [aria-label]="texts.translatable.language">
      <button
        mat-menu-item
        type="button"
        role="menuitemradio"
        [attr.aria-checked]="language() === null"
        (click)="choose(null)"
      >
        <span class="item">
          <span class="mark" aria-hidden="true"><mat-icon fontIcon="language" /></span>
          <span class="option">
            <span>{{ texts.translatable.default }}</span>
            <span class="value">{{
              defaultField()().value() || texts.translatable.defaultHint
            }}</span>
          </span>
        </span>
      </button>
      @for (option of languages; track option.code) {
        @let text = translations()[option.code]().value();
        <button
          mat-menu-item
          type="button"
          role="menuitemradio"
          [attr.aria-checked]="option.code === language()"
          (click)="choose(option.code)"
        >
          <span class="item">
            <span class="mark code" aria-hidden="true">{{ option.code }}</span>
            <span class="option">
              <span [attr.lang]="option.code">{{ option.name }}</span>
              <span class="value" [class.missing]="!text.trim()">{{
                text.trim() || texts.translatable.untranslated
              }}</span>
            </span>
          </span>
        </button>
      }
    </mat-menu>

    @if (errors().length > 0) {
      <p class="alert" [id]="inputId() + '-translations'">
        @for (error of errors(); track error.language) {
          <span [attr.lang]="error.language">{{ error.name }}</span
          >: {{ error.message }}
        }
      </p>
    }
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }

    .box {
      display: flex;
      align-items: stretch;
      box-sizing: border-box;
      min-height: var(--af-input-height, 40px);
      border: 1px solid var(--mat-sys-outline);
      border-radius: 8px;
      background: var(--mat-sys-surface-container-lowest);
      overflow: hidden;

      &:focus-within {
        outline: 2px solid var(--mat-sys-primary);
        outline-offset: 1px;
      }

      // El error no depende solo del color: se explica debajo del campo.
      &:has(input[aria-invalid='true']) {
        border-color: var(--mat-sys-error);
        border-width: 2px;
      }
    }

    .language {
      display: flex;
      flex: none;
      align-items: center;
      padding: 0 2px 0 8px;
      border: 0;
      border-right: 1px solid var(--mat-sys-outline-variant);
      background: var(--mat-sys-surface-container);
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-label-large);
      cursor: pointer;

      &:hover {
        background: var(--mat-sys-surface-container-high);
      }

      &:focus-visible {
        outline: 2px solid var(--mat-sys-primary);
        outline-offset: -2px;
      }

      &.invalid {
        color: var(--mat-sys-error);
      }

      mat-icon {
        width: 20px;
        height: 20px;
        font-size: 20px;
      }

      .arrow {
        margin-left: -2px;
      }
    }

    .code {
      min-width: 20px;
      text-align: center;
      text-transform: uppercase;
      font-weight: 600;
    }

    input {
      flex: 1;
      box-sizing: border-box;
      width: 100%;
      min-width: 0;
      padding: 6px 8px;
      border: 0;
      background: transparent;
      color: var(--mat-sys-on-surface);
      font: var(--mat-sys-body-medium);

      &:focus {
        outline: none;
      }
    }

    // Cada opción del menú: el globo o el código del idioma, y debajo de su nombre, su texto.
    .item {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .mark {
      display: flex;
      flex: none;
      justify-content: center;
      width: 24px;
      color: var(--mat-sys-on-surface-variant);

      mat-icon {
        margin: 0;
      }
    }

    .option {
      display: flex;
      flex-direction: column;
      line-height: 1.3;
    }

    .value {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);

      &.missing {
        font-style: italic;
      }
    }

    .alert {
      display: flex;
      flex-direction: column;
      margin: 4px 0 0;
      color: var(--mat-sys-error);
      font: var(--mat-sys-body-small);
      font-weight: 500;
    }
  `,
})
export class TranslatableInput {
  protected readonly texts = TEXTS;
  protected readonly languages = LANGUAGES;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly injector = inject(Injector);

  /** El texto por defecto, para todos los idiomas. */
  readonly defaultField = input.required<FieldTree<string>>();
  /** Su texto en cada idioma de la interfaz. */
  readonly translations = input.required<FieldTree<TranslationsModel>>();
  /** El `id` del campo, para su `<label for>`. */
  readonly inputId = input.required<string>();
  /** Nombre accesible del campo; en un idioma se le añade el del idioma. */
  readonly label = input.required<string>();
  /** El texto por defecto no vale y se está enseñando por qué. */
  readonly invalid = input(false);
  /** Dónde explica el formulario por qué no vale el texto por defecto. */
  readonly describedBy = input<string | null>(null);
  /** Se ha intentado guardar: los errores se enseñan aunque no se haya tocado el campo. */
  readonly attempted = input(false);
  /** Qué se escribe en el campo: un idioma, o `null` para el texto por defecto. */
  readonly language = model<Language | null>(null);

  protected readonly current = computed(() => {
    const code = this.language();
    return LANGUAGES.find((option) => option.code === code)?.name ?? TEXTS.translatable.default;
  });

  /** Los errores de las traducciones, de todos los idiomas: también los que no se ven. */
  protected readonly errors = computed(() =>
    LANGUAGES.flatMap(({ code, name }) => {
      const field = this.translations()[code];
      return this.shown(field)
        ? field()
            .errors()
            .map((error) => ({ language: code, name, message: error.message }))
        : [];
    }),
  );

  protected shown(field: FieldTree<string>): boolean {
    return field().invalid() && (field().dirty() || this.attempted());
  }

  /** Pasa a escribir en `code` y lleva allí el foco. */
  protected choose(code: Language | null): void {
    this.language.set(code);
    afterNextRender(() => this.host.querySelector<HTMLInputElement>('input')?.focus(), {
      injector: this.injector,
    });
  }
}
