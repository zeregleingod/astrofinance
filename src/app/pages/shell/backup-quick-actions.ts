import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { BackupService } from '@services/backup/backup-service';
import {
  backupFailureText,
  backupNoticeText,
  confirmBackupReplace,
} from '@ui/backup/backup-messages';
import { TEXTS } from '@ui/texts';

/** Lo que dura a la vista el aviso de una tarea terminada bien. */
const NOTICE_MS = 6000;

/**
 * Accesos rápidos de la barra lateral para descargar y cargar una copia sin ir a
 * Configuración › Copia de seguridad. El resultado se anuncia en un aviso emergente; los errores
 * se quedan hasta que se cierran.
 */
@Component({
  selector: 'app-backup-quick-actions',
  imports: [MatButtonModule, MatIconModule, MatTooltipModule],
  host: { class: 'backup-quick-actions' },
  template: `
    <button
      mat-icon-button
      type="button"
      disabledInteractive
      [disabled]="backup.busy() !== null || backup.nothingToExport() !== null"
      [attr.aria-label]="texts.backup.exportTitle"
      [matTooltip]="texts.backup.exportTitle"
      (click)="download()"
    >
      <mat-icon fontIcon="download" aria-hidden="true" />
    </button>
    <input #file hidden type="file" accept=".db" (change)="choose(file)" />
    <button
      mat-icon-button
      type="button"
      disabledInteractive
      [disabled]="backup.busy() !== null"
      [attr.aria-label]="texts.backup.restoreTitle"
      [matTooltip]="texts.backup.restoreTitle"
      (click)="file.click()"
    >
      <mat-icon fontIcon="upload" aria-hidden="true" />
    </button>
  `,
  styles: `
    :host {
      display: contents;
    }
  `,
})
export class BackupQuickActions {
  protected readonly texts = TEXTS;
  protected readonly backup = inject(BackupService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);

  protected async download(): Promise<void> {
    if (this.backup.busy() !== null || this.backup.nothingToExport() !== null) return;
    if (await this.backup.download(TEXTS.backup.fileType)) this.announce();
  }

  protected async choose(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    // Permite volver a elegir el mismo fichero tras un error o una cancelación.
    input.value = '';
    if (
      file &&
      (await this.backup.restore(file, (name) => confirmBackupReplace(this.dialog, name)))
    )
      this.announce();
  }

  private announce(): void {
    const error = this.backup.error();
    if (error) {
      this.snackBar.open(backupFailureText(error), TEXTS.backup.close, { politeness: 'assertive' });
      return;
    }
    const notice = this.backup.notice();
    if (!notice) return;
    const message = backupNoticeText(notice);
    if (notice.task === 'cargando') {
      this.snackBar
        .open(message, TEXTS.backup.viewTransactions, { duration: NOTICE_MS })
        .onAction()
        .subscribe(() => void this.router.navigateByUrl('/movimientos'));
    } else {
      this.snackBar.open(message, undefined, { duration: NOTICE_MS });
    }
  }
}
