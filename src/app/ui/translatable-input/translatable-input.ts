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
import { LANGUAGES, TEXTS, language as interfaceLanguage, type Language } from '@ui/texts';

/** Un texto por idioma de la interfaz, vacío si no se ha escrito en ese idioma. */
export type TranslationsModel = Record<Language, string>;

/** Ningún idioma escrito. */
export function emptyTranslations(): TranslationsModel {
  return Object.fromEntries(LANGUAGES.map(({ code }) => [code, ''])) as TranslationsModel;
}

/** Los textos guardados (por código de idioma), en el formulario. */
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
 * Campo de texto traducible (ADR-0028, ADR-0030): un solo campo con un botón dentro, a la
 * izquierda, que elige en qué idioma de la interfaz se escribe. Empieza en el de la interfaz. No
 * hace falta escribirlo en todos: en un idioma vacío se ve, de ejemplo, el texto de `source` (el
 * idioma en que se escribió) o el primero que haya. El menú del botón enseña lo que tiene cada
 * idioma o «Sin traducir».
 *
 * El formulario que lo usa valida y guarda los textos; este componente enseña sus errores: los
 * del conjunto (`translations`, p. ej. «escribe un nombre») y los de cada idioma, con el idioma
 * delante aunque no sea el que se ve.
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
        [attr.aria-label]="texts.translatable.language + ': ' + current().name"
        [matTooltip]="texts.translatable.language + ': ' + current().name"
      >
        <span class="code" aria-hidden="true">{{ current().code }}</span>
        <mat-icon class="arrow" fontIcon="arrow_drop_down" aria-hidden="true" />
      </button>
      @for (option of languages; track option.code) {
        @if (option.code === current().code) {
          @let field = translations()[option.code];
          <input
            type="text"
            autocomplete="off"
            [id]="inputId()"
            [attr.lang]="option.code"
            [formField]="field"
            [placeholder]="fallback()"
            [attr.aria-label]="label() + ' (' + option.name + ')'"
            [attr.aria-invalid]="shown(field) || ownErrors().length > 0"
            [attr.aria-describedby]="errors().length > 0 ? inputId() + '-errors' : null"
          />
        }
      }
    </div>

    <mat-menu #menu="matMenu" [aria-label]="texts.translatable.language">
      @for (option of languages; track option.code) {
        @let text = translations()[option.code]().value();
        <button
          mat-menu-item
          type="button"
          role="menuitemradio"
          [attr.aria-checked]="option.code === current().code"
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
      <p class="alert" [id]="inputId() + '-errors'">
        @for (error of errors(); track $index) {
          <span>
            @if (error.language) {
              <span [attr.lang]="error.language">{{ error.name }}</span
              >:
            }
            {{ error.message }}
          </span>
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

    // Cada opción del menú: el código del idioma y, debajo de su nombre, su texto.
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

  /** El texto en cada idioma de la interfaz; sus errores propios son los del conjunto. */
  readonly translations = input.required<FieldTree<TranslationsModel>>();
  /** El idioma en que se escribió el texto: el que se ve en los idiomas vacíos. */
  readonly source = input<string | null>(null);
  /** El `id` del campo, para su `<label for>`. */
  readonly inputId = input.required<string>();
  /** Nombre accesible del campo; se le añade el del idioma. */
  readonly label = input.required<string>();
  /** Se ha intentado guardar: los errores se enseñan aunque no se haya tocado el campo. */
  readonly attempted = input(false);
  /** En qué idioma se escribe en el campo; sin elegir, en el de la interfaz. */
  readonly language = model<Language | null>(null);

  protected readonly current = computed(() => {
    const code = this.language() ?? interfaceLanguage();
    return LANGUAGES.find((option) => option.code === code) ?? LANGUAGES[0];
  });

  /** Lo que se verá en el idioma elegido si se deja vacío. */
  protected readonly fallback = computed(() => {
    const field = this.translations();
    const text = (code: string) =>
      LANGUAGES.some((option) => option.code === code)
        ? field[code as Language]().value().trim()
        : '';
    const source = this.source();
    return (
      (source ? text(source) : '') ||
      LANGUAGES.map(({ code }) => text(code)).find((value) => value !== '') ||
      ''
    );
  });

  /** Los errores del conjunto, que no son de ningún idioma. */
  protected readonly ownErrors = computed(() => {
    const field = this.translations()();
    return field.dirty() || this.attempted() ? field.errors() : [];
  });

  /** Los del conjunto y los de cada idioma, también de los que no se ven. */
  protected readonly errors = computed(() => [
    ...this.ownErrors().map((error) => ({ language: null, name: '', message: error.message })),
    ...LANGUAGES.flatMap(({ code, name }) => {
      const field = this.translations()[code];
      return this.shown(field)
        ? field()
            .errors()
            .map((error) => ({ language: code, name, message: error.message }))
        : [];
    }),
  ]);

  protected shown(field: FieldTree<string>): boolean {
    return field().invalid() && (field().dirty() || this.attempted());
  }

  /** Pasa a escribir en `code` y lleva allí el foco. */
  protected choose(code: Language): void {
    this.language.set(code);
    afterNextRender(() => this.host.querySelector<HTMLInputElement>('input')?.focus(), {
      injector: this.injector,
    });
  }
}
