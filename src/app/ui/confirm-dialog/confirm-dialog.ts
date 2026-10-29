import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';

export interface ConfirmDialogData {
  readonly title: string;
  /** Un párrafo por línea. */
  readonly lines: readonly string[];
  readonly confirm: string;
  readonly cancel: string;
}

/**
 * Diálogo de confirmación de una acción que no se puede deshacer. Se cierra con `true` solo si
 * se confirma; el foco empieza en «Cancelar». Ábrelo con `role: 'alertdialog'`.
 */
@Component({
  selector: 'app-confirm-dialog',
  imports: [MatButtonModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      @for (line of data.lines; track line) {
        <p>{{ line }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" cdkFocusInitial [mat-dialog-close]="false">
        {{ data.cancel }}
      </button>
      <button mat-flat-button type="button" class="confirm" [mat-dialog-close]="true">
        {{ data.confirm }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    p {
      margin: 0 0 12px;

      &:last-child {
        margin-bottom: 0;
      }
    }

    .confirm {
      --mat-button-filled-container-color: var(--mat-sys-error);
      --mat-button-filled-label-text-color: var(--mat-sys-on-error);
    }
  `,
})
export class ConfirmDialog {
  protected readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
}
