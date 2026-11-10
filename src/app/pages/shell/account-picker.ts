import { Component, booleanAttribute, computed, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AccountSelection } from '@services/accounts/account-selection';
import { bankLogoSrc } from '@ui/bank-logo/bank-logo';
import { TEXTS } from '@ui/texts';

/**
 * La cuenta con la que se trabaja (ADR-0035), en la barra lateral entre los accesos rápidos y el
 * menú: un desplegable con su rótulo y, a la izquierda, el logotipo del banco de la elegida (si no
 * lo tiene, un icono de banco). En la barra plegada, un botón con el nombre de la cuenta que
 * abre la lista. Sin cuentas, el hueco del desplegable queda apagado y sin acción: a crearla
 * invitan las páginas (primeros pasos).
 */
@Component({
  selector: 'app-account-picker',
  host: { '[class.rail]': 'rail()' },
  imports: [MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule],
  template: `
    @if (selection.loaded()) {
      @if (selection.account(); as current) {
        @if (rail()) {
          <button
            mat-icon-button
            type="button"
            [attr.aria-label]="texts.accountPicker.change + ' ' + current.name"
            [matTooltip]="texts.accountPicker.label + ': ' + current.name"
            matTooltipPosition="right"
            [matMenuTriggerFor]="accountMenu"
          >
            @if (logo(); as src) {
              <img class="logo" [src]="src" alt="" width="28" height="28" />
            } @else {
              <mat-icon fontIcon="account_balance" aria-hidden="true" />
            }
          </button>
          <mat-menu #accountMenu="matMenu" [aria-label]="texts.accountPicker.label">
            @for (account of selection.accounts(); track account.id) {
              <button
                mat-menu-item
                type="button"
                role="menuitemradio"
                [attr.aria-checked]="account.id === current.id"
                (click)="choose(account.id)"
              >
                <mat-icon
                  [fontIcon]="account.id === current.id ? 'check' : ''"
                  aria-hidden="true"
                />
                <span>{{ account.name }}</span>
              </button>
            }
          </mat-menu>
        } @else {
          <label class="label" for="account-picker">{{ texts.accountPicker.label }}</label>
          <div class="field">
            @if (logo(); as src) {
              <img class="lead logo" [src]="src" alt="" width="28" height="28" />
            } @else {
              <mat-icon class="lead" fontIcon="account_balance" aria-hidden="true" />
            }
            <select #picker id="account-picker" (change)="choose(+picker.value)">
              @for (account of selection.accounts(); track account.id) {
                <option [value]="account.id" [selected]="account.id === current.id">
                  {{ account.name }}
                </option>
              }
            </select>
            <mat-icon class="trail" fontIcon="expand_more" aria-hidden="true" />
          </div>
        }
      } @else if (rail()) {
        <!-- Sin cuentas: el hueco del desplegable, apagado y sin acción (la invitación está en la página). -->
        <span
          class="placeholder-icon"
          role="img"
          [attr.aria-label]="texts.accountPicker.label + ': ' + texts.accountPicker.empty"
          [matTooltip]="texts.accountPicker.emptyTooltip"
          matTooltipPosition="right"
        >
          <mat-icon fontIcon="account_balance" aria-hidden="true" />
        </span>
      } @else {
        <p class="label" aria-hidden="true">{{ texts.accountPicker.label }}</p>
        <p class="placeholder">
          <mat-icon fontIcon="account_balance" aria-hidden="true" />
          <span>
            <span class="visually-hidden">{{ texts.accountPicker.label }}: </span>
            {{ texts.accountPicker.empty }}
          </span>
        </p>
      }
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 12px;
      padding: 0 4px 12px;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }

    :host(.rail) {
      align-items: center;
      width: 56px;
      padding-inline: 0;
      padding-bottom: 12px;
    }

    :host:empty {
      display: none;
    }

    .label {
      margin: 0;
      padding: 0 12px;
      font: var(--mat-sys-label-small);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--mat-sys-on-surface-variant);
    }

    /* Sin cuentas: el hueco del desplegable, discontinuo y apagado; no se puede pulsar. */
    .placeholder {
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 44px;
      margin: 0;
      padding: 0 12px;
      box-sizing: border-box;
      border: 1px dashed var(--mat-sys-outline);
      border-radius: 12px;
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-on-surface-variant);
    }

    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    .placeholder-icon {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      box-sizing: border-box;
      border: 1px dashed var(--mat-sys-outline);
      border-radius: 50%;
      color: var(--mat-sys-on-surface-variant);
    }

    /* Desplegable nativo: accesible y, en el móvil, con la lista del sistema. */
    .field {
      position: relative;
      display: flex;
      align-items: center;
    }

    /*
      min-width: 0: un <select> mide lo que su opción más larga y, como elemento flexible, no
      encoge por debajo; con un nombre de cuenta largo desbordaría la barra lateral.
    */
    select {
      width: 100%;
      min-width: 0;
      min-height: 44px;
      padding: 0 40px 0 48px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 12px;
      background: var(--mat-sys-surface-container-low);
      color: var(--mat-sys-on-surface);
      font: var(--mat-sys-body-large);
      font-weight: 500;
      text-overflow: ellipsis;
      white-space: nowrap;
      overflow: hidden;
      appearance: none;
      cursor: pointer;
      transition:
        border-color 150ms ease,
        background-color 150ms ease;
    }

    select:hover {
      border-color: var(--mat-sys-outline);
      background: var(--mat-sys-surface-container);
    }

    select:focus-visible {
      outline: 2px solid var(--mat-sys-primary);
      outline-offset: 2px;
    }

    option {
      background: var(--mat-sys-surface-container);
      color: var(--mat-sys-on-surface);
    }

    .lead,
    .trail {
      position: absolute;
      pointer-events: none;
      color: var(--mat-sys-on-surface-variant);
    }

    .lead {
      left: 10px;
      color: var(--mat-sys-primary);
    }

    .trail {
      right: 10px;
    }

    /* El logotipo va con alt="": el nombre de la cuenta ya está en el desplegable o en el botón. */
    .logo {
      display: block;
      width: 28px;
      height: 28px;
      border-radius: 6px;
      object-fit: contain;
    }

    @media (prefers-reduced-motion: reduce) {
      select {
        transition: none;
      }
    }
  `,
})
export class AccountPicker {
  protected readonly texts = TEXTS;
  protected readonly selection = inject(AccountSelection);
  /** El logotipo del banco de la cuenta elegida, si lo tiene. */
  protected readonly logo = computed(() =>
    bankLogoSrc(this.selection.account()?.institution ?? null),
  );

  /** En la barra plegada: solo un botón. */
  readonly rail = input(false, { transform: booleanAttribute });

  protected choose(id: number): void {
    if (Number.isSafeInteger(id) && id > 0) this.selection.select(id);
  }
}
