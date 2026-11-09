import { Component, computed, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import type { AccountRow } from '@domain/accounts/account';
import { TEXTS } from '@ui/texts';

/** La página en la que se enseña: cambia el título y lo que se dibuja de fondo. */
export type GettingStartedPage = 'month' | 'year' | 'transactions' | 'import';

/**
 * Primeros pasos (ADR-0035): lo que se ve en el Resumen, el Resumen anual y Movimientos mientras
 * no hay nada que enseñar, y en Importar mientras no hay ninguna cuenta a la que subir el extracto. De fondo, apagada, la forma de lo que saldrá en esa página; encima, una
 * tarjeta con los tres pasos (crear la cuenta, importar su extracto, revisar el mes) y el botón
 * del paso que toca. Sin cuenta, el primero; con la cuenta y sin movimientos, el segundo.
 */
@Component({
  selector: 'app-getting-started',
  imports: [MatButtonModule, MatIconModule, RouterLink],
  template: `
    <div class="ghost" aria-hidden="true">
      @switch (page()) {
        @case ('year') {
          <div class="sheet">
            @for (row of sheetRows; track $index) {
              <div class="sheet-row">
                <span class="bar wide"></span>
                @for (cell of sheetCells; track $index) {
                  <span class="bar"></span>
                }
              </div>
            }
          </div>
        }
        @case ('import') {
          <div class="tile import-panel">
            <span class="bar wide"></span>
            <span class="bar"></span>
            <span class="bar"></span>
            <span class="pill"></span>
          </div>
          <div class="list">
            @for (row of importRows; track $index) {
              <div class="list-row">
                <span class="bar short"></span>
                <span class="bar wide"></span>
                <span class="bar"></span>
                <span class="bar short"></span>
              </div>
            }
          </div>
        }
        @case ('transactions') {
          <div class="list">
            @for (row of listRows; track $index) {
              <div class="list-row">
                <span class="bar short"></span>
                <span class="bar wide"></span>
                <span class="bar"></span>
                <span class="bar short"></span>
              </div>
            }
          </div>
        }
        @default {
          <div class="kpis">
            @for (kpi of kpis; track $index) {
              <div class="tile"><span class="bar short"></span><span class="bar tall"></span></div>
            }
          </div>
          <div class="columns">
            <div class="tile column"></div>
            <div class="tile column"></div>
            <div class="tile column"></div>
          </div>
        }
      }
    </div>

    <section class="card" aria-labelledby="getting-started-title">
      <header>
        <p class="eyebrow">{{ t.eyebrow }}</p>
        <h3 id="getting-started-title">{{ title() }}</h3>
        <p class="intro">{{ intro() }}</p>
      </header>

      <ol [attr.aria-label]="t.steps">
        @if (account(); as current) {
          <li class="done">
            <span class="mark"><mat-icon fontIcon="check" aria-hidden="true" /></span>
            <span class="text">
              <strong>
                {{ t.step1Done }} <span class="done-label">· {{ t.doneLabel }}</span>
              </strong>
              <span>{{ accountLine() }}</span>
            </span>
          </li>
          <li class="current" aria-current="step">
            <span class="mark">2</span>
            <span class="text">
              <strong>{{ t.step2Title }}</strong>
              <span>{{ t.step2Text }}</span>
            </span>
          </li>
        } @else {
          <li class="current" aria-current="step">
            <span class="mark">1</span>
            <span class="text">
              <strong>{{ t.step1Title }}</strong>
              <span>{{ t.step1Text }}</span>
            </span>
          </li>
          <li>
            <span class="mark">2</span>
            <span class="text">
              <strong>{{ t.step2Title }}</strong>
              <span>{{ t.step2Text }}</span>
            </span>
          </li>
        }
        <li>
          <span class="mark">3</span>
          <span class="text">
            <strong>{{ t.step3Title }}</strong>
            <span>{{ t.step3Text }}</span>
          </span>
        </li>
      </ol>

      <div class="actions">
        @if (account()) {
          <a mat-flat-button routerLink="/importar">
            <mat-icon fontIcon="upload_file" aria-hidden="true" />
            {{ t.ctaImport }}
          </a>
        } @else {
          <a mat-flat-button routerLink="/configuracion/cuentas">
            <mat-icon fontIcon="add" aria-hidden="true" />
            {{ t.ctaCreate }}
          </a>
        }
        <span class="privacy">
          <mat-icon fontIcon="lock" aria-hidden="true" />
          {{ t.privacy }}
        </span>
      </div>
    </section>
  `,
  styles: `
    /*
      El fondo y la tarjeta en la misma celda: crece lo que haga falta, sin solaparse con nada.
      Su alto mínimo deja debajo lo mismo que hay encima (el relleno de la página y su título,
      96 px), así que la tarjeta, centrada en ella, queda en el centro de la pantalla. El fondo no
      pasa de ese alto: si no, en móvil, con todo apilado, estiraría la celda y la tarjeta bajaría.
    */
    :host {
      --screen-area: calc(100dvh - 2 * 96px);

      display: grid;
      max-width: var(--af-table-width, 100%);
      min-height: var(--screen-area);
    }

    .ghost,
    .card {
      grid-area: 1 / 1;
    }

    .ghost {
      display: flex;
      flex-direction: column;
      gap: 16px;
      max-height: var(--screen-area);
      overflow: hidden;
      opacity: 0.55;
      pointer-events: none;
      user-select: none;
    }

    .tile,
    .sheet,
    .list {
      border-radius: 16px;
      background: var(--mat-sys-surface-container-lowest);
    }

    .bar {
      display: block;
      height: 10px;
      border-radius: 6px;
      background: var(--mat-sys-surface-container-high);
    }

    .bar.short {
      width: 45%;
    }

    .bar.tall {
      width: 75%;
      height: 22px;
    }

    .kpis {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 16px;
    }

    .kpis .tile {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 20px;
    }

    .columns {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 16px;
    }

    .column {
      height: 420px;
    }

    .sheet {
      padding: 8px 0;
    }

    .sheet-row {
      display: grid;
      grid-template-columns: 2fr repeat(13, minmax(0, 1fr));
      gap: 8px;
      padding: 12px 16px;
    }

    .sheet-row + .sheet-row {
      border-top: 1px solid var(--mat-sys-outline-variant);
    }

    .import-panel {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 24px;
    }

    .import-panel .bar:nth-child(2) {
      width: 70%;
    }

    .import-panel .bar:nth-child(3) {
      width: 40%;
    }

    .pill {
      width: 160px;
      height: 40px;
      border-radius: 20px;
      background: var(--mat-sys-surface-container-high);
    }

    .list-row {
      display: grid;
      grid-template-columns: 1fr 4fr 2fr 1fr;
      gap: 16px;
      padding: 16px;
    }

    .list-row + .list-row {
      border-top: 1px solid var(--mat-sys-outline-variant);
    }

    /*
      Por delante del fondo: con su opacidad, el fondo se pinta en una capa propia que, sin esto,
      quedaría encima de la tarjeta aunque vaya antes.
    */
    .card {
      position: relative;
      z-index: 1;
      align-self: center;
      justify-self: center;
      display: flex;
      flex-direction: column;
      gap: 24px;
      width: min(640px, 100% - 32px);
      box-sizing: border-box;
      padding: 36px 40px;
      border-radius: 24px;
      background: var(--mat-sys-surface-container-lowest);
      box-shadow:
        0 1px 2px color-mix(in srgb, var(--mat-sys-shadow) 8%, transparent),
        0 12px 40px color-mix(in srgb, var(--mat-sys-primary) 14%, transparent);
    }

    header {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    header p,
    h3 {
      margin: 0;
    }

    .eyebrow {
      font: var(--mat-sys-label-medium);
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--mat-sys-tertiary);
    }

    h3 {
      font: var(--mat-sys-headline-small);
      font-weight: 600;
      text-wrap: balance;
    }

    .intro {
      font: var(--mat-sys-body-large);
      line-height: 1.6;
      color: var(--mat-sys-on-surface-variant);
    }

    ol {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    li {
      display: flex;
      gap: 16px;
      align-items: flex-start;
      padding: 12px 14px;
      border-radius: 14px;
      color: var(--mat-sys-on-surface-variant);
    }

    .text {
      display: flex;
      flex-direction: column;
      gap: 2px;
      font: var(--mat-sys-body-medium);
    }

    strong {
      font: var(--mat-sys-title-small);
      font-weight: 600;
    }

    .mark {
      display: grid;
      flex: none;
      place-items: center;
      width: 32px;
      height: 32px;
      box-sizing: border-box;
      border: 1.5px solid var(--mat-sys-outline);
      border-radius: 50%;
      font: var(--mat-sys-title-small);
      font-weight: 600;
    }

    .mark mat-icon {
      width: 18px;
      height: 18px;
      font-size: 18px;
    }

    .current {
      background: color-mix(in srgb, var(--mat-sys-primary) 8%, transparent);
      color: var(--mat-sys-on-surface);
    }

    .current .mark {
      border-color: var(--mat-sys-primary);
      background: var(--mat-sys-primary);
      color: var(--mat-sys-on-primary);
    }

    /* Hecho: con la marca y la palabra, no solo con el color. */
    .done .mark {
      border-color: var(--af-positive);
      background: var(--af-positive);
      color: var(--mat-sys-surface-container-lowest);
    }

    .done-label {
      font-weight: 400;
      color: var(--af-positive);
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 16px;
    }

    .actions a {
      min-height: 48px;
      padding-inline: 24px;
    }

    .privacy {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }

    .privacy mat-icon {
      width: 16px;
      height: 16px;
      font-size: 16px;
    }

    /* En móvil, encima quedan además la barra superior (64 px) y un relleno menor (16 px). */
    @media (max-width: 839.98px) {
      :host {
        --screen-area: calc(100dvh - 64px - 2 * 88px);
      }
    }

    @media (max-width: 720px) {
      .kpis {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .columns {
        grid-template-columns: minmax(0, 1fr);
      }

      .sheet-row {
        grid-template-columns: 2fr repeat(4, minmax(0, 1fr));
      }

      .sheet-row .bar:nth-child(n + 6) {
        display: none;
      }

      .card {
        width: 100%;
        padding: 24px 20px;
      }
    }
  `,
})
export class GettingStarted {
  protected readonly t = TEXTS.gettingStarted;
  protected readonly kpis = [0, 1, 2, 3];
  protected readonly sheetRows = Array.from({ length: 14 }, (_, i) => i);
  protected readonly sheetCells = Array.from({ length: 13 }, (_, i) => i);
  protected readonly listRows = Array.from({ length: 10 }, (_, i) => i);
  protected readonly importRows = Array.from({ length: 6 }, (_, i) => i);

  readonly page = input<GettingStartedPage>('month');
  /** La cuenta elegida, si ya hay una (y aún no tiene movimientos); `null`, ninguna. */
  readonly account = input<Pick<AccountRow, 'name' | 'institution'> | null>(null);

  protected readonly title = computed(() => {
    const account = this.account();
    if (account) return this.t.readyTitle.replace('{name}', account.name);
    return this.t.titles[this.page()];
  });

  protected readonly intro = computed(() => {
    const account = this.account();
    if (!account) return this.t.intros[this.page()];
    return account.institution
      ? this.t.readyIntroBank.replace('{bank}', account.institution)
      : this.t.readyIntro;
  });

  protected readonly accountLine = computed(() => {
    const account = this.account();
    if (!account) return '';
    return account.institution
      ? this.t.step1DoneBank.replace('{name}', account.name).replace('{bank}', account.institution)
      : account.name;
  });
}
