import { Component, booleanAttribute, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { DbService } from '@services/db/db-service';
import { TabSession } from '@services/session/tab-session';
import { ConfirmDialog, type ConfirmDialogData } from '@ui/confirm-dialog/confirm-dialog';
import { TEXTS } from '@ui/texts';

/**
 * «Salir» de la barra lateral, con los datos del usuario abiertos (ADR-0031): tras confirmarlo,
 * cierra la BD, borra la copia de la sesión y vuelve a la landing. Lo que no se haya descargado
 * se pierde, y el diálogo lo avisa. En el menú plegado (`rail`), solo el icono.
 */
@Component({
  selector: 'app-exit-button',
  imports: [MatButtonModule, MatIconModule, MatTooltipModule],
  template: `
    @if (rail()) {
      <button
        mat-icon-button
        type="button"
        [attr.aria-label]="texts.session.exit"
        [matTooltip]="texts.session.exit"
        matTooltipPosition="right"
        (click)="exit()"
      >
        <mat-icon aria-hidden="true">logout</mat-icon>
      </button>
    } @else {
      <button mat-stroked-button type="button" class="full" (click)="exit()">
        <mat-icon aria-hidden="true">logout</mat-icon>
        {{ texts.session.exit }}
      </button>
    }
  `,
  styles: `
    :host {
      display: block;
    }

    .full {
      width: 100%;
    }
  `,
})
export class ExitButton {
  protected readonly texts = TEXTS;
  private readonly db = inject(DbService);
  private readonly session = inject(TabSession);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);

  /** Solo el icono, para el menú lateral plegado. */
  readonly rail = input(false, { transform: booleanAttribute });
  /** Se emite al salir (p. ej. para cerrar el menú en móvil). */
  readonly exited = output();

  protected exit(): void {
    const t = TEXTS.session;
    const data: ConfirmDialogData = {
      title: t.exitTitle,
      lines: [t.exitCloses, this.db.unsavedChanges() ? t.exitUnsaved : t.exitLoses],
      confirm: t.exitConfirm,
      cancel: t.exitCancel,
    };
    this.dialog
      .open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, {
        data,
        role: 'alertdialog',
        maxWidth: '480px',
      })
      .afterClosed()
      .subscribe((confirmed) => {
        if (confirmed) void this.leave();
      });
  }

  private async leave(): Promise<void> {
    await this.session.end();
    this.exited.emit();
    await this.router.navigateByUrl('/');
  }
}
